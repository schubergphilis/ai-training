/**
 * The example runner's logic (spec S03 "Examples"): find every `<Predict
 * run="..." answer="...">` in the lesson sources, run the fixture it names
 * under site/examples/ (a Python script), and compare stdout with the answer the
 * learner sees.
 *
 * Every fixture runs on two interpreters, `python3` (the current pin in
 * .mise.toml) and `python3.9` (the floor pin), and both must print the
 * answer. The floor exists because the fixture is what a learner runs on
 * their own machine, and a stock Mac's `python3` is 3.9 (spec S03
 * "Examples"). Each interpreter is asked for its version first, so a missing
 * pin or a wrong `python3` on PATH fails loudly instead of testing one
 * interpreter twice.
 *
 * The tags come from the MDX tree, through the reader in
 * `src/lib/checkpoint-tags.ts`, so the answer compared is the one the page
 * shows (#286).
 *
 * A foundations page may not carry a `<Predict run=...>` (S03 "Foundations
 * audience"), so its lesson file lists the fixtures behind it in `proofs`
 * (S11 "Lesson file", #497). Each proof runs on the same interpreters, and
 * every non-blank line it prints must be a line of a `text` fence on the
 * page (`checkProofs`).
 *
 * `scripts/check-examples.mjs` is the command-line entry; tests import this.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { attrsOf, jsxElements, parseMdx, propValue, stringProp } from '../../src/lib/checkpoint-tags.ts';

/** Every `.mdx` file under `dir`, recursively. */
export function* walkMdx(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* walkMdx(p);
		else if (name.endsWith('.mdx')) yield p;
	}
}

/**
 * Every `<Predict ...>` tag in a lesson source, in source order, as
 * `{ attrs: Map<string, CheckpointAttr>, line }` (1-based line of the tag),
 * read from the MDX tree the page build parses (`src/lib/checkpoint-tags.ts`).
 * The tree is the truth for the `answer` the learner sees: the MDX compiler
 * strips the indentation of continuation lines in an `answer={`...`}`
 * template literal, and a reader of the source text would miss that (#286).
 * A parse error, a spread prop, a non-literal expression prop
 * (`run={name}`) or a non-string `id`, `run` or `answer` throws, with
 * `where` in the message.
 */
export function predictTags(src, where) {
	let tree;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${e.message}`);
	}
	const out = [];
	for (const node of jsxElements(tree)) {
		if (node.name !== 'Predict') continue;
		const attrs = attrsOf(node, where);
		const id = stringProp(where, attrs, 'id') ?? '?';
		stringProp(`${where} #${id}`, attrs, 'run');
		stringProp(`${where} #${id}`, attrs, 'answer');
		out.push({ attrs, line: node.position?.start.line ?? 0 });
	}
	return out;
}

/** The Python floor for fixtures, as `major.minor` (spec S03 "Examples"). */
export const FLOOR = '3.9';

const fixtureEnv = { ...process.env, PYTHON_COLORS: '0', NO_COLOR: '1' };

/** The error for a fixture name that is not a Python script, or `null`. */
export function fixtureTypeError(run) {
	const ext = extname(run);
	if (ext === '.py') return null;
	return `unsupported fixture type ${ext}; fixtures are Python scripts (S03 "Examples")`;
}

/**
 * `major.minor.micro` of the interpreter `cmd`, or `{ error }` if it can't
 * run. `spawn` is injectable for tests.
 */
export function pythonVersion(cmd, spawn = spawnSync) {
	const res = spawn(cmd, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'], {
		encoding: 'utf8',
		env: fixtureEnv,
	});
	if (res.error) return { error: res.error.message };
	if (res.status !== 0) return { error: (res.stderr ?? '').trim() || `exited ${res.status}` };
	return { version: (res.stdout ?? '').trim() };
}

/**
 * The interpreters every fixture must pass on, as `{ label, cmd }`: the
 * current pin (`python3`) and the floor (`python3.9`), both installed by
 * `mise install` from .mise.toml [tools]. Returns `{ list }` or `{ error }`.
 * A missing or wrong one is an error, not a skip: a run that quietly tested
 * one interpreter twice would look like a pass.
 */
