import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
	bundleIds,
	checkBundle,
	checkBundles,
	checkDataFiles,
	checkDataIndex,
	checkExportCitations,
	citationsOutsideCode,
	dataTreeSources,
	fencedBlocks,
	isLessonUrl,
	publishedDataPaths,
	withoutNotes,
} from '../../scripts/lib/bundles.mjs';

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const TOPIC =
	'id: a/t\narea: a\nname: T\ndefinition: d\nconcepts:\n  - id: c1\n    name: C\n    definition: d\nlinks: {prerequisites: [], related: [], specializations: []}\n';
const PAGE =
	"import { Prompt } from '@components/lesson';\n\nSee [x](/glossary/).\n\n```py\nprint('/glossary/')\n```\n\n<Prompt model=\"illustrative\">\n~~~\nA [link](/a/) inside.\n~~~\n</Prompt>\n";
const PROSE =
	"See [x](https://s/ai-training/glossary/).\n\n```py\nprint('/glossary/')\n```\n\n#### Prompt (illustrative, not a recorded transcript)\n\n````text\n~~~\nA [link](/a/) inside.\n~~~\n````\n";
const bundle = (over: Record<string, unknown> = {}) => ({
	version: 1,
	id: 'a/x',
	url: 'https://s/ai-training/a/x/',
	title: 'X',
	mode: 'tutorial',
	prose: PROSE,
	topics: [],
	objectives: [],
	assumes: [],
	checkpoints: [],
	extends_to: [],
	...over,
});

/** A temp tree with one topic, one lesson page `a/x`, and the given bundle files (an object, raw text, or null for none). */
function tree(bundles: Record<string, unknown> = { 'a/x': bundle() }, files: Record<string, string> = {}) {
	const root = mkdtempSync(join(tmpdir(), 'bundles-'));
	roots.push(root);
	const all: Record<string, string> = {
		'data/areas/a/topics/t.yaml': TOPIC,
		'content/a/x.mdx': PAGE,
		'content/a/index.mdx': 'Course page.\n',
		...files,
	};
	for (const [id, data] of Object.entries(bundles)) {
		all[`dist/data/lessons/${id}.json`] = typeof data === 'string' ? data : JSON.stringify(data);
	}
	for (const [rel, text] of Object.entries(all)) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	return root;
}
const check = (root: string) =>
	checkBundles(join(root, 'dist/data/lessons'), join(root, 'content'), join(root, 'data'));

describe('fencedBlocks', () => {
	it('returns each fenced block with its fences, nested fences included, to the end when unclosed', () => {
		expect(fencedBlocks('a\n```js\nx\n```\nb\n  ~~~\n  y\n  ~~~\n````md\n```\ninner\n```\n````\n~~~\nopen')).toEqual([
			'```js\nx\n```',
			'  ~~~\n  y\n  ~~~',
			'````md\n```\ninner\n```\n````',
			'~~~\nopen',
		]);
		expect(fencedBlocks('no `inline` code')).toEqual([]);
	});
	it('does not close on a shorter fence, a fence of the other character, or a fence line with text after it', () => {
		expect(fencedBlocks('````\n```\n~~~~\n``` x\n````  \nafter')).toEqual(['````\n```\n~~~~\n``` x\n````  ']);
		expect(fencedBlocks('\t~~~\nx\n  ~~~~\ny')).toEqual(['\t~~~\nx\n  ~~~~']);
	});
});

describe('citationsOutsideCode', () => {
	it('returns each line with a (@ outside code, and none for a token in a fenced block or a code span', () => {
		expect(citationsOutsideCode('A (@AEC-02) here.\n\n  B (@Claude Code\ndocs.x) there.\n')).toEqual([
			'A (@AEC-02) here.',
			'B (@Claude Code',
		]);
		expect(
			citationsOutsideCode('Write `(@key)`, or ``a ` (@key)``.\n\n```md\n(@key)\n```\n\n~~~\n(@k)\n~~~\n'),
		).toEqual([]);
		expect(citationsOutsideCode('A `span\nover (@key) lines`.\n')).toEqual([]);
	});
	it('does not pair backticks across a blank line or runs of different lengths', () => {
		expect(citationsOutsideCode('A ` stray.\n\n(@key) b `.\n')).toEqual(['(@key) b `.']);
		expect(citationsOutsideCode('A `` (@key) ` b.\n')).toEqual(['A `` (@key) ` b.']);
	});
});

