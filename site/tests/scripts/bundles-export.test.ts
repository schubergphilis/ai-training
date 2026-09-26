import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
	bundleIds,
	checkBundle,
	checkBundles,
	checkExportCitations,
	citationsOutsideCode,
	fencedBlocks,
	isLessonUrl,
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
