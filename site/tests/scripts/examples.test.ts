import { type spawnSync, spawnSync as spawnSyncReal } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
	checkExamples,
	checkProofs,
	checkSource,
	FIXTURE_TIMEOUT_MS,
	FLOOR,
	interpreters,
	lessonProofs,
	namesPath,
	predictTags,
	pythonVersion,
	runFixture,
	stripCommentsAndDocstrings,
	textFenceLines,
	UNRUN_EXEMPT,
	unrunFixtures,
	usesModule,
	walkMdx,
} from '../../scripts/lib/examples.mjs';
import { type CheckpointAttr, propValue } from '../../src/lib/checkpoint-tags';

/**
 * A stand-in for `spawnSync` that answers `python3` and `python3.9` with the
 * given versions. The lib reads only `error`, `status`, `stdout` and `stderr`,
 * so the cast covers the fields of `SpawnSyncReturns` it never touches.
 */
function fakeSpawn(versions: Record<string, string | { error?: string; status?: number; stderr?: string }>) {
	const fake = (cmd: string) => {
		const v = versions[cmd];
		if (v === undefined) return { error: new Error(`spawnSync ${cmd} ENOENT`), status: null, stdout: '', stderr: '' };
		if (typeof v === 'string') return { status: 0, stdout: `${v}\n`, stderr: '' };
		if (v.error) return { error: new Error(v.error), status: null, stdout: '', stderr: '' };
		return { status: v.status ?? 1, stdout: '', stderr: v.stderr ?? '' };
	};
	return fake as unknown as typeof spawnSync;
}

describe('predictTags', () => {
	const cases: [string, string, Record<string, string | undefined>][] = [
		['plain', '<Predict id="a" answer="x" run="r.py" />', { id: 'a', answer: 'x', run: 'r.py' }],
		['gt in attr', '<Predict id="a" answer="a > b" run="r.py" />', { answer: 'a > b', run: 'r.py' }],
		[
			'template literal',
			'<Predict id="a"\n  answer={`1. > x\n2. y`} run="r.py" />',
			{ answer: '1. > x\n2. y', run: 'r.py' },
		],
		['with a body', '<Predict id="a" answer="1>2" run="r.py">\n  body\n</Predict>', { answer: '1>2', run: 'r.py' }],
		['no run', '<Predict id="a" answer="x" />', { id: 'a', answer: 'x', run: undefined }],
		['single quotes', "<Predict id='a' answer='x' />", { id: 'a', answer: 'x' }],
	];
	it.each(cases)('%s', (_label, src, want) => {
		const tags = predictTags(src, 'f.mdx');
		expect(tags).toHaveLength(1);
		for (const [k, v] of Object.entries(want))
			expect(propValue(tags[0]?.attrs as Map<string, CheckpointAttr>, k)).toBe(v);
	});
	it('reads the answer as the page shows it: the compiler strips up to two spaces from a continuation line (#286)', () => {
		const tags = predictTags('<Predict id="a"\n  answer={`x\n   y\n  z`} run="r.py" />', 'f.mdx');
		expect(propValue(tags[0]?.attrs as Map<string, CheckpointAttr>, 'answer')).toBe('x\n y\nz');
	});
	it('finds several tags in source order with their lines, and skips other components', () => {
		const many = predictTags(
			'<Predict id="a" answer="1>2"> body </Predict>\n<Choice id="c" answer="q" />\n<Predict id="b" run="x.py" />',
			'f.mdx',
		);
		expect(many).toHaveLength(2);
		expect(propValue(many[1]?.attrs as Map<string, CheckpointAttr>, 'run')).toBe('x.py');
		expect(many.map((t) => t.line)).toEqual([1, 3]);
	});
	it('skips a Predict quoted in a comment, a fence or a code span, which the page shows and does not run', () => {
		const src = [
			'{/* <Predict id="c" answer="x" run="in-comment.py" /> */}',
			'',
			'```mdx',
			'<Predict id="f" answer="x" run="in-fence.py" />',
			'```',
			'',
			'Write `<Predict id="s" answer="x" run="in-span.py" />` in the page.',
			'',
			'<Predict id="real" answer="hello" run="x.py" />',
		].join('\n');
		expect(predictTags(src, 'f.mdx').map((t) => propValue(t.attrs, 'run'))).toEqual(['x.py']);
		const res = checkSource('f.mdx', src, () => ({ status: 0, stdout: 'hello', stderr: '' }));
		expect(res).toEqual({ found: 1, checked: 1, failures: [], runs: ['x.py'] });
	});
	it('throws on a page that does not parse, naming the file', () => {
		expect(() => predictTags('<Predict id="a" answer={`open', 'f.mdx')).toThrow(/^f\.mdx: /);
	});
	it('throws on a run prop that is not a literal, and on a non-string answer', () => {
		expect(() => predictTags('<Predict id="a" answer="x" run={runName} />', 'f.mdx')).toThrow(/is not a literal/);
		expect(() => predictTags('<Predict id="a" answer={1} run="x.py" />', 'f.mdx')).toThrow(
			'f.mdx #a: answer must be a string, got number',
		);
	});
});