describe('checkBundles', () => {
	it('passes a tree with one bundle per lesson page and counts them', () => {
		expect(check(tree())).toEqual({ errors: [], bundles: 1 });
	});
	it('reports a missing dist directory', () => {
		expect(check(tree({})).errors).toEqual([expect.stringMatching(/does not exist; run site-build first/)]);
	});
	it('reports a page without a bundle and a bundle without a page', () => {
		expect(check(tree({ 'a/y': bundle({ id: 'a/y' }) })).errors).toEqual([
			'a/x: lesson page without a bundle',
			'a/y: bundle without a lesson page',
		]);
		expect(bundleIds(join(tree({ 'a/y': bundle() }), 'dist/data/lessons'))).toEqual(new Set(['a/y']));
	});
	it('reports a bundle that is not JSON, not an object, or has the wrong id or version', () => {
		expect(check(tree({ 'a/x': '{nope' })).errors).toEqual([expect.stringMatching(/^a\/x: not JSON/)]);
		expect(check(tree({ 'a/x': '[]' })).errors).toEqual(['a/x: not a JSON object']);
		expect(check(tree({ 'a/x': bundle({ id: 'a/y', version: 2 }) })).errors).toEqual([
			'a/x: version is 2, expected 1',
			'a/x: id is "a/y"',
		]);
	});
	it('reports a url that is relative or names another lesson', () => {
		expect(check(tree({ 'a/x': bundle({ url: '/ai-training/a/x/' }) })).errors).toEqual([
			'a/x: url is "/ai-training/a/x/", expected an absolute URL ending in /a/x/',
		]);
		expect(check(tree({ 'a/x': bundle({ url: 'https://s/ai-training/a/y/' }) })).errors).toHaveLength(1);
		expect(isLessonUrl('https://s/a/x/', 'a/x')).toBe(true);
		expect(isLessonUrl('https://s/a/x', 'a/x')).toBe(false);
	});
	it('reports a missing or mistyped field and an unknown mode', () => {
		const { title: _title, checkpoints: _checkpoints, ...rest } = bundle();
		expect(check(tree({ 'a/x': { ...rest, mode: 'essay', prose: 7 } })).errors).toEqual([
			'a/x: title must be a string',
			'a/x: prose must be a string',
			'a/x: checkpoints must be a list',
			'a/x: mode is "essay", expected tutorial or explanation',
		]);
	});
	it('reports a fenced block of the page that the prose changed', () => {
		const prose = PROSE.replace("print('/glossary/')", "print('https://s/ai-training/glossary/')").replace(
			'A [link](/a/)',
			'A [link](https://s/ai-training/a/)',
		);
		expect(check(tree({ 'a/x': bundle({ prose }) })).errors).toEqual([
			'a/x: the fenced block starting "```py" is not in prose unchanged',
			'a/x: the fenced block starting "~~~" is not in prose unchanged',
		]);
	});
	it('reports a raw citation token in the prose outside code', () => {
		const prose = `${PROSE}\nSee (@AEC-02) and \`(@AEC-02)\`.\n`;
		expect(check(tree({ 'a/x': bundle({ prose }) })).errors).toEqual([
			'a/x: prose keeps a raw citation token outside code: "See (@AEC-02) and `(@AEC-02)`."',
		]);
	});
	it('reports a raw citation token in a behavior field or a checkpoint stem outside code', () => {
		const objectives = [
			{
				id: 'a/c/o1',
				behaviors: [
					{ claim: 'c', why: 'Cheaper (@AEC-02).', example: 'e' },
					{ claim: 'Reads (@AEC-02).', why: 'Fine `(@AEC-02)`.', example: 'Runs (@AEC-02).' },
				],
			},
		];
		const checkpoints = [
			{ id: 'k1', stem: 'Which mode\nruns in (@Claude Code subagents)?' },
			{ id: 'k2', stem: 'Rendered (Subagents, Claude Code docs).' },
		];
		expect(check(tree({ 'a/x': bundle({ objectives, checkpoints }) })).errors).toEqual([
			'a/x: objectives[0] (a/c/o1) behaviors[0].why keeps a raw citation token outside code: "Cheaper (@AEC-02)."',
			'a/x: objectives[0] (a/c/o1) behaviors[1].claim keeps a raw citation token outside code: "Reads (@AEC-02)."',
			'a/x: objectives[0] (a/c/o1) behaviors[1].example keeps a raw citation token outside code: "Runs (@AEC-02)."',
			'a/x: checkpoints[0] (k1) stem keeps a raw citation token outside code: "runs in (@Claude Code subagents)?"',
		]);
	});
	it('checks one bundle file against its page source', () => {
		const root = tree();
		expect(checkBundle('a/x', join(root, 'dist/data/lessons/a/x.json'), PAGE)).toEqual([]);
	});
});