export function interpreters(spawn = spawnSync) {
	const list = [];
	for (const [cmd, want] of [
		['python3', null],
		[`python${FLOOR}`, FLOOR],
	]) {
		const got = pythonVersion(cmd, spawn);
		if (got.error)
			return {
				error: `cannot run ${cmd} (${got.error}); both Python pins in .mise.toml must be installed (mise install)`,
			};
		const minor = got.version.split('.').slice(0, 2).join('.');
		if (want && minor !== want) return { error: `${cmd} is Python ${got.version}, expected ${want}.x` };
		if (!want && minor === FLOOR)
			return {
				error: `python3 is Python ${got.version}, the floor; the current pin from .mise.toml must be first on PATH (run through mise)`,
			};
		list.push({ label: `python ${got.version}`, cmd });
	}
	return { list };
}

/**
 * How long one fixture may run, in milliseconds. A fixture that waits on
 * input or loops would otherwise hang `mise run examples` for good; the
 * slowest real fixture takes well under a second.
 */
export const FIXTURE_TIMEOUT_MS = 30_000;

/**
 * Run one fixture with `interp` (`{ label, cmd }`, default `python3`). Every
 * fixture is a Python script; any other file type is an error. Returns
 * `{ status, stdout, stderr }`, or `{ error }` when the interpreter could not
 * run or the fixture hit `FIXTURE_TIMEOUT_MS`. `spawn` is injectable for
 * tests.
 */
export function runFixture(examplesDir, run, interp = { label: 'python3', cmd: 'python3' }, spawn = spawnSync) {
	const typeError = fixtureTypeError(run);
	if (typeError) return { error: typeError };
	const res = spawn(interp.cmd, [join(examplesDir, run)], {
		encoding: 'utf8',
		env: fixtureEnv,
		timeout: FIXTURE_TIMEOUT_MS,
	});
	if (res.error) {
		const why =
			res.error.code === 'ETIMEDOUT' ? `did not finish within ${FIXTURE_TIMEOUT_MS / 1000}s` : res.error.message;
		return { error: `cannot run ${run} with ${interp.cmd}: ${why}` };
	}
	return { status: res.status, stdout: (res.stdout ?? '').trimEnd(), stderr: res.stderr };
}

const DEFAULT_INTERPRETERS = [{ label: 'python3', cmd: 'python3' }];

/**
 * Check the `<Predict>` tags of one lesson source (`predictTags`). `run(name, interp)`
 * executes a fixture (injectable for tests), once per entry in `interps`.
 * Returns `{ found, checked, failures, runs }`: how many tags name a fixture,
 * how many runs happened, one message per problem, and the `run` names.
 */
export function checkSource(file, src, run, interps = DEFAULT_INTERPRETERS) {
	let checked = 0;
	let found = 0;
	const failures = [];
	const runs = [];
	let tags;
	try {
		tags = predictTags(src, file);
	} catch (e) {
		// A page that does not parse, or a prop the reader cannot read
		// (`run={name}`), is a broken lesson, not an honor-system Predict, so
		// it fails rather than skips.
		return { found: 0, checked: 0, failures: [e.message], runs };
	}
	for (const { attrs } of tags) {
		const id = propValue(attrs, 'id') ?? '?';
		const name = propValue(attrs, 'run');
		const answer = propValue(attrs, 'answer');
		// `run=""` is a mistake, not an honor-system Predict: it falls through and fails as an unsupported fixture type.
		if (name === undefined) continue;
		found++;
		runs.push(name);
		if (answer === undefined) {
			failures.push(`${file} #${id}: has run="${name}" but no answer`);
			continue;
		}
		// Interpreter-independent, so checked once here rather than once per
		// run; `runFixture` repeats it only for callers that skip checkSource.
		const typeError = fixtureTypeError(name);
		if (typeError) {
			failures.push(`${file} #${id}: ${typeError}`);
			continue;
		}
		for (const interp of interps) {
			const res = run(name, interp);
			checked++;
			if (res.error) failures.push(`${file} #${id}: [${interp.label}] ${res.error}`);
			else if (res.status !== 0)
				failures.push(`${file} #${id}: ${name} [${interp.label}] exited ${res.status}\n${res.stderr}`);
			else if (res.stdout !== answer.trimEnd())
				failures.push(
					`${file} #${id}: ${name} [${interp.label}]\n  expected: ${JSON.stringify(answer)}\n  actual:   ${JSON.stringify(res.stdout)}`,
				);
		}
	}
	return { found, checked, failures, runs };
}

