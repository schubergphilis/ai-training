import { buildCheckpointExport, checkpointItemsOf } from '@lib/checkpoint-items';
import { assertKnownConcepts, knownConceptIds } from '@lib/concepts';
import type { Lesson } from '@lib/lessons';
import { describe, expect, it, vi } from 'vitest';

vi.mock('astro:content', async () => (await import('./content')).mockContent());

const body = (b: string): Lesson => ({ id: 'x/y', data: { title: 'X' }, body: b }) as unknown as Lesson;
const bib = { 'AEC-02': { type: 'course', title: 'How agents think', container: 'Agent Engineer Course' } };
const one = (b: string) => checkpointItemsOf(body(b), bib)[0];
const base = 'id="a" objective="o" title="T" hint="h" concepts={[\'token\']}';

describe('knownConceptIds and assertKnownConcepts', () => {
	it('collects every concept id across the topics', async () => {
		expect([...(await knownConceptIds())].sort()).toEqual(['context-window', 'risk', 'token']);
	});
	it('names the unknown ids and rejects an empty list', () => {
		const known = new Set(['token']);
		expect(() => assertKnownConcepts('x#a', ['token'], known)).not.toThrow();
		expect(() => assertKnownConcepts('x#a', ['token', 'nope', 'zip'], known)).toThrow(
			'x#a: unknown concept ids "nope", "zip" (see site/src/data/areas/<area>/topics/)',
		);
		expect(() => assertKnownConcepts('x#a', ['nope'], known)).toThrow(/unknown concept id "nope"/);
		expect(() => assertKnownConcepts('x#a', [], known)).toThrow(/at least one concept id/);
	});
});

describe('checkpointItemsOf', () => {
	it('shapes choice and scenario as option texts with the correct text as the answer', () => {
		const choice = one(
			`<Choice ${base} options={[{ text: 'a', why: 'w' }, { text: 'b', correct: true }]}>\nStem.\n</Choice>`,
		);
		expect(choice).toMatchObject({
			id: 'a',
			lesson: 'x/y',
			kind: 'choice',
			objective: 'o',
			concepts: ['token'],
			context: null,
			stem: 'Stem.',
			options: ['a', 'b'],
			answer: 'b',
			hint: 'h',
			reviewable: true,
			revision: 1,
			guessable: null,
		});
		const scenario = one(
			`<Scenario ${base} context="Ctx." options={[{ text: 'a', correct: true, consequence: 'c' }, { text: 'b', consequence: 'd' }]}>\n</Scenario>`,
		);
		expect(scenario).toMatchObject({ kind: 'scenario', context: 'Ctx.', options: ['a', 'b'], answer: 'a' });
		const exempt = one(
			`<Choice ${base} guessable="longest: the key is the full sentence" options={[{ text: 'a', why: 'w' }, { text: 'b', correct: true }]}>\nStem.\n</Choice>`,
		);
		expect(exempt?.guessable).toBe('longest: the key is the full sentence');
	});
	it('shapes multi-choice, match, order and sort', () => {
		expect(
			one(
				`<MultiChoice ${base} options={[{ text: 'a', correct: true }, { text: 'b' }, { text: 'c', correct: true }]}>\n</MultiChoice>`,
			),
		).toMatchObject({ options: ['a', 'b', 'c'], answer: ['a', 'c'] });
		expect(
			one(
				`<Match ${base} options={['X', 'Y']} rows={[{ statement: 's1', option: 1 }, { statement: 's2', option: 0 }]} rationale="r">\n</Match>`,
			),
		).toMatchObject({
			options: { options: ['X', 'Y'], statements: ['s1', 's2'] },
			answer: [
				{ statement: 's1', option: 'Y' },
				{ statement: 's2', option: 'X' },
			],
		});
		expect(one(`<Order ${base} steps={['b', 'a', 'c']} />`)).toMatchObject({
			stem: '',
			options: ['a', 'b', 'c'],
			answer: ['b', 'a', 'c'],
		});
		expect(
			one(`<Sort ${base} buckets={['L', 'R']} items={[{ text: 'i', bucket: 1 }, { text: 'j', bucket: 0 }]} />`),
		).toMatchObject({
			options: { buckets: ['L', 'R'], items: ['i', 'j'] },
			answer: [
				{ text: 'i', bucket: 'R' },
				{ text: 'j', bucket: 'L' },
			],
		});
	});
	it('shapes predict (graded and honor) and repair', () => {
		expect(one(`<Predict ${base} answer={\`1\n2\`} run="r.py">\n</Predict>`)).toMatchObject({
			options: null,
			answer: '1\n2',
			reviewable: true,
		});
		expect(one(`<Predict ${base}>\n</Predict>`)).toMatchObject({ options: null, answer: null, reviewable: false });
		// An ungraded example (no objective) is not an item at all.
		expect(checkpointItemsOf(body('<Predict id="e" title="T" answer="1" run="x.py">\n</Predict>'), bib)).toEqual([]);
		expect(one(`<Repair ${base} broken={\`b\`} model="m">\n</Repair>`)).toMatchObject({
			options: { broken: 'b' },
			answer: 'm',
			reviewable: false,
		});
	});
	it('renders a citation in the stem as its source and leaves one in a code span unchanged', () => {
		const item = one(
			`<Choice ${base} options={[{ text: 'a', correct: true }]}>\nRun in (@AEC-02), not \`(@AEC-02)\`?\n</Choice>`,
		);
		expect(item?.stem).toBe('Run in (How agents think, Agent Engineer Course), not `(@AEC-02)`?');
		expect(() => one(`<Choice ${base} options={[{ text: 'a', correct: true }]}>\nIn (@Nope)?\n</Choice>`)).toThrow(
			/^x\/y#a stem: unknown citation key "Nope"/,
		);
	});
	it('names the lesson and the prop when an expression is not a literal', () => {
		expect(() => one(`<Order ${base} steps={[oops]} />`)).toThrow(/x\/y: cannot read steps=\{\.\.\.\} of <Order>/);
	});
});