describe('checkExportCitations', () => {
	const write = (text: string) => {
		const root = tree();
		const file = join(root, 'dist/data/checkpoints.json');
		writeFileSync(file, text);
		return file;
	};
	it('passes an export whose stems hold no raw token outside code', () => {
		const items = [{ id: 'k', lesson: 'a/x', stem: 'Rendered (Taste, Brilliant) and `(@AEC-02)`.' }];
		expect(checkExportCitations(write(JSON.stringify({ version: 1, items })))).toEqual([]);
	});
	it('reports a raw citation token in a stem, naming the item', () => {
		const items = [{ id: 'k', lesson: 'a/x', stem: 'Runs in (@Claude Code subagents)?' }];
		expect(checkExportCitations(write(JSON.stringify({ version: 1, items })))).toEqual([
			'checkpoints.json: a/x#k stem keeps a raw citation token outside code: "Runs in (@Claude Code subagents)?"',
		]);
	});
	it('reports a missing file and a file that is not JSON', () => {
		const file = write('{');
		expect(checkExportCitations(file)[0]).toMatch(/^checkpoints\.json: not JSON/);
		expect(checkExportCitations(`${file}.gone`)).toEqual([`${file}.gone does not exist; run site-build first`]);
	});
});

/** The data tree of the S12 data-file tests: groups, one area with a topic, a competency, a parted course and two lessons. */
const DATA_TREE: Record<string, string> = {
	'groups.yaml': '- id: g\n  order: 1\n  areas: [a]\n',
	'bibliography.yaml': 'k:\n  title: K\n',
	'alignment/f.yaml': 'id: f\n',
	'areas/a/area.yaml': 'id: a\nname: A\ngroup: g\nnotes: For authors.\n',
	'areas/a/topics/t.yaml': 'id: a/t\narea: a\n',
	'areas/a/competencies/c.yaml': 'id: a/c\narea: a\nnotes: n\n',
	'areas/a/courses/a.yaml':
		'id: a\narea: a\nnotes: n\nparts:\n  - title: P\n    notes: pn\n    lessons: [a/x]\n  - title: Q\n    lessons: [a/y]\n',
	'areas/a/lessons/x.yaml': 'id: a/x\nsources-checked: 2026-09-26\nnotes: n\n',
	'areas/a/lessons/y.yaml': 'id: a/y\n',
};
const ORIGIN = 'https://s/ai-training';

/** What the build writes for `DATA_TREE`: each file as two-space JSON without notes. */
function builtDataFiles(): Record<string, string> {
	const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
	return {
		'groups.json': json([{ id: 'g', order: 1, areas: ['a'] }]),
		'areas/a.json': json({ id: 'a', name: 'A', group: 'g' }),
		'topics/a/t.json': json({ id: 'a/t', area: 'a' }),
		'competencies/a/c.json': json({ id: 'a/c', area: 'a' }),
		'courses/a.json': json({
			id: 'a',
			area: 'a',
			parts: [
				{ title: 'P', lessons: ['a/x'] },
				{ title: 'Q', lessons: ['a/y'] },
			],
		}),
		'lesson-plans/a/x.json': json({ id: 'a/x', 'sources-checked': '2026-09-26' }),
		'lesson-plans/a/y.json': json({ id: 'a/y' }),
	};
}

/** An index for `DATA_TREE` with `a/x` live, as the build writes it. */
function dataIndex(over: Record<string, unknown> = {}) {
	return {
		version: 1,
		groups: `${ORIGIN}/data/groups.json`,
		checkpoints: `${ORIGIN}/data/checkpoints.json`,
		areas: [
			{
				id: 'a',
				url: `${ORIGIN}/data/areas/a.json`,
				page: `${ORIGIN}/a/`,
				topics: [{ id: 'a/t', url: `${ORIGIN}/data/topics/a/t.json`, page: `${ORIGIN}/topics/a/t/` }],
				competencies: [{ id: 'a/c', url: `${ORIGIN}/data/competencies/a/c.json`, page: `${ORIGIN}/competencies/a/c/` }],
				courses: [{ id: 'a', url: `${ORIGIN}/data/courses/a.json` }],
				lessons: [
					{
						id: 'a/x',
						plan: `${ORIGIN}/data/lesson-plans/a/x.json`,
						live: true,
						page: `${ORIGIN}/a/x/`,
						bundle: `${ORIGIN}/data/lessons/a/x.json`,
					},
					{ id: 'a/y', plan: `${ORIGIN}/data/lesson-plans/a/y.json`, live: false, page: null, bundle: null },
				],
			},
		],
		...over,
	};
}

