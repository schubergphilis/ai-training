import {
	aboutMarkdown,
	areaFiguresOf,
	barsOf,
	dayLabel,
	dayPosition,
	daysBetween,
	figureValue,
	formatNumber,
	nth,
	rowValue,
	wrapText,
} from '@lib/about-charts';
import type { Area, Group } from '@lib/areas';
import type { CheckpointAttr } from '@lib/checkpoint-tags';
import { describe, expect, it } from 'vitest';

const figures = new Map<string, number>([
	['lessons', 1200],
	['checkpoints', 30],
	['zero', 0],
	['groups', 2],
	['areas', 2],
	['course-parts', 5],
	['checkpoints-review', 9],
	['exercises', 12],
	['habits', 4],
	['topics', 6],
	['concepts', 40],
	['competencies', 3],
	['objectives', 10],
	['behaviors', 30],
	['lessons:concepts', 7],
	['topics:concepts', 3],
	['checkpoints:concepts', 20],
	['lessons:coding-with-agents', 5],
	['topics:coding-with-agents', 3],
	['checkpoints:coding-with-agents', 10],
]);

const groups: Group[] = [
	{ id: 'foundations', order: 1, name: 'Foundations', audience: 'Everyone', description: '', areas: ['concepts'] },
	{
		id: 'engineering',
		order: 2,
		name: 'Engineering',
		audience: 'Software engineers',
		description: '',
		areas: ['coding-with-agents'],
	},
];
const areas: Area[] = [
	{ slug: 'concepts', name: 'Concepts', group: 'foundations', description: 'What models are.' },
	{ slug: 'coding-with-agents', name: 'Coding with agents', group: 'engineering', description: 'Ship | changes.' },
];

/** The attributes of a component as the alternate reads them: every value a literal. */
const attrs = (props: Record<string, unknown>) =>
	new Map<string, CheckpointAttr>(Object.entries(props).map(([k, v]) => [k, { value: v, expr: true }]));

const md = aboutMarkdown({ figures, groups, areas });
const render = (name: string, props: Record<string, unknown> = {}) => {
	const r = md[name];
	if (!r) throw new Error(`no renderer for ${name}`);
	return r(attrs(props));
};