describe('checkSource', () => {
	const ok = () => ({ status: 0, stdout: 'hello', stderr: '' });
	it('counts a matching example', () => {
		const res = checkSource('f.mdx', '<Predict id="a" answer="hello" run="x.py" />', ok);
		expect(res).toEqual({ found: 1, checked: 1, failures: [], runs: ['x.py'] });
	});
	it('accepts trailing whitespace in the answer', () => {
		const res = checkSource('f.mdx', '<Predict id="a" answer="hello\n" run="x.py" />', ok);
		expect(res.failures).toEqual([]);
	});
	it('reports a mismatch with both outputs', () => {
		const res = checkSource('f.mdx', '<Predict id="a" answer="bye" run="x.py" />', ok);
		expect(res.checked).toBe(1);
		expect(res.failures[0]).toContain('expected: "bye"');
		expect(res.failures[0]).toContain('actual:   "hello"');
	});
	it('reports a non-zero exit with stderr', () => {
		const res = checkSource('f.mdx', '<Predict id="a" answer="x" run="x.py" />', () => ({
			status: 2,
			stdout: '',
			stderr: 'boom',
		}));
		expect(res.failures[0]).toMatch(/exited 2\nboom/);
	});
	it('reports a run that could not start or timed out, with the interpreter label', () => {
		const res = checkSource('f.mdx', '<Predict id="a" answer="x" run="x.py" />', () => ({
			error: 'cannot run x.py with python3: did not finish within 30s',
		}));
		expect(res).toMatchObject({ found: 1, checked: 1 });
		expect(res.failures).toEqual(['f.mdx #a: [python3] cannot run x.py with python3: did not finish within 30s']);
	});
	it('reports a run without an answer, an unsupported fixture, and a run the parser missed', () => {
		expect(checkSource('f.mdx', '<Predict id="a" run="x.py" />', ok).failures[0]).toContain('no answer');
		const unsupported = checkSource('f.mdx', '<Predict id="a" answer="x" run="x.rb" />', () => ({
			error: 'unsupported fixture type .rb',
		}));
		expect(unsupported.failures[0]).toContain('unsupported fixture type .rb');
		expect(unsupported.checked).toBe(0);
		const missed = checkSource('f.mdx', '<Predict id="a" answer="x" run={runName} />', ok);
		expect(missed).toMatchObject({ found: 0, checked: 0 });
		expect(missed.failures[0]).toMatch(/^f\.mdx: cannot read run=\{\.\.\.\} of <Predict>: Identifier is not a literal/);
	});
	it('checks an ungraded example (no objective) like any other run', () => {
		const res = checkSource('f.mdx', '<Predict id="e" title="T" answer="hello" run="x.py" />', ok);
		expect(res).toEqual({ found: 1, checked: 1, failures: [], runs: ['x.py'] });
	});
	it('fails a tag with run="" instead of skipping it', () => {
		const res = checkSource('f.mdx', '<Predict id="a" answer="x" run="" />', ok);
		expect(res.found).toBe(1);
		expect(res.failures[0]).toContain('unsupported fixture type');
	});
	it('ignores an honor-system predict', () => {
		expect(checkSource('f.mdx', '<Predict id="a" title="t" />', ok)).toEqual({
			found: 0,
			checked: 0,
			failures: [],
			runs: [],
		});
	});
	it('runs every interpreter, labels a failure with the one that produced it, and checks the file type once', () => {
		const interps = [
			{ label: 'python 3.14.7', cmd: 'python3' },
			{ label: 'python 3.9.25', cmd: 'python3.9' },
		];
		const seen: string[] = [];
		const byInterp = (_name: string, interp: { cmd: string }) => {
			seen.push(interp.cmd);
			return interp.cmd === 'python3.9' ? { status: 1, stdout: '', stderr: 'TypeError' } : ok();
		};
		const res = checkSource('f.mdx', '<Predict id="a" answer="hello" run="x.py" />', byInterp, interps);
		expect(seen).toEqual(['python3', 'python3.9']);
		expect(res.checked).toBe(2);
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]).toMatch(/x\.py \[python 3\.9\.25\] exited 1\nTypeError/);
		const bad = checkSource('f.mdx', '<Predict id="a" answer="hello" run="x.sh" />', byInterp, interps);
		expect(bad.failures).toEqual([
			'f.mdx #a: unsupported fixture type .sh; fixtures are Python scripts (S03 "Examples")',
		]);
		expect(seen).toHaveLength(2);
	});
});