/**
 * A temp root with `data/` holding `DATA_TREE` and `dist/` holding the built
 * data files, the bundle and page of `a/x`, the pages of the area, topic and
 * competency, the export and `index`. `dist` entries override or, with null, remove a built file.
 */
function dataRoot(dist: Record<string, string | null> = {}, index: unknown = dataIndex()) {
	const root = mkdtempSync(join(tmpdir(), 'data-files-'));
	roots.push(root);
	const built: Record<string, string | null> = {
		...builtDataFiles(),
		'lessons/a/x.json': '{}\n',
		'checkpoints.json': '{"items":[]}\n',
		'index.json': typeof index === 'string' ? index : JSON.stringify(index),
		'tutor.md': '# Tutor\n',
		...dist,
	};
	const all: Record<string, string> = {};
	for (const [rel, text] of Object.entries(DATA_TREE)) all[`data/${rel}`] = text;
	for (const [rel, text] of Object.entries(built)) if (text !== null) all[`dist/data/${rel}`] = text;
	for (const page of ['a', 'a/x', 'topics/a/t', 'competencies/a/c']) all[`dist/${page}/index.html`] = '<html></html>';
	for (const [rel, text] of Object.entries(all)) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	return root;
}
const checkData = (root: string) => checkDataFiles(join(root, 'dist/data'), join(root, 'data'));
const checkIndex = (root: string) => checkDataIndex(join(root, 'dist/data'), join(root, 'data'));

describe('dataTreeSources', () => {
	it('maps each published data-tree file to its source, without the bibliography or alignment', () => {
		const root = dataRoot();
		const sources = dataTreeSources(join(root, 'data'));
		expect([...sources.keys()].sort()).toEqual([
			'areas/a',
			'competencies/a/c',
			'courses/a',
			'groups',
			'lesson-plans/a/x',
			'lesson-plans/a/y',
			'topics/a/t',
		]);
		expect(sources.get('lesson-plans/a/x')).toBe(join(root, 'data/areas/a/lessons/x.yaml'));
	});
	it('is empty for a missing data directory', () => {
		expect(dataTreeSources(join(tmpdir(), 'no-such-data-dir')).size).toBe(0);
	});
});

describe('withoutNotes', () => {
	it('drops the top-level notes and each course part notes, keeping key order', () => {
		expect(JSON.stringify(withoutNotes({ id: 'a', notes: 'n', parts: [{ title: 'P', notes: 'x' }, 'odd'] }))).toBe(
			'{"id":"a","parts":[{"title":"P"},"odd"]}',
		);
		expect(withoutNotes(['kept'])).toEqual(['kept']);
		expect(withoutNotes(null)).toBeNull();
	});
});

describe('publishedDataPaths', () => {
	it('lists the built data files but not the bundles, the export, the index or a non-JSON file', () => {
		expect([...publishedDataPaths(join(dataRoot(), 'dist/data'))].sort()).toEqual([
			'areas/a',
			'competencies/a/c',
			'courses/a',
			'groups',
			'lesson-plans/a/x',
			'lesson-plans/a/y',
			'topics/a/t',
		]);
		expect(publishedDataPaths(join(tmpdir(), 'no-such-dist')).size).toBe(0);
	});
});