describe('figureValue and rowValue', () => {
	it('reads a figure, a zero included, and names the known keys for an unknown one', () => {
		expect(figureValue(figures, 'zero')).toBe(0);
		expect(() => figureValue(figures, 'lesons')).toThrow(/"lesons" doesn't exist\. Known figures: .*lessons/);
	});
	it('takes a figure by key or a number from the page, and exactly one of them', () => {
		expect(rowValue(figures, { of: 'checkpoints' }, 'x')).toBe(30);
		expect(rowValue(figures, { value: 17 }, 'x')).toBe(17);
		expect(() => rowValue(figures, { of: 'lessons', value: 3 }, 'tile 2')).toThrow(/tile 2 has both/);
		expect(() => rowValue(figures, {}, 'bar 1')).toThrow(/bar 1 needs of=/);
	});
	it('writes a number with a thousands separator', () => {
		expect(formatNumber(1436)).toBe('1,436');
	});
});

describe('barsOf', () => {
	it('scales each bar against the largest value', () => {
		const bars = barsOf(figures, [
			{ of: 'checkpoints', label: 'A' },
			{ value: 15, label: 'B', note: 'n', group: 'G' },
		]);
		expect(bars.map((b) => [b.label, b.value, b.text, b.fraction])).toEqual([
			['A', 30, '30', 1],
			['B', 15, '15', 0.5],
		]);
		expect(bars[1]).toMatchObject({ note: 'n', group: 'G' });
	});
	it('draws no bar when every value is zero', () => {
		expect(barsOf(figures, [{ of: 'zero', label: 'A' }])[0]?.fraction).toBe(0);
	});
});

describe('wrapText', () => {
	it('breaks at spaces within the width, and gives a long word its own line', () => {
		expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four']);
		expect(wrapText('a verylongword b', 4)).toEqual(['a', 'verylongword', 'b']);
		expect(wrapText('  ', 10)).toEqual([]);
	});
});

describe('dayPosition', () => {
	it('places a day on a square-root axis from 0 to 1, clamped at both ends', () => {
		expect(dayPosition(0, 100)).toBe(0);
		expect(dayPosition(25, 100)).toBe(0.5);
		expect(dayPosition(100, 100)).toBe(1);
		expect(dayPosition(200, 100)).toBe(1);
		expect(dayPosition(-3, 100)).toBe(0);
		expect(dayPosition(5, 0)).toBe(0);
	});
});

describe('dates', () => {
	it('counts whole days between two dates, and rejects a date in another format', () => {
		expect(daysBetween('2026-09-19', '2026-10-09')).toBe(20);
		expect(() => daysBetween('2026-09-19', 'Oct 9')).toThrow(/"Oct 9" is no date/);
	});
	it('writes a day, a range in one month and a range over two months', () => {
		expect(dayLabel('2026-09-25')).toBe('September 25');
		expect(dayLabel('2026-09-25', '2026-09-27')).toBe('September 25 to 27');
		expect(dayLabel('2026-09-30', '2026-10-02')).toBe('September 30 to October 2');
	});
});

describe('areaFiguresOf', () => {
	it('lists each group with its areas and their counts', () => {
		const out = areaFiguresOf(figures, groups, areas);
		expect(out.map((g) => [g.group.id, g.areas.map((a) => [a.slug, a.lessons, a.topics, a.checkpoints])])).toEqual([
			['foundations', [['concepts', 7, 3, 20]]],
			['engineering', [['coding-with-agents', 5, 3, 10]]],
		]);
	});
});

describe('nth', () => {
	it('returns a coordinate and fails past the end', () => {
		expect(nth([4, 8], 1)).toBe(8);
		expect(() => nth([4, 8], 2)).toThrow(/no coordinate 2 in \[4, 8\]/);
	});
});

describe('aboutMarkdown', () => {
	it('writes a figure as its number, and fails on a missing prop', () => {
		expect(render('AboutFigure', { of: 'lessons' })).toBe('1,200');
		expect(() => render('AboutFigure')).toThrow(/<AboutFigure> needs the prop of/);
	});
	it('writes tiles as a list', () => {
		expect(
			render('Stats', {
				items: [
					{ of: 'lessons', label: 'lessons' },
					{ value: 17, label: 'days' },
				],
			}),
		).toBe('- 1,200 lessons\n- 17 days');
	});
	it('writes a bar chart as a table, with a group and a note column only when a row has one', () => {
		expect(render('BarChart', { rows: [{ value: 3, label: 'A' }] })).toBe('|  | Count |\n| --- | --- |\n| A | 3 |');
		expect(
			render('BarChart', {
				unit: 'Lines',
				label: 'Part',
				rows: [
					{ group: 'Code', value: 3, label: 'A', note: 'x' },
					{ value: 4, label: 'B' },
				],
			}),
		).toBe('| Group | Part | Note | Lines |\n| --- | --- | --- | --- |\n| Code | A | x | 3 |\n| Code | B |  | 4 |');
	});
	it('writes the area chart as a table, with the pipes of a description escaped', () => {
		expect(render('AreaChart')).toBe(
			[
				'| Area | Group | What it covers | Lessons | Topics | Checkpoints |',
				'| --- | --- | --- | --- | --- | --- |',
				'| Concepts | Foundations | What models are. | 7 | 3 | 20 |',
				'| Coding with agents | Engineering | Ship \\| changes. | 5 | 3 | 10 |',
			].join('\n'),
		);
	});
	it('writes the content model as a list of its counts', () => {
		const out = render('ContentModel');
		expect(out.split('\n')).toHaveLength(4);
		expect(out).toContain('- 1,200 lessons. They have 30 graded checkpoints, 9 more for review only');
	});
	it('writes the schedules, the events and the lesson counts', () => {
		expect(render('Intervals', { rows: [{ label: 'Habit', days: [1, 3, 7] }] })).toBe(
			'- Habit: on days 1, 3, 7 after the lesson',
		);
		const growth = render('GrowthChart', {
			points: [{ date: '2026-09-20', lessons: 10 }],
			events: [{ date: '2026-09-25', end: '2026-09-27', text: 'Most lessons.' }],
		});
		expect(growth).toContain('| September 25 to 27 | Most lessons. |');
		expect(growth).toContain('| End of day | Lessons |\n| --- | --- |\n| September 20 | 10 |');
	});
	it('writes the sources and the controls', () => {
		expect(render('Adopted', { rows: [{ source: 'CS50', adopted: ['Hints', 'Levels'] }] })).toBe(
			'- CS50: Hints; Levels',
		);
		expect(
			render('Controls', { groups: [{ name: 'Hook', controls: [{ control: 'Blocks a push', prevents: 'Skips' }] }] }),
		).toContain('| Hook | Blocks a push | Skips |');
	});
	it('leaves out the drawings that only show what the prose says', () => {
		expect([render('LessonAnatomy'), render('WaveDiagram'), render('ArchitectureDiagram')]).toEqual(['', '', '']);
	});
});
