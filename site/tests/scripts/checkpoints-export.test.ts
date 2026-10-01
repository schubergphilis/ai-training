import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
	checkAlternates,
	checkCheckpoints,
	checkpointTagId,
	conceptIds,
	pageCheckpointIds,
	stemWithoutCitations,
} from '../../scripts/lib/checkpoints.mjs';

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const TOPIC =
	'id: a/t\narea: a\nname: T\ndefinition: d\nconcepts:\n  - id: c1\n    name: C\n    definition: d\nlinks: {prerequisites: [], related: [], specializations: []}\n';
const PAGE =
	'<Choice id="one" objective="o" title="T" hint="h" concepts={[\'c1\']}\n  options={[{ text: \'a\', correct: true }]}>\nStem.\n</Choice>\n\n<Sort id="two" objective="o" title="T" hint="h" concepts={[\'c1\']} buckets={[]} items={[]} />\n\n<Predict id="shown" title="Shown" answer="1" run="x.py">\nRun this.\n</Predict>\n';
const item = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	lesson: 'a/x',
	kind: 'choice',
	objective: 'o',
	concepts: ['c1'],
	context: null,
	stem: 'Stem.',
	options: ['a'],
	answer: 'a',
	hint: 'h',
	reviewable: true,
	revision: 1,
	guessable: null,
	phase: 'first',
	...over,
});
/** The warnings of an export whose two reviewable items `one` and `two` have no review alternate. */
const NO_ALTERNATES = [
	'a/x: fewer review alternates than reviewable checkpoints: o (2 reviewable, 0 alternates)',
	'2 of 2 reviewable checkpoints are not matched by a review alternate',
];
const GOOD = { version: 1, items: [item('one'), item('two', { kind: 'sort', stem: '' })] };