describe('checkDataFiles', () => {
	it('passes when each built file is its YAML source without notes', () => {
		expect(checkData(dataRoot())).toEqual({ errors: [], files: 7 });
	});
	it('fails on a JSON file that differs from its YAML, naming the first line that differs', () => {
		const { errors } = checkData(
			dataRoot({ 'areas/a.json': `${JSON.stringify({ id: 'a', name: 'B', group: 'g' }, null, 2)}\n` }),
		);
		expect(errors).toEqual([
			'data/areas/a.json: differs from areas/a/area.yaml: line 3 is "  \\"name\\": \\"B\\",", expected "  \\"name\\": \\"A\\","',
		]);
	});
	it('fails when a published file keeps notes, reorders keys, or is not pretty-printed', () => {
		const withNotes = `${JSON.stringify({ id: 'a/c', area: 'a', notes: 'n' }, null, 2)}\n`;
		const reordered = `${JSON.stringify({ area: 'a', id: 'a/t' }, null, 2)}\n`;
		const { errors } = checkData(
			dataRoot({
				'competencies/a/c.json': withNotes,
				'topics/a/t.json': reordered,
				'lesson-plans/a/y.json': '{"id":"a/y"}',
			}),
		);
		expect(errors).toHaveLength(3);
		expect(errors[0]).toMatch(/^data\/competencies\/a\/c\.json: differs from areas\/a\/competencies\/c\.yaml: line 3/);
		expect(errors[1]).toMatch(/^data\/lesson-plans\/a\/y\.json: differs/);
		expect(errors[2]).toMatch(/^data\/topics\/a\/t\.json: differs/);
	});
	it('fails on a data-tree file without a published file and on a published file without a source', () => {
		const { errors } = checkData(dataRoot({ 'courses/a.json': null, 'topics/a/gone.json': '{}\n' }));
		expect(errors).toEqual([
			'data/courses/a.json: data-tree file areas/a/courses/a.yaml has no published file',
			'data/topics/a/gone.json: published data file without a source under src/data',
		]);
	});
	it('reports a missing dist directory', () => {
		const { errors } = checkDataFiles(join(tmpdir(), 'no-such-dist'), join(tmpdir(), 'no-such-data'));
		expect(errors[0]).toMatch(/does not exist; run site-build first$/);
	});
});

describe('checkDataIndex', () => {
	it('passes on the index the build writes', () => {
		expect(checkIndex(dataRoot())).toEqual([]);
	});
	it('reports a missing index, one that is not JSON, and one that is not an object', () => {
		expect(checkIndex(dataRoot({ 'index.json': null }))[0]).toMatch(
			/index\.json does not exist; run site-build first$/,
		);
		expect(checkIndex(dataRoot({}, '{'))[0]).toMatch(/^index\.json: not JSON: /);
		expect(checkIndex(dataRoot({}, []))).toEqual(['index.json: not a JSON object']);
	});
	it('fails on a wrong version, a wrong checkpoints URL, and a URL of no built file', () => {
		const errors = checkIndex(
			dataRoot(
				{},
				dataIndex({ version: 2, checkpoints: `${ORIGIN}/data/groups.json`, groups: `${ORIGIN}/data/nope.json` }),
			),
		);
		expect(errors).toContain('index.json: version is 2, expected 1');
		expect(errors).toContain(
			`index.json: checkpoints is "${ORIGIN}/data/groups.json", expected /data/checkpoints.json`,
		);
		expect(errors).toContain(`index.json: groups is "${ORIGIN}/data/nope.json", not the URL of a built /data/ file`);
		expect(errors).toContain('index.json: data/nope.json is listed but is no data-tree file');
	});
	it('fails when a data file is not listed or is listed twice', () => {
		const index = dataIndex();
		const [area] = index.areas;
		if (!area) throw new Error('fixture');
		area.topics = [];
		area.courses = [area.courses[0] as { id: string; url: string }, area.courses[0] as { id: string; url: string }];
		const errors = checkIndex(dataRoot({}, index));
		expect(errors).toEqual([
			'index.json: data/courses/a.json is listed twice',
			'index.json: data/topics/a/t.json is not listed',
		]);
	});
	it('fails on a page that was not built or does not end in its id', () => {
		const index = dataIndex();
		const [area] = index.areas;
		if (!area) throw new Error('fixture');
		area.page = `${ORIGIN}/b/`;
		(area.topics[0] as { page: string }).page = 'not a url';
		expect(checkIndex(dataRoot({}, index))).toEqual([
			`index.json: areas a page is "${ORIGIN}/b/", expected the built page ending in /a/`,
			'index.json: topic a/t page is "not a url", expected the built page ending in /topics/a/t/',
		]);
	});
	it('fails when live disagrees with the built bundle, or a planned lesson has a page or bundle', () => {
		const index = dataIndex();
		const [area] = index.areas;
		if (!area) throw new Error('fixture');
		const [x, y] = area.lessons as { live: boolean; page: string | null; bundle: string | null }[];
		if (!x || !y) throw new Error('fixture');
		x.bundle = `${ORIGIN}/data/lessons/a/other.json`;
		y.page = `${ORIGIN}/a/y/`;
		expect(checkIndex(dataRoot({}, index))).toEqual([
			`index.json: lesson a/x bundle is "${ORIGIN}/data/lessons/a/other.json", expected /data/lessons/a/x.json`,
			'index.json: planned lesson a/y has a page or bundle; both must be null',
		]);
		x.live = false;
		expect(checkIndex(dataRoot({}, index))).toContain('index.json: lesson a/x live is false, but its bundle was built');
	});
});