describe('buildCheckpointExport', () => {
	it('lists every checkpoint of every lesson in lesson order, version 1', async () => {
		const data = await buildCheckpointExport();
		expect(data.version).toBe(1);
		expect(data.items.map((i) => `${i.lesson}#${i.id}`)).toEqual([
			'concepts/how-models-work#what-the-model-does',
			'concepts/how-models-work#honor',
			'concepts/how-models-work#graded',
			// `shown`, the ungraded example between `graded` and `fix`, is not exported.
			'concepts/how-models-work#fix',
			'concepts/how-models-work#opt-out',
			'safety/agent-risk#s1',
		]);
		expect(data.items[0]?.concepts).toEqual(['token', 'context-window']);
	});
	it('renders a citation in a stem from the bibliography collection', async () => {
		const { mockContent, docs: fixtures } = await import('./content');
		const cited = fixtures.map((d) =>
			d.id === 'safety/agent-risk'
				? {
						...d,
						body: d.body?.replace('options={[]}>\n</Scenario>', 'options={[]}>\nWhy (@Brilliant TAS)?\n</Scenario>'),
					}
				: d,
		);
		const content = await import('astro:content');
		const swapped = mockContent({ docs: cited }).getCollection as unknown as typeof content.getCollection;
		vi.mocked(content.getCollection).mockImplementation(swapped);
		const data = await buildCheckpointExport();
		expect(data.items.find((i) => i.id === 's1')?.stem).toBe('Why (Taste, Brilliant)?');
	});
	it('fails on a concept id no topic defines', async () => {
		const { mockContent, docs: fixtures } = await import('./content');
		const bad = fixtures.map((d) =>
			d.id === 'safety/agent-risk' ? { ...d, body: d.body?.replace("'risk'", "'nope'") } : d,
		);
		const content = await import('astro:content');
		const swapped = mockContent({ docs: bad }).getCollection as unknown as typeof content.getCollection;
		vi.mocked(content.getCollection).mockImplementation(swapped);
		await expect(buildCheckpointExport()).rejects.toThrow(/safety\/agent-risk#s1: unknown concept id "nope"/);
	});
});