/**
 * Every line of every `text` fence in a lesson source, with trailing
 * whitespace trimmed, read from the MDX tree the page build parses. A fence
 * inside a component counts too, and a fence in an MDX comment doesn't,
 * because the page shows only the first. A parse error throws, with `where`
 * in the message.
 */
export function textFenceLines(src, where) {
	let tree;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${e.message}`);
	}
	const lines = new Set();
	const walk = (node) => {
		if (node.type === 'code' && node.lang === 'text')
			for (const line of (node.value ?? '').split('\n')) lines.add(line.trimEnd());
		for (const child of node.children ?? []) walk(child);
	};
	walk(tree);
	return lines;
}

/**
 * The `proofs` list of the lesson file behind the page `file`
 * (`<contentDir>/<area>/<lesson>.mdx` maps to
 * `<areasDir>/<area>/lessons/<lesson>.yaml`, spec S11 "Lesson file"), as
 * `{ proofs }`, or `{ error }` when the file does not parse or `proofs` is
 * not a list of strings. A page that is not a lesson page, or has no lesson
 * file, has no proofs: `mise run data` fails a lesson page without its file.
 */
export function lessonProofs(contentDir, areasDir, file) {
	const parts = relative(contentDir, file).split(sep);
	if (parts.length !== 2 || parts[1] === 'index.mdx') return { proofs: [] };
	const [area, page] = parts;
	const yamlFile = join(areasDir, area, 'lessons', page.replace(/\.mdx$/, '.yaml'));
	if (!existsSync(yamlFile)) return { proofs: [] };
	let data;
	try {
		data = parseYaml(readFileSync(yamlFile, 'utf8'));
	} catch (e) {
		return { error: `${yamlFile}: ${e.message}` };
	}
	const proofs = data?.proofs;
	if (proofs === undefined) return { proofs: [] };
	if (!Array.isArray(proofs) || proofs.some((p) => typeof p !== 'string'))
		return { error: `${yamlFile}: proofs is not a list of fixture paths` };
	return { proofs };
}

/**
 * Check the `proofs` of one lesson page (#497): run each fixture in `proofs`
 * with `run(name, interp)`, once per entry in `interps`, and fail when it
 * doesn't run, exits non-zero, or prints a non-blank line (trailing
 * whitespace trimmed) that is not a line of a `text` fence in `src`
 * (`textFenceLines`). The rule is in spec S03 "Examples". Returns
 * `{ checked, failures }`: how many runs happened and one message per
 * problem.
 */
export function checkProofs(file, src, proofs, run, interps = DEFAULT_INTERPRETERS) {
	let checked = 0;
	const failures = [];
	if (proofs.length === 0) return { checked, failures };
	let shown;
	try {
		shown = textFenceLines(src, file);
	} catch (e) {
		return { checked, failures: [e.message] };
	}
	for (const name of proofs) {
		const typeError = fixtureTypeError(name);
		if (typeError) {
			failures.push(`${file}: proof ${name}: ${typeError}`);
			continue;
		}
		for (const interp of interps) {
			const res = run(name, interp);
			checked++;
			if (res.error) failures.push(`${file}: proof ${name} [${interp.label}] ${res.error}`);
			else if (res.status !== 0)
				failures.push(`${file}: proof ${name} [${interp.label}] exited ${res.status}\n${res.stderr}`);
			else {
				const missing = res.stdout
					.split('\n')
					.map((line) => line.trimEnd())
					.filter((line) => line !== '' && !shown.has(line));
				if (missing.length)
					failures.push(
						`${file}: proof ${name} [${interp.label}] prints ${missing.length} line(s) no text fence on the page shows:\n${missing.map((line) => `  ${JSON.stringify(line)}`).join('\n')}`,
					);
			}
		}
	}
	return { checked, failures };
}

/**
 * Check every lesson under `contentDir` against the fixtures in
 * `examplesDir`, on every interpreter from `interpreters()` (or the
 * `interps` given): the `<Predict run=...>` tags of each page
 * (`checkSource`) and the `proofs` of its lesson file under `areasDir`
 * (`lessonProofs`, `checkProofs`). Returns `{ found, proofs, checked,
 * failures, interpreters }`: the Predict examples and the proofs found, the
 * runs, one message per problem, and the labels the fixtures ran on. Zero
 * Predict examples is a failure too: it means the lesson tree or the parser
 * is broken, not that there is nothing to check. So is a missing
 * interpreter. When examples were found, the failures also hold every entry
 * script no `run` and no proof names (`unrunFixtures`, with the `exempt`
 * map).
 */
export function checkExamples(
	contentDir,
	examplesDir,
	run = (name, interp) => runFixture(examplesDir, name, interp),
	interps = interpreters(),
	exempt = UNRUN_EXEMPT,
	areasDir = join(contentDir, '..', '..', 'data', 'areas'),
) {
	if (interps.error) return { found: 0, proofs: 0, checked: 0, failures: [interps.error], interpreters: [] };
	let checked = 0;
	let found = 0;
	let proofCount = 0;
	const failures = [];
	const runs = new Set();
	for (const file of walkMdx(contentDir)) {
		const src = readFileSync(file, 'utf8');
		const result = checkSource(file, src, run, interps.list);
		found += result.found;
		checked += result.checked;
		failures.push(...result.failures);
		for (const name of result.runs) runs.add(name);
		const { proofs, error } = lessonProofs(contentDir, areasDir, file);
		if (error) {
			failures.push(error);
			continue;
		}
		const proved = checkProofs(file, src, proofs, run, interps.list);
		proofCount += proofs.length;
		checked += proved.checked;
		failures.push(...proved.failures);
		for (const name of proofs) runs.add(name);
	}
	if (found === 0)
		failures.push(`no <Predict run=...> examples found under ${contentDir}; the lesson tree or parser is broken`);
	else failures.push(...unrunFixtures(examplesDir, runs, exempt));
	return { found, proofs: proofCount, checked, failures, interpreters: interps.list.map((i) => i.label) };
}

/**
 * Entry scripts that no `<Predict run=...>` and no lesson file's `proofs`
 * runs, each with the reason (#460, #497). The rule is in docs/agents/testing.md ("Fixtures without a
 * Predict"). The list only shrinks: a fixture on it goes unchecked in CI, so a
 * page claim about its output can go stale with the build green.
 */
const FOUNDATIONS =
	'foundations page: `mise run data` rejects `<Predict run=...>` there, and the lesson file does not list it in `proofs` yet (#311)';
const MODEL_ANSWER =
	'a model answer the learner runs to compare with their own; the page shows the command and none of its output';
const RED_TEAM_TOOL =
	'a tool the learner runs on their own scratch folder; a demo_*.py Predict runs the same _common.py function and checks the output the page shows';
export const UNRUN_EXEMPT = new Map([
	['building-agents/planning/model_answer.py', MODEL_ANSWER],
	['building-agents/reflection/model_answer.py', MODEL_ANSWER],
	['building-agents/orchestrating-agents/model_answer.py', MODEL_ANSWER],
	['coding-with-agents/red-teaming-your-agent/check_run.py', RED_TEAM_TOOL],
	['coding-with-agents/red-teaming-your-agent/make_scratch.py', RED_TEAM_TOOL],
	['coding-with-agents/red-teaming-your-agent/scan_hidden.py', RED_TEAM_TOOL],
	[
		'coding-with-agents/reviewing-the-diff/build.py',
		'a setup tool the learner runs with a directory of their own; the page shows the command and none of its output',
	],
	[
		'customizing-agents/mcp-hardening/issue_token.py',
		'the learner runs it to make a token for their own session; its output holds the current time, and the page shows the command and none of its output',
	],
	[
		'customizing-agents/session-handoff/setup_practice.py',
		'a setup tool the learner runs with a directory of their own; its output holds that path, and diff_only.py runs the same build and checks the output the page shows',
	],
	['safety/following-the-source/resolve_citations.py', FOUNDATIONS],
	['safety/reading-agent-logs/compare_versions.py', FOUNDATIONS],
	['safety/reading-agent-logs/read_log.py', FOUNDATIONS],
	['safety/sizing-the-blast-radius/reach.py', FOUNDATIONS],
	['safety/tracing-a-planted-instruction/planted_line.py', FOUNDATIONS],
]);

/** Python files directly in `dir`, as file names. */
function pythonFiles(dir) {
	return readdirSync(dir).filter((name) => name.endsWith('.py') && statSync(join(dir, name)).isFile());
}

/** Directories directly in `dir`, as names, skipping `__pycache__`. */
function subdirs(dir) {
	return readdirSync(dir).filter((name) => name !== '__pycache__' && statSync(join(dir, name)).isDirectory());
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether `src` (another fixture's source) uses the module `stem`: it
 * imports it (`import stem`, `import a, stem`, `from stem import ...`) or
 * names its file in a quoted string literal (`"stem.py"` or `'stem.py'`),
 * which covers a fixture that runs it with `subprocess` or reads it as text.
 * A mention in a docstring, a comment, a code span or a longer string
 * (`"$ python3 stem.py"`) is not a use, so prose can't hide an unrun entry
 * script (#460 review).
 */
export function usesModule(src, stem) {
	const s = escapeRe(stem);
	return (
		new RegExp(`^[ \\t]*from[ \\t]+${s}[ \\t]+import\\b`, 'm').test(src) ||
		new RegExp(`^[ \\t]*import[ \\t]+(?:[\\w.]+(?:[ \\t]+as[ \\t]+\\w+)?[ \\t]*,[ \\t]*)*${s}\\b(?!\\.)`, 'm').test(
			src,
		) ||
		new RegExp(`(["'])${s}\\.py\\1`).test(src)
	);
}

/** Directory names the deep walk never enters: tool output and installs. */
const DEEP_SKIP = new Set(['__pycache__', '.venv', 'node_modules']);

/**
 * Directories directly in `dir` for the deep walk, as names. It skips
 * `DEEP_SKIP`, every dot-directory (`.git`, `.claude`) and every symlink
 * (`lstatSync`), so a link can't loop the walk or pull in files from
 * outside the lesson. The lesson-level walk keeps `subdirs`.
 */
function deepSubdirs(dir) {
	return readdirSync(dir).filter(
		(name) => !DEEP_SKIP.has(name) && !name.startsWith('.') && lstatSync(join(dir, name)).isDirectory(),
	);
}

/**
 * Python files below `dir` but not directly in it, as paths relative to
 * `dir` with `/` separators (`nightly/importer.py`), through `deepSubdirs`.
 */
function deepPythonFiles(dir, prefix = '') {
	const out = [];
	for (const sub of deepSubdirs(dir)) {
		const rel = `${prefix}${sub}/`;
		out.push(...pythonFiles(join(dir, sub)).map((name) => `${rel}${name}`));
		out.push(...deepPythonFiles(join(dir, sub), rel));
	}
	return out;
}

/**
 * Whether `src` (a lesson-level fixture's source) names `rel`, a file or a
 * directory relative to the lesson directory (`nightly`,
 * `nightly/importer.py`). It names it in a quoted string literal that is the
 * whole relative path, with an optional trailing `/` (`"nightly"`,
 * `'nightly/importer.py'`), or imports that path as a module or package
 * (`import nightly.importer`, `from nightly import importer`). A bare file
 * name (`"importer.py"`, `import importer`) or the last segment of a nested
 * path (`"scripts"` for `release-kit/scripts`) doesn't count, because a
 * lesson-level file of the same name would make it pass (#468 review).
 * `deepFileNamed` tries each containing directory as its own `rel`. The
 * matching is the one behind `usesModule`, so a mention in a docstring, a
 * comment or a longer string doesn't count.
 */
export function namesPath(src, rel) {
	const isFile = rel.endsWith('.py');
	if (new RegExp(`(["'])${escapeRe(rel)}/?\\1`).test(src)) return true;
	const dotted = escapeRe((isFile ? rel.slice(0, -'.py'.length) : rel).replaceAll('/', '.'));
	return (
		new RegExp(`^[ \\t]*from[ \\t]+${dotted}(?:\\.[\\w.]+)?[ \\t]+import\\b`, 'm').test(src) ||
		new RegExp(`^[ \\t]*import[ \\t]+(?:[\\w.]+(?:[ \\t]+as[ \\t]+\\w+)?[ \\t]*,[ \\t]*)*${dotted}\\b`, 'm').test(src)
	);
}

/**
 * Whether one of `sources` (the lesson-level `.py` sources) names the deep
 * file `rel` or a directory that contains it (#468). For `a/b/c.py` the
 * paths tried are `a`, `a/b` and `a/b/c.py`, each through `namesPath`.
 */
export function deepFileNamed(sources, rel) {
	const parts = rel.split('/');
	const paths = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
	return paths.some((p) => sources.some((src) => namesPath(src, p)));
}

/**
 * Every fixture under `examplesDir` that no `<Predict run=...>` runs and no
 * other fixture uses (#460, #468), as one failure message each. The rule is
 * in docs/agents/testing.md ("Fixtures without a Predict").
 *
 * An entry script is a `.py` file directly in a lesson directory,
 * `<area>/<lesson>/<name>.py`, the only depth a `run` names. It is not
 * reported when it is a shared helper, whose name starts with `_`, or a
 * module another `.py` file in the same lesson directory uses
 * (`usesModule`), such as the agent a wrapper fixture imports.
 *
 * A `.py` file below the lesson directory, such as `nightly/importer.py`,
 * is not reported when a lesson-level `.py` names it or a directory that
 * contains it (`deepFileNamed`), such as `_common.py` copying `"nightly"`
 * to a scratch directory. A deep file that nothing names is reported like
 * an entry script. A file that is not `.py` is data and never reported.
 *
 * `runs` holds the `run` names from the pages and the `proofs` paths from
 * the lesson files. `exempt` maps a fixture path
 * (relative to `examplesDir`) to the reason no Predict runs it. An entry
 * that names no file, a file a Predict or a proof runs, or a file the check doesn't
 * report fails too, so the list can't go stale.
 */
export function unrunFixtures(examplesDir, runs, exempt = UNRUN_EXEMPT) {
	const failures = [];
	const entries = new Set();
	const helpers = new Set();
	const named = new Set();
	for (const area of subdirs(examplesDir)) {
		for (const lesson of subdirs(join(examplesDir, area))) {
			const dir = join(examplesDir, area, lesson);
			const files = pythonFiles(dir);
			const sources = new Map(files.map((name) => [name, readFileSync(join(dir, name), 'utf8')]));
			for (const name of files) {
				const path = `${area}/${lesson}/${name}`;
				const stem = name.slice(0, -'.py'.length);
				const used = files.some((other) => other !== name && usesModule(sources.get(other), stem));
				if (name.startsWith('_') || used) helpers.add(path);
				else entries.add(path);
			}
			for (const rel of deepPythonFiles(dir)) {
				const path = `${area}/${lesson}/${rel}`;
				if (deepFileNamed([...sources.values()], rel)) named.add(path);
				else entries.add(path);
			}
		}
	}
	for (const path of [...entries].sort()) {
		if (runs.has(path) || exempt.has(path)) continue;
		failures.push(
			`examples/${path}: no <Predict run=...> runs this fixture, so CI never checks its output; name it in a run= (on a foundations page, in the lesson file's proofs) or add it to UNRUN_EXEMPT with the reason (docs/agents/testing.md)`,
		);
	}
	for (const [path, reason] of exempt) {
		if (!reason) failures.push(`UNRUN_EXEMPT ${path}: has no reason`);
		if (runs.has(path))
			failures.push(`UNRUN_EXEMPT ${path}: a <Predict run=...> or a lesson file's proofs runs it now; drop the entry`);
		else if (helpers.has(path))
			failures.push(`UNRUN_EXEMPT ${path}: is a helper another fixture uses, not an entry script; drop the entry`);
		else if (named.has(path))
			failures.push(
				`UNRUN_EXEMPT ${path}: a lesson-level fixture names this file or a directory that contains it; drop the entry`,
			);
		else if (!entries.has(path)) failures.push(`UNRUN_EXEMPT ${path}: names no entry script; drop the entry`);
	}
	return failures;
}