describe('pythonVersion and interpreters', () => {
	it('reads the version from the interpreter', () => {
		expect(pythonVersion('python3', fakeSpawn({ python3: '3.14.7' }))).toEqual({ version: '3.14.7' });
	});
	it('reports a spawn error, a non-zero exit with stderr, and a silent non-zero exit', () => {
		expect(pythonVersion('nope', fakeSpawn({}))).toEqual({ error: 'spawnSync nope ENOENT' });
		expect(pythonVersion('x', fakeSpawn({ x: { status: 2, stderr: 'bad\n' } }))).toEqual({ error: 'bad' });
		expect(pythonVersion('x', fakeSpawn({ x: { status: 2 } }))).toEqual({ error: 'exited 2' });
	});
	it('lists the current pin and the floor with their versions', () => {
		expect(interpreters(fakeSpawn({ python3: '3.14.7', 'python3.9': '3.9.25' }))).toEqual({
			list: [
				{ label: 'python 3.14.7', cmd: 'python3' },
				{ label: 'python 3.9.25', cmd: `python${FLOOR}` },
			],
		});
	});
	it('fails when the floor is missing, is the wrong version, or when python3 is itself the floor', () => {
		expect(interpreters(fakeSpawn({ python3: '3.14.7' })).error).toMatch(/cannot run python3\.9 .*mise install/);
		expect(interpreters(fakeSpawn({ python3: '3.14.7', 'python3.9': '3.10.1' })).error).toBe(
			'python3.9 is Python 3.10.1, expected 3.9.x',
		);
		expect(interpreters(fakeSpawn({ python3: '3.9.6', 'python3.9': '3.9.25' })).error).toMatch(
			/python3 is Python 3\.9\.6, the floor/,
		);
	});
	it('finds both pinned interpreters on this machine', () => {
		const res = interpreters();
		expect(res.error).toBeUndefined();
		expect(res.list?.map((i) => i.cmd)).toEqual(['python3', 'python3.9']);
		expect(res.list?.[1]?.label).toMatch(/^python 3\.9\.\d+$/);
	});
});

