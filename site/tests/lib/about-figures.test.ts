import { type AboutInput, aboutFigure, aboutFigures, getAboutFigures, widgetNames } from '@lib/about-figures';
import { describe, expect, it, vi } from 'vitest';

/** What the mocked `getCollection` returns for each collection. A test sets it. */
const collections: Record<string, unknown[]> = {};
vi.mock('astro:content', () => ({ getCollection: async (name: string) => collections[name] ?? [] }));

const cp = 'objective="concepts/c/o" concepts={[\'c\']} hint="h"';

const input = (over: Partial<AboutInput> = {}): AboutInput => ({
	groups: [{ areas: ['concepts', 'safety'] }, { areas: ['building-agents'] }],
	courses: [{ area: 'concepts', parts: [{}, {}] }, { area: 'safety' }],
	lessonPlans: [
		{ id: 'concepts/a', mode: 'tutorial' },
		{ id: 'concepts/b', mode: 'explanation' },
		{ id: 'safety/c', mode: 'tutorial' },
	],
	lessons: [
		{
			id: 'concepts/a',
			body: `
<Choice id="one" ${cp} options={[{ text: 'a', correct: true }, { text: 'b', why: 'No.' }]}>Stem.</Choice>
<Choice id="one-alt" phase="review" ${cp} options={[{ text: 'a', correct: true }, { text: 'b', why: 'No.' }]}>Stem.</Choice>
<Predict id="graded" ${cp} answer="1" run="concepts/x.py">Run it.</Predict>
<Predict id="shown" run="concepts/y.py">Shown.</Predict>
<Sampler />
<Exercise kind="do">Do it.</Exercise>
<Habit id="h1">Next time.</Habit>
`,
		},
		{ id: 'safety/c', body: `<MultiChoice id="m" ${cp} options={[{ text: 'a', correct: true }]}>Stem.</MultiChoice>` },
	],
	topics: [
		{ area: 'concepts', concepts: [1, 2, 3] },
		{ area: 'safety', concepts: [1] },
	],
	competencies: [
		{
			area: 'concepts',
			objectives: [
				{ level: 'base', behaviors: [1, 2] },
				{ level: 'expert', behaviors: [] },
			],
		},
	],
	alignment: [{ rows: [1, 2] }, { rows: [3] }],
	bibliography: [{ type: 'paper' }, { type: 'reference' }, { type: 'reference' }],
	widgets: ['Sampler', 'TokenCounter'],
	...over,
});

describe('aboutFigures', () => {
	const f = aboutFigures(input());
	it('counts the structure from the groups, courses and lesson plans', () => {
		expect(f.get('groups')).toBe(2);
		expect(f.get('areas')).toBe(3);
		expect(f.get('courses')).toBe(2);
		expect(f.get('course-parts')).toBe(2);
		expect(f.get('lessons-planned')).toBe(3);
		expect(f.get('lessons-planned:concepts')).toBe(2);
		expect(f.get('lessons-planned:tutorial')).toBe(2);
		expect(f.get('lessons')).toBe(2);
		expect(f.get('lessons:safety')).toBe(1);
	});
	it('counts the knowledge model', () => {
		expect(f.get('topics')).toBe(2);
		expect(f.get('concepts')).toBe(4);
		expect(f.get('concepts:concepts')).toBe(3);
		expect(f.get('competencies')).toBe(1);
		expect(f.get('objectives')).toBe(2);
		expect(f.get('objectives:expert')).toBe(1);
		expect(f.get('behaviors')).toBe(2);
		expect(f.get('alignment-frameworks')).toBe(2);
		expect(f.get('alignment-rows')).toBe(3);
		expect(f.get('sources')).toBe(3);
		expect(f.get('sources:reference')).toBe(2);
	});
	it('counts first-phase checkpoints by kind, and alternates apart', () => {
		expect(f.get('checkpoints')).toBe(3);
		expect(f.get('checkpoints:concepts')).toBe(2);
		expect(f.get('checkpoints:choice')).toBe(1);
		expect(f.get('checkpoints:predict')).toBe(1);
		expect(f.get('checkpoints:multi-choice')).toBe(1);
		expect(f.get('checkpoints-review')).toBe(1);
	});
	it('counts examples, exercises, habits and widgets', () => {
		expect(f.get('examples-run')).toBe(2);
		expect(f.get('exercises')).toBe(1);
		expect(f.get('habits:concepts')).toBe(1);
		expect(f.get('widget-kinds')).toBe(2);
		expect(f.get('widget-uses')).toBe(1);
	});
	it('gives the study time in whole hours and no minutes key', () => {
		expect(f.get('study-hours')).toBeGreaterThanOrEqual(0);
		expect(f.has('minutes')).toBe(false);
	});
});

describe('aboutFigures with nothing of a kind', () => {
	const f = aboutFigures(input({ lessons: [], bibliography: [], competencies: [] }));
	it('shows 0 for a known figure that has nothing to count', () => {
		expect(f.get('checkpoints:repair')).toBe(0);
		expect(f.get('checkpoints-practice')).toBe(0);
		expect(f.get('sources:book')).toBe(0);
		expect(f.get('lessons:building-agents')).toBe(0);
		expect(f.get('objectives:expert')).toBe(0);
		expect(f.get('checkpoint-kinds')).toBe(8);
	});
	it('still has no key for a misspelled figure', () => {
		expect(f.has('checkpoints:repairs')).toBe(false);
	});
});

describe('aboutFigure', () => {
	it('formats a figure with a thousands separator', () => {
		expect(aboutFigure(new Map([['words', 452793]]), 'words')).toBe('452,793');
	});
	it('fails on an unknown key and names the known ones', () => {
		expect(() => aboutFigure(new Map([['lessons', 1]]), 'lesson')).toThrow(/names no figure. Known figures: lessons/);
	});
});

describe('widgetNames', () => {
	it('turns widget file paths into component names', () => {
		expect(widgetNames(['../components/widgets/TokenCounter.astro', '../components/widgets/Sampler.astro'])).toEqual([
			'Sampler',
			'TokenCounter',
		]);
	});
});

describe('getAboutFigures', () => {
	it('keeps the figures while the collections are unchanged', async () => {
		const first = await getAboutFigures();
		expect(await getAboutFigures()).toBe(first);
		expect(first.get('lessons-planned')).toBe(0);
		expect(first.get('widget-kinds')).toBeGreaterThan(0);
		expect(first.get('study-hours')).toBe(0);
	});
	it('counts again when a collection changes, as under the dev server', async () => {
		const before = await getAboutFigures();
		collections.groups = [{ data: { areas: ['concepts'] } }];
		const after = await getAboutFigures();
		delete collections.groups;
		expect(after).not.toBe(before);
		expect(after.get('areas')).toBe(1);
		expect(before.get('areas')).toBe(0);
	});
});