/** A temp tree with one topic, one lesson page `a/x` with two checkpoints, and the given export (an object, or raw text). */
function tree(data: unknown, files: Record<string, string | null> = {}) {
	const root = mkdtempSync(join(tmpdir(), 'checkpoints-'));
	roots.push(root);
	const all: Record<string, string | null> = {
		'data/areas/a/topics/t.yaml': TOPIC,
		'content/a/x.mdx': PAGE,
		'content/a/index.mdx': '<Choice id="not-a-lesson">\n',
		'dist/data/checkpoints.json': data === null ? null : typeof data === 'string' ? data : JSON.stringify(data),
		...files,
	};
	for (const [rel, text] of Object.entries(all)) {
		if (text === null) continue;
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	return root;
}
const check = (root: string) =>
	checkCheckpoints(join(root, 'dist/data/checkpoints.json'), join(root, 'content'), join(root, 'data'));

describe('checkCheckpoints', () => {
	it('passes a consistent export and counts the items', () => {
		expect(check(tree(GOOD))).toEqual({ errors: [], items: 2, exemptions: [], warnings: NO_ALTERNATES });
	});
	it('reports a missing file, a file that is not JSON, a wrong version and a missing items list', () => {
		expect(check(tree(null)).errors[0]).toMatch(/does not exist; run site-build first/);
		expect(check(tree('{nope')).errors[0]).toMatch(/not JSON/);
		expect(check(tree({ version: 2 })).errors).toEqual(['version is 2, expected 1', 'no items list']);
	});
	it('runs the surface-cue check over the items and passes exemptions through', () => {
		const guessable = item('one', {
			options: ['No', 'Yes', 'Only when the check is a question the reviewer can answer'],
			answer: 'Only when the check is a question the reviewer can answer',
		});
		expect(check(tree({ version: 1, items: [guessable, item('two', { kind: 'sort', stem: '' })] })).errors).toEqual([
			expect.stringMatching(/^a\/x#one: longest: /),
		]);
		const exempt = { ...guessable, guessable: 'longest: the key is a rule the lesson states in full' };
		expect(check(tree({ version: 1, items: [exempt, item('two', { kind: 'sort', stem: '' })] }))).toEqual({
			errors: [],
			items: 2,
			exemptions: ['a/x#one: guessable (longest): the key is a rule the lesson states in full'],
			warnings: NO_ALTERNATES,
		});
	});
	it('reports a checkpoint missing from the export and an item no page has', () => {
		const { errors } = check(tree({ version: 1, items: [item('one'), item('three')] }));
		expect(errors).toEqual([
			'a/x#three: no lesson page has this checkpoint',
			'a/x#two: checkpoint in the lesson page is missing from the export',
		]);
	});
	it('reports a missing or mistyped field, a bad kind, empty or unknown concepts, and a duplicate', () => {
		const broken = {
			version: 1,
			items: [
				item('one', { revision: '1', kind: 'quiz', concepts: [] }),
				item('two', { kind: 'sort', stem: '', concepts: ['nope'] }),
				item('two', { kind: 'sort', stem: '' }),
				{ id: 'x' },
			],
		};
		const { errors } = check(tree(broken));
		expect(errors).toContain('a/x#one: revision must be a number');
		expect(errors).toContain('a/x#one: kind "quiz" is not a checkpoint kind');
		expect(errors).toContain('a/x#one: concepts must list at least one id');
		expect(errors).toContain('a/x#two: concept "nope" is not in the topic YAML');
		expect(errors).toContain('a/x#two: listed twice');
		expect(errors).toContain('items[3]: lesson must be a string');
		expect(errors).toContain('items[3]: context is missing (null when absent)');
	});
	it('reports a phase that is not a phase, and checks the alternates of a page that has them', () => {
		const page = `${PAGE}\n<Choice id="alt" phase="review" objective="o" title="T" hint="h" concepts={['c1']} options={[]}>\nS.\n</Choice>\n`;
		const items = [
			item('one', { phase: 'later' }),
			item('two', { kind: 'sort', stem: '' }),
			item('alt', { phase: 'review' }),
		];
		const { errors, warnings } = check(tree({ version: 1, items }, { 'content/a/x.mdx': page }));
		expect(errors).toEqual(['a/x#one: phase "later" is not one of first, review, practice']);
		expect(warnings).toEqual([]);
	});
});

describe('checkCheckpoints answer words of a graded Predict', () => {
	const page = `${PAGE}\n<Predict id="graded" objective="o" title="T" hint="h" concepts={['c1']} answer="Lisbon: sun">\nWhat does lookup("Lisbon") print?\n</Predict>\n`;
	const graded = (answer: string) =>
		item('graded', { kind: 'predict', stem: 'What does lookup("Lisbon") print?', options: null, answer });
	it('warns on an answer word the page stem and the context lack, after the alternate warnings', () => {
		const items = [item('one'), item('two', { kind: 'sort', stem: '' }), graded('Lisbon: sun')];
		const { errors, warnings } = check(tree({ version: 1, items }, { 'content/a/x.mdx': page }));
		expect(errors).toEqual([]);
		expect(warnings.at(-1)).toBe(
			'a/x#graded: the graded Predict\'s answer has words that are in neither its stem nor its context: "sun"',
		);
	});
	it('passes the item when the context has the word', () => {
		const items = [
			item('one'),
			item('two', { kind: 'sort', stem: '' }),
			{ ...graded('Lisbon: sun'), context: 'lookup returns sun for Lisbon.' },
		];
		const { warnings } = check(tree({ version: 1, items }, { 'content/a/x.mdx': page }));
		expect(warnings.filter((w) => w.includes('graded'))).toEqual([]);
	});
});

describe('checkCheckpoints echo over cited stems', () => {
	const CITED_PAGE = PAGE.replace('Stem.', 'Where does a subagent run (@Claude Code subagents)?');
	const cited = item('one', {
		stem: 'Where does a subagent run (Create custom subagents, Claude Code documentation)?',
		options: ['In its own context window', 'In the main thread', 'Documentation of the tool'],
		answer: 'Documentation of the tool',
	});
	const items = [cited, item('two', { kind: 'sort', stem: '' })];
	it('does not count the words of a citation the page shows as a number', () => {
		expect(check(tree({ version: 1, items }, { 'content/a/x.mdx': CITED_PAGE })).errors).toEqual([]);
	});
	it('still counts the stem words the learner reads', () => {
		const page = CITED_PAGE.replace('subagent run', 'documentation tool run');
		expect(check(tree({ version: 1, items }, { 'content/a/x.mdx': page })).errors).toEqual([
			expect.stringMatching(/^a\/x#one: echo: /),
		]);
	});
});

describe('stemWithoutCitations', () => {
	it('drops each citation and the spaces before it, and keeps one in code', () => {
		expect(stemWithoutCitations('Where does it run (@Claude Code\n  subagents)?')).toBe('Where does it run?');
		expect(stemWithoutCitations('One (@a) and two (@b).')).toBe('One and two.');
		expect(stemWithoutCitations('Type `(@key)` here.')).toBe('Type `(@key)` here.');
		expect(stemWithoutCitations('No citation.')).toBe('No citation.');
	});
});

describe('checkAlternates', () => {
	it('counts alternates per objective, so one alternate does not cover two checkpoints', () => {
		const items = [
			item('one'),
			item('one-again', { phase: 'review', kind: 'multi-choice' }),
			item('two', { objective: 'p' }),
			item('three', { objective: 'p' }),
			item('two-again', { objective: 'p', phase: 'review' }),
			item('shown', { objective: 'q', reviewable: false, kind: 'repair' }),
		];
		expect(checkAlternates(items)).toEqual({
			errors: [],
			warnings: [
				'a/x: fewer review alternates than reviewable checkpoints: p (2 reviewable, 1 alternate)',
				'1 of 3 reviewable checkpoints are not matched by a review alternate',
			],
		});
		expect(checkAlternates([item('one'), item('one-again', { phase: 'review' })]).warnings).toEqual([]);
	});
	it('fails an alternate without a first sibling and a review alternate that is not gradable', () => {
		const items = [
			item('one'),
			item('stray', { phase: 'practice', objective: 'q', reviewable: false }),
			item('elsewhere', { phase: 'review', lesson: 'a/y' }),
			item('self-graded', { phase: 'review', kind: 'repair', reviewable: false }),
		];
		expect(checkAlternates(items).errors).toEqual([
			'a/x#stray: a practice alternate needs a first checkpoint with objective "q" in its lesson',
			'a/x#self-graded: a review alternate must be gradable in a review (not a repair, an honor-system predict or review={false})',
			'a/y#elsewhere: a review alternate needs a reviewable first checkpoint with objective "o" in its lesson, or the review page never asks it',
		]);
	});
	it('fails a review alternate whose only sibling is not reviewable, and lets a practice one pass', () => {
		const items = [
			item('fix', { kind: 'repair', reviewable: false }),
			item('fix-again', { phase: 'review' }),
			item('fix-more', { phase: 'practice', reviewable: false }),
		];
		expect(checkAlternates(items).errors).toEqual([
			'a/x#fix-again: a review alternate needs a reviewable first checkpoint with objective "o" in its lesson, or the review page never asks it',
		]);
	});
	it('does not count a practice item or an ungradable alternate as covering its sibling, and skips malformed items', () => {
		const items = [
			item('one'),
			item('extra', { phase: 'practice', reviewable: false }),
			item('broken', { phase: 'review', reviewable: false }),
			{ id: 'x' },
		];
		const { warnings } = checkAlternates(items);
		expect(warnings[0]).toBe(
			'a/x: fewer review alternates than reviewable checkpoints: o (1 reviewable, 0 alternates)',
		);
	});
});

describe('helpers', () => {
	it('conceptIds collects every concept id in the data tree', () => {
		expect([...conceptIds(join(tree(GOOD), 'data'))]).toEqual(['c1']);
	});
	it('pageCheckpointIds skips an ungraded example (a Predict without an objective), so the export need not list it', () => {
		const root = tree(GOOD);
		const { ids } = pageCheckpointIds(join(root, 'content'), join(root, 'data'));
		expect([...ids]).not.toContain('a/x#shown');
		expect(check(tree(GOOD)).errors).toEqual([]);
	});
	it('pageCheckpointIds reads lesson pages only, not the course page, with the same reader as the build', () => {
		const spaced = PAGE.replace('<Choice id="one"', '<Choice id = "one"');
		const root = tree(GOOD, { 'content/a/x.mdx': spaced });
		const { ids, errors } = pageCheckpointIds(join(root, 'content'), join(root, 'data'));
		expect([...ids].sort()).toEqual(['a/x#one', 'a/x#two']);
		expect(errors).toEqual([]);
	});
	it('pageCheckpointIds reports a tag without a string id and a tag the reader rejects', () => {
		const noId = PAGE.replace('<Choice id="one"', "<Choice id={'x'}");
		const root = tree(GOOD, { 'content/a/x.mdx': noId });
		expect(pageCheckpointIds(join(root, 'content'), join(root, 'data')).errors).toEqual([
			'a/x: <Choice> without an id="..."',
		]);
		const broken = PAGE.replace('<Choice id="one"', '<Choice id="one" {...rest}');
		const { errors } = check(tree(GOOD, { 'content/a/x.mdx': broken }));
		expect(errors[0]).toMatch(/a\/x: <Choice> has a spread prop/);
	});
});

describe('checkpointTagId', () => {
	const tag = (attrs: [string, { value: unknown; expr: boolean }][]) => ({ attrs: new Map(attrs) });
	it('returns a string id written as id="..."', () => {
		expect(checkpointTagId(tag([['id', { value: 'one', expr: false }]]))).toBe('one');
	});
	it('returns undefined for a missing id, an expression id and a non-string id', () => {
		expect(checkpointTagId(tag([]))).toBeUndefined();
		expect(checkpointTagId(tag([['id', { value: 'one', expr: true }]]))).toBeUndefined();
		expect(checkpointTagId(tag([['id', { value: true, expr: false }]]))).toBeUndefined();
	});
});