describe('runFixture and checkExamples', () => {
	const dir = mkdtempSync(join(tmpdir(), 'examples-'));
	const content = join(dir, 'content');
	const examples = join(dir, 'examples');
	mkdirSync(join(content, 'area'), { recursive: true });
	mkdirSync(examples);
	writeFileSync(join(examples, 'hi.py'), 'print("hi")\n');
	writeFileSync(join(examples, 'bye.py'), 'print("bye")\n');
	writeFileSync(join(examples, 'fail.py'), 'import sys\nprint("nope", file=sys.stderr)\nsys.exit(3)\n');
	writeFileSync(join(examples, 'hi.sh'), 'echo hi\n');
	writeFileSync(
		join(content, 'area', 'ok.mdx'),
		'<Predict id="a" answer="hi" run="hi.py" />\n<Predict id="b" answer="bye" run="bye.py" />\n',
	);
	writeFileSync(join(content, 'skip.md'), '<Predict id="z" answer="hi" run="hi.py" />');
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it('walks only .mdx files', () => {
		expect([...walkMdx(content)]).toEqual([join(content, 'area', 'ok.mdx')]);
	});
	it('runs Python fixtures and rejects every other file type, shell scripts included', () => {
		expect(runFixture(examples, 'hi.py')).toMatchObject({ status: 0, stdout: 'hi' });
		expect(runFixture(examples, 'fail.py')).toMatchObject({ status: 3, stderr: 'nope\n' });
		expect(runFixture(examples, 'hi.sh')).toEqual({
			error: 'unsupported fixture type .sh; fixtures are Python scripts (S03 "Examples")',
		});
		expect(runFixture(examples, 'x.rb').error).toContain('unsupported fixture type .rb');
	});
	it('fails a fixture whose interpreter cannot start, naming the interpreter', () => {
		const res = runFixture(examples, 'hi.py', { label: 'missing', cmd: 'python-nope' }, fakeSpawn({}));
		expect(res).toEqual({ error: 'cannot run hi.py with python-nope: spawnSync python-nope ENOENT' });
	});
	it('passes the timeout to spawnSync and fails a hung fixture with a clear message', () => {
		const seen: { timeout?: number }[] = [];
		const hung = ((_cmd: string, _args: string[], opts: { timeout?: number }) => {
			seen.push(opts);
			return { error: Object.assign(new Error('spawnSync python3 ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null };
		}) as unknown as typeof spawnSync;
		const res = runFixture(examples, 'hi.py', { label: 'python3', cmd: 'python3' }, hung);
		expect(seen[0]?.timeout).toBe(FIXTURE_TIMEOUT_MS);
		expect(res).toEqual({
			error: `cannot run hi.py with python3: did not finish within ${FIXTURE_TIMEOUT_MS / 1000}s`,
		});
	});
	it('really stops a fixture that never exits', () => {
		writeFileSync(join(examples, 'hang.py'), 'import time\nwhile True:\n    time.sleep(1)\n');
		const spawnShort = ((cmd: string, args: string[], opts: object) =>
			spawnSyncReal(cmd, args, { ...opts, timeout: 200 })) as unknown as typeof spawnSync;
		const res = runFixture(examples, 'hang.py', undefined, spawnShort);
		expect(res.error).toMatch(/cannot run hang\.py with python3: did not finish within/);
	});
	it('runs a fixture with the interpreter it is given', () => {
		writeFileSync(join(examples, 'version.py'), 'import sys\nprint(sys.version_info[0], sys.version_info[1])\n');
		const floor = FLOOR.split('.').join(' ');
		expect(runFixture(examples, 'version.py', { label: 'floor', cmd: `python${FLOOR}` })).toMatchObject({
			status: 0,
			stdout: floor,
		});
	});
	it('checks a content tree against its fixtures on both interpreters', () => {
		const res = checkExamples(content, examples, undefined, undefined, new Map());
		expect(res).toMatchObject({ found: 2, checked: 4, failures: [] });
		expect(res.interpreters).toHaveLength(2);
		expect(res.interpreters[1]).toMatch(/^python 3\.9\./);
	});
	it('fails without running anything when an interpreter is missing', () => {
		const res = checkExamples(content, examples, undefined, { error: 'no floor' });
		expect(res).toEqual({ found: 0, proofs: 0, checked: 0, failures: ['no floor'], interpreters: [] });
	});
	it('fails when no example exists at all', () => {
		const empty = join(dir, 'empty');
		mkdirSync(empty);
		const res = checkExamples(empty, examples);
		expect(res.failures[0]).toContain('no <Predict run=...> examples found');
	});
});

describe('usesModule', () => {
	const uses: [string, string][] = [
		['import agent\n', 'plain import'],
		['import agent  # noqa: E402\n', 'import with a comment'],
		['import os, agent\n', 'second name in an import list'],
		['import agent as a\n', 'import as'],
		['    from agent import run\n', 'indented from-import'],
		['subprocess.run([sys.executable, "-m", "pytest", "test_agent.py"])\n', 'file name in double quotes'],
		["shutil.copy(os.path.join(HERE, 'agent.py'), dst)\n", 'file name in single quotes'],
	];
	it.each(uses)('%j counts as a use (%s)', (src) => {
		const stem = src.includes('test_agent') ? 'test_agent' : 'agent';
		expect(usesModule(src, stem)).toBe(true);
	});
	const misses: [string, string][] = [
		['import agents\n', 'a longer module name'],
		['import agent.tools\n', 'a submodule of a package with the same name'],
		['from agent_loop import run\n', 'a module whose name starts with the stem'],
		['# the agent loop runs here\n', 'the word in a comment'],
		['print("my_agent.py")\n', 'a file name that ends with the stem'],
		['x = 1  # import agent\n', 'an import in a trailing comment'],
		['"""Imports the loop from agent.py and prints it."""\n', 'the file name in a docstring'],
		['# Run `python3 agent.py` first.\n', 'the file name in a backtick code span'],
		['print("$ python3 agent.py")\n', 'the file name inside a longer string'],
		['print("agent.py\')\n', 'mismatched quotes'],
	];
	it.each(misses)('%j is not a use (%s)', (src) => {
		expect(usesModule(src, 'agent')).toBe(false);
	});
});

describe('unrunFixtures', () => {
	const dir = mkdtempSync(join(tmpdir(), 'unrun-'));
	const lesson = join(dir, 'area', 'lesson');
	mkdirSync(join(lesson, 'fixture-repo'), { recursive: true });
	mkdirSync(join(lesson, '__pycache__'));
	writeFileSync(join(lesson, 'run_me.py'), 'import agent\nagent.main()\n');
	writeFileSync(join(lesson, 'agent.py'), 'def main():\n    print("hi")\n');
	writeFileSync(join(lesson, '_common.py'), 'REPO = os.path.join(HERE, "fixture-repo")\n');
	writeFileSync(join(lesson, 'tests.py'), 'import subprocess\nsubprocess.run(["python3", "test_x.py"])\n');
	writeFileSync(join(lesson, 'test_x.py'), 'print("ok")\n');
	writeFileSync(join(lesson, 'notes.txt'), 'data\n');
	writeFileSync(join(lesson, 'fixture-repo', 'todo.py'), 'print("todo")\n');
	writeFileSync(join(dir, 'ruff.toml'), '');
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	const runs = new Set(['area/lesson/run_me.py', 'area/lesson/tests.py']);

	it('passes when every entry script is run, skipping helpers, used modules, data and files in a named directory', () => {
		expect(unrunFixtures(dir, runs, new Map())).toEqual([]);
	});
	it('fails on an entry script that no Predict runs, naming it and the way out', () => {
		writeFileSync(join(lesson, 'exercise.py'), 'print("prose only")\n');
		try {
			const failures = unrunFixtures(dir, runs, new Map());
			expect(failures).toHaveLength(1);
			expect(failures[0]).toMatch(/^examples\/area\/lesson\/exercise\.py: no <Predict run=\.\.\.> runs this fixture/);
			expect(failures[0]).toContain('UNRUN_EXEMPT');
			expect(unrunFixtures(dir, runs, new Map([['area/lesson/exercise.py', 'described in prose']]))).toEqual([]);
		} finally {
			rmSync(join(lesson, 'exercise.py'));
		}
	});
	it('fails on a module whose only user is gone', () => {
		expect(unrunFixtures(dir, new Set(['area/lesson/tests.py']), new Map())).toEqual([
			expect.stringMatching(/^examples\/area\/lesson\/run_me\.py: /),
		]);
	});
	it('fails on a stale or empty exemption', () => {
		const exempt = new Map([
			['area/lesson/run_me.py', 'run now'],
			['area/lesson/agent.py', 'a used module'],
			['area/lesson/fixture-repo/todo.py', 'in a named directory'],
			['area/lesson/gone.py', 'deleted'],
			['area/lesson/exercise.py', ''],
		]);
		writeFileSync(join(lesson, 'exercise.py'), 'print("prose only")\n');
		try {
			expect(unrunFixtures(dir, runs, exempt)).toEqual([
				"UNRUN_EXEMPT area/lesson/run_me.py: a <Predict run=...> or a lesson file's proofs runs it now; drop the entry",
				'UNRUN_EXEMPT area/lesson/agent.py: is a helper another fixture uses, not an entry script; drop the entry',
				'UNRUN_EXEMPT area/lesson/fixture-repo/todo.py: a lesson-level fixture names this file or a directory that contains it; drop the entry',
				'UNRUN_EXEMPT area/lesson/gone.py: names no entry script; drop the entry',
				'UNRUN_EXEMPT area/lesson/exercise.py: has no reason',
			]);
		} finally {
			rmSync(join(lesson, 'exercise.py'));
		}
	});
	it('is part of checkExamples once examples are found', () => {
		const content = join(dir, 'content');
		mkdirSync(content);
		writeFileSync(join(content, 'p.mdx'), '<Predict id="a" answer="hi" run="area/lesson/run_me.py" />\n');
		const run = () => ({ status: 0, stdout: 'hi', stderr: '' });
		const interps = { list: [{ label: 'python3', cmd: 'python3' }] };
		const res = checkExamples(content, dir, run, interps, new Map());
		expect(res.failures).toEqual([expect.stringMatching(/^examples\/area\/lesson\/tests\.py: /)]);
		expect(checkExamples(content, dir, run, interps, new Map([['area/lesson/tests.py', 'r']])).failures).toEqual([]);
	});
	it('gives every real exemption a reason', () => {
		for (const [path, reason] of UNRUN_EXEMPT) {
			expect(path).toMatch(/^[^/]+\/[^/]+\/(?:[^/_][^/]*|(?:[^/]+\/)+[^/]+)\.py$/);
			expect(reason.length).toBeGreaterThan(20);
		}
	});
});

describe('unrunFixtures below the lesson directory (#468)', () => {
	/** One lesson with `run.py` (run by a Predict) holding `src`, and the deep `.py` files in `deep`. */
	function lessonWith(src: string, deep: string[]) {
		const dir = mkdtempSync(join(tmpdir(), 'unrun-deep-'));
		const lesson = join(dir, 'area', 'lesson');
		mkdirSync(lesson, { recursive: true });
		writeFileSync(join(lesson, 'run.py'), src);
		for (const rel of deep) {
			const parts = rel.split('/');
			mkdirSync(join(lesson, ...parts.slice(0, -1)), { recursive: true });
			writeFileSync(join(lesson, ...parts), 'print("deep")\n');
		}
		return dir;
	}
	const runs = new Set(['area/lesson/run.py']);
	const dirs: string[] = [];
	afterAll(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
	});
	const check = (src: string, deep: string[], exempt = new Map<string, string>()) => {
		const dir = lessonWith(src, deep);
		dirs.push(dir);
		return unrunFixtures(dir, runs, exempt);
	};
	const reported = (path: string) =>
		`examples/area/lesson/${path}: no <Predict run=...> runs this fixture, so CI never checks its output; name it in a run= (on a foundations page, in the lesson file's proofs) or add it to UNRUN_EXEMPT with the reason (docs/agents/testing.md)`;

	it('passes a deep file a lesson-level fixture names directly', () => {
		expect(check('subprocess.run(["python3", "nightly/importer.py"])\n', ['nightly/importer.py'])).toEqual([]);
	});
	it('passes a deep file in a directory a lesson-level fixture names', () => {
		expect(check('SHOP = os.path.join(HERE, "shop")\n', ['shop/check.py', 'shop/test_shipping.py'])).toEqual([]);
	});
	it('passes a deep file two levels down whose parent directory is named', () => {
		expect(check("print(report(HERE / 'release-kit/scripts'))\n", ['release-kit/scripts/changelog_guard.py'])).toEqual(
			[],
		);
		expect(check('from pkg.sub import tool\n', ['pkg/sub/tool.py'])).toEqual([]);
	});
	it('reports a deep file in a directory nothing names', () => {
		expect(check('print("hi")\n', ['library/truncate.py'])).toEqual([reported('library/truncate.py')]);
	});
	it('reports a deep file whose directory is named only in a comment or a docstring', () => {
		const src = '"""Reads the nightly/ directory."""\n# the nightly importer is in nightly/importer.py\nprint(1)\n';
		expect(check(src, ['nightly/importer.py'])).toEqual([reported('nightly/importer.py')]);
	});
	it('reports a deep file when only a sibling directory is named', () => {
		expect(check('REPO = "fixture-repo"\n', ['fixture-repo/todo.py', 'extra/tool.py'])).toEqual([
			reported('extra/tool.py'),
		]);
	});
	it('reports a deep file whose bare name only a lesson-level import or string matches', () => {
		const src = 'import agent\nsubprocess.run(["python3", "-m", "pytest", "test_todo.py"])\n';
		expect(check(src, ['tools/agent.py', 'other/test_todo.py'])).toEqual([
			reported('other/test_todo.py'),
			reported('tools/agent.py'),
		]);
	});
	it('skips .venv, node_modules and dot-directories', () => {
		expect(
			check('print("hi")\n', ['.venv/lib/site.py', 'node_modules/pkg/gyp.py', '.git/hooks/hook.py', 'a/.cache/x.py']),
		).toEqual([]);
	});
	it('does not follow a symlinked directory', () => {
		const dir = lessonWith('print("hi")\n', []);
		dirs.push(dir);
		const outside = mkdtempSync(join(tmpdir(), 'unrun-outside-'));
		dirs.push(outside);
		writeFileSync(join(outside, 'stray.py'), 'print("stray")\n');
		const lesson = join(dir, 'area', 'lesson');
		symlinkSync(outside, join(lesson, 'linked'));
		symlinkSync(lesson, join(lesson, 'loop'));
		expect(unrunFixtures(dir, runs, new Map())).toEqual([]);
	});
	it('takes an UNRUN_EXEMPT entry for a deep path, and fails it once the directory is named', () => {
		const exempt = new Map([['area/lesson/library/truncate.py', 'the learner reads it; the page shows no output']]);
		expect(check('print("hi")\n', ['library/truncate.py'], exempt)).toEqual([]);
		expect(check('LIB = "library"\n', ['library/truncate.py'], exempt)).toEqual([
			'UNRUN_EXEMPT area/lesson/library/truncate.py: a lesson-level fixture names this file or a directory that contains it; drop the entry',
		]);
	});
});

describe('namesPath', () => {
	const names: [string, string, string][] = [
		['SRC = "nightly"\n', 'nightly', 'directory in double quotes'],
		["SRC = 'nightly/'\n", 'nightly', 'directory with a trailing slash'],
		['run("nightly/importer.py")\n', 'nightly/importer.py', 'whole file path'],
		['SRC = "release-kit/scripts"\n', 'release-kit/scripts', 'whole nested directory path'],
		['import nightly.importer\n', 'nightly', 'import of a module in the package'],
		['import nightly.importer\n', 'nightly/importer.py', 'dotted import of the file'],
		['from pkg.sub import tool\n', 'pkg/sub', 'from-import of the package'],
		['from pkg import sub\n', 'pkg', 'from-import from the top package'],
	];
	it.each(names)('%j names %j (%s)', (src, rel) => {
		expect(namesPath(src, rel)).toBe(true);
	});
	const misses: [string, string, string][] = [
		['# see nightly/\n', 'nightly', 'a comment'],
		['"""Copies nightly to a scratch dir."""\n', 'nightly', 'a docstring'],
		['SRC = "nightly_old"\n', 'nightly', 'a longer name'],
		['SRC = "my-nightly"\n', 'nightly', 'a name that ends with it'],
		['print("$ ls nightly")\n', 'nightly', 'a longer string'],
		['import nightly_old\n', 'nightly', 'an import of a longer module'],
		['run("importer.py")\n', 'nightly/importer.py', 'the bare file name'],
		['SRC = "scripts"\n', 'release-kit/scripts', 'the last segment of a nested directory'],
		['import importer\n', 'nightly/importer.py', 'an import of the bare stem'],
		['from importer import run\n', 'nightly/importer.py', 'a from-import of the bare stem'],
	];
	it.each(misses)('%j does not name %j (%s)', (src, rel) => {
		expect(namesPath(src, rel)).toBe(false);
	});
});

describe('stripCommentsAndDocstrings (#557)', () => {
	const cases: [string, string, string][] = [
		['x = 1  # copies "nightly" later\n', 'x = 1  \n', 'a trailing comment'],
		['# Runs "agent.py".\nprint(1)\n', '\nprint(1)\n', 'a comment line'],
		['"""Runs "agent.py"."""\nprint(1)\n', '\nprint(1)\n', 'a module docstring'],
		[
			'#!/usr/bin/env python3\n\n"""Runs\n"agent.py"."""\n',
			'\n\n\n\n',
			'a module docstring after a shebang, keeping its newlines',
		],
		[
			'def f():\n    """Runs \'agent.py\'."""\n    return 1\n',
			'def f():\n    \n    return 1\n',
			'a function docstring',
		],
		['class A:\n    r"""Copies "nightly"."""\n', 'class A:\n    \n', 'a class docstring with a prefix'],
		[
			'async def f(\n    a,\n):\n    """x"""\n',
			'async def f(\n    a,\n):\n    \n',
			'a docstring after a signature on several lines',
		],
		['print("# not a comment")\n', 'print("# not a comment")\n', 'a # inside a string'],
		['x = 1\n"agent.py"\n', 'x = 1\n"agent.py"\n', 'a string that is not the first statement'],
		['if ok:\n    "agent.py"\n', 'if ok:\n    "agent.py"\n', 'a string first in an if body'],
		[
			'def f():\n    run(\n        "agent.py",\n    )\n',
			'def f():\n    run(\n        "agent.py",\n    )\n',
			'a string inside brackets',
		],
		['"""{}""".format("agent.py")\n', '"""{}""".format("agent.py")\n', 'a first string with more code on its line'],
		['s = "a \\" # b"  # c\n', 's = "a \\" # b"  \n', 'an escaped quote inside a string'],
	];
	it.each(cases)('%j becomes %j (%s)', (src, want) => {
		expect(stripCommentsAndDocstrings(src)).toBe(want);
	});
	it('makes usesModule ignore a quoted name in a comment or a docstring', () => {
		expect(usesModule('# copies "agent.py" later\n', 'agent')).toBe(false);
		expect(usesModule('"""Runs "agent.py"."""\n', 'agent')).toBe(false);
		expect(usesModule('def f():\n    """Runs \'agent.py\'."""\n', 'agent')).toBe(false);
		expect(usesModule('run("agent.py")  # "other.py"\n', 'agent')).toBe(true);
	});
	it('makes namesPath ignore a quoted name in a comment or a docstring', () => {
		expect(namesPath('# copies "nightly" later\n', 'nightly')).toBe(false);
		expect(namesPath('"""Runs "nightly/importer.py"."""\n', 'nightly/importer.py')).toBe(false);
		expect(namesPath('class A:\n    """Reads \'nightly/\'."""\n', 'nightly')).toBe(false);
		expect(namesPath('SRC = "nightly"  # "other"\n', 'nightly')).toBe(true);
	});

	const dirs: string[] = [];
	afterAll(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
	});
	/** One lesson with `run.py` (run by a Predict) holding `src`, `agent.py` and `nightly/importer.py`. */
	const check = (src: string) => {
		const dir = mkdtempSync(join(tmpdir(), 'unrun-strip-'));
		dirs.push(dir);
		const lesson = join(dir, 'area', 'lesson');
		mkdirSync(join(lesson, 'nightly'), { recursive: true });
		writeFileSync(join(lesson, 'run.py'), src);
		writeFileSync(join(lesson, 'agent.py'), 'print("agent")\n');
		writeFileSync(join(lesson, 'nightly', 'importer.py'), 'print("deep")\n');
		return unrunFixtures(dir, new Set(['area/lesson/run.py']), new Map());
	};
	const both = [
		expect.stringMatching(/^examples\/area\/lesson\/agent\.py: no <Predict/),
		expect.stringMatching(/^examples\/area\/lesson\/nightly\/importer\.py: no <Predict/),
	];
	it('reports a lesson-level and a deep file quoted only in a comment', () => {
		expect(check('# runs "agent.py" and copies "nightly" later\nprint(1)\n')).toEqual(both);
	});
	it('reports a lesson-level and a deep file quoted only in a docstring', () => {
		expect(check('"""Runs "agent.py" and "nightly/importer.py"."""\nprint(1)\n')).toEqual(both);
		expect(check('def main():\n    """Runs \'agent.py\' and \'nightly\'."""\n')).toEqual(both);
	});
	it('still passes both files when code names them', () => {
		expect(check('"""Runs the agent."""\nrun("agent.py")  # and "nightly"\nSRC = "nightly"\n')).toEqual([]);
	});
});

describe('proofs of a foundations page (#497)', () => {
	const PAGE = [
		'Counted, the two come out like this.',
		'',
		'```text',
		'short: 111 tokens   ',
		'    one call   1,000 calls',
		'```',
		'',
		'<Aside>',
		'',
		'```text',
		'in an aside: 2',
		'```',
		'',
		'</Aside>',
		'',
		'```sh',
		'shell: 3',
		'```',
		'',
		'{/* ```text',
		'in a comment: 4',
		'``` */}',
		'',
	].join('\n');
	const interps = [
		{ label: 'current', cmd: 'python3' },
		{ label: 'floor', cmd: 'python3.9' },
	];
	const prints =
		(stdout: string, status = 0) =>
		() => ({ status, stdout, stderr: status ? 'boom\n' : '' });

	it('reads the lines of every text fence, trailing whitespace trimmed, and skips other fences and comments', () => {
		expect([...textFenceLines(PAGE, 'p.mdx')]).toEqual([
			'short: 111 tokens',
			'    one call   1,000 calls',
			'in an aside: 2',
		]);
	});
	it('passes a proof whose every non-blank line a text fence shows, on every interpreter', () => {
		const out = 'short: 111 tokens\n\n    one call   1,000 calls  \nin an aside: 2';
		expect(checkProofs('p.mdx', PAGE, ['a/b/p.py'], prints(out), interps)).toEqual({ checked: 2, failures: [] });
	});
	it('fails a proof that prints a changed line, once per interpreter, naming the line', () => {
		const res = checkProofs('p.mdx', PAGE, ['a/b/p.py'], prints('short: 112 tokens\nin an aside: 2'), interps);
		expect(res.checked).toBe(2);
		expect(res.failures).toEqual([
			'p.mdx: proof a/b/p.py [current] prints 1 line(s) no text fence on the page shows:\n  "short: 112 tokens"',
			'p.mdx: proof a/b/p.py [floor] prints 1 line(s) no text fence on the page shows:\n  "short: 112 tokens"',
		]);
	});
	it('fails a line that only a sh fence, a comment or the prose shows, and a line whose indentation changed', () => {
		const res = checkProofs(
			'p.mdx',
			PAGE,
			['a/b/p.py'],
			prints('shell: 3\nin a comment: 4\nCounted, the two come out like this.\none call   1,000 calls'),
			interps.slice(0, 1),
		);
		expect(res.failures[0]).toMatch(/prints 4 line\(s\)/);
	});
	it('fails a proof that exits 1, that cannot run, or that is not a Python script', () => {
		expect(checkProofs('p.mdx', PAGE, ['a/b/p.py'], prints('short: 111 tokens', 1), interps.slice(0, 1))).toEqual({
			checked: 1,
			failures: ['p.mdx: proof a/b/p.py [current] exited 1\nboom\n'],
		});
		expect(
			checkProofs('p.mdx', PAGE, ['a/b/p.py'], () => ({ error: 'cannot run a/b/p.py with python3: nope' }), interps)
				.failures,
		).toHaveLength(2);
		expect(checkProofs('p.mdx', PAGE, ['a/b/p.sh'], prints(''), interps)).toEqual({
			checked: 0,
			failures: ['p.mdx: proof a/b/p.sh: unsupported fixture type .sh; fixtures are Python scripts (S03 "Examples")'],
		});
	});
	it('runs nothing for a page without proofs', () => {
		const run = () => {
			throw new Error('ran');
		};
		expect(checkProofs('p.mdx', 'no fences\n', [], run, interps)).toEqual({ checked: 0, failures: [] });
	});

	describe('through checkExamples', () => {
		const dir = mkdtempSync(join(tmpdir(), 'proofs-'));
		const content = join(dir, 'src', 'content', 'docs');
		const areas = join(dir, 'src', 'data', 'areas');
		const examples = join(dir, 'examples');
		mkdirSync(join(content, 'eng'), { recursive: true });
		mkdirSync(join(content, 'found'), { recursive: true });
		mkdirSync(join(areas, 'found', 'lessons'), { recursive: true });
		mkdirSync(join(examples, 'eng', 'x'), { recursive: true });
		mkdirSync(join(examples, 'found', 'y'), { recursive: true });
		writeFileSync(join(examples, 'eng', 'x', 'shown.py'), 'print("hi")\n');
		writeFileSync(join(examples, 'found', 'y', 'hidden.py'), 'print("total: 3")\nprint()\nprint("per call: 1")\n');
		writeFileSync(join(content, 'eng', 'x.mdx'), '<Predict id="a" answer="hi" run="eng/x/shown.py" />\n');
		writeFileSync(join(content, 'found', 'y.mdx'), 'The total.\n\n```text\ntotal: 3\nper call: 1\n```\n');
		writeFileSync(join(content, 'found', 'index.mdx'), '```text\nthe course page\n```\n');
		const lessonFile = join(areas, 'found', 'lessons', 'y.yaml');
		const withProofs = 'id: found/y\nproofs: [found/y/hidden.py]\n';
		writeFileSync(lessonFile, withProofs);
		afterAll(() => rmSync(dir, { recursive: true, force: true }));
		const one = { list: [{ label: 'python3', cmd: 'python3' }] };

		it('finds the lesson file from the page, next to the content tree by default', () => {
			expect(lessonProofs(content, areas, join(content, 'found', 'y.mdx'))).toEqual({
				proofs: ['found/y/hidden.py'],
			});
			expect(lessonProofs(content, areas, join(content, 'found', 'index.mdx'))).toEqual({ proofs: [] });
			expect(lessonProofs(content, areas, join(content, 'eng', 'x.mdx'))).toEqual({ proofs: [] });
		});
		it('runs a listed proof for real and counts it as run, so no UNRUN_EXEMPT entry is needed', () => {
			const res = checkExamples(content, examples, undefined, one, new Map());
			expect(res).toMatchObject({ found: 1, proofs: 1, checked: 2, failures: [] });
		});
		it('fails the page when the proof prints a line the page does not show', () => {
			writeFileSync(join(examples, 'found', 'y', 'hidden.py'), 'print("total: 4")\nprint("per call: 1")\n');
			try {
				const res = checkExamples(content, examples, undefined, one, new Map());
				expect(res.failures).toEqual([
					`${join(content, 'found', 'y.mdx')}: proof found/y/hidden.py [python3] prints 1 line(s) no text fence on the page shows:\n  "total: 4"`,
				]);
			} finally {
				writeFileSync(join(examples, 'found', 'y', 'hidden.py'), 'print("total: 3")\nprint("per call: 1")\n');
			}
		});
		it('fails an UNRUN_EXEMPT entry for a fixture a proof runs', () => {
			const exempt = new Map([['found/y/hidden.py', 'foundations page, not wired yet']]);
			expect(checkExamples(content, examples, undefined, one, exempt).failures).toEqual([
				"UNRUN_EXEMPT found/y/hidden.py: a <Predict run=...> or a lesson file's proofs runs it now; drop the entry",
			]);
		});
		it('reports the fixture as unrun once the lesson file drops it', () => {
			writeFileSync(lessonFile, 'id: found/y\n');
			try {
				expect(checkExamples(content, examples, undefined, one, new Map()).failures).toEqual([
					expect.stringMatching(/^examples\/found\/y\/hidden\.py: no <Predict run=\.\.\.> runs this fixture/),
				]);
			} finally {
				writeFileSync(lessonFile, withProofs);
			}
		});
		it('fails a lesson file whose proofs is not a list of paths', () => {
			writeFileSync(lessonFile, 'id: found/y\nproofs: found/y/hidden.py\n');
			try {
				expect(checkExamples(content, examples, undefined, one, new Map()).failures).toContain(
					`${lessonFile}: proofs is not a list of fixture paths`,
				);
			} finally {
				writeFileSync(lessonFile, withProofs);
			}
		});
	});
});
