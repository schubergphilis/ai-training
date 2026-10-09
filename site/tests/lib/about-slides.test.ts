import { aboutFigureById, aboutFiguresById, aboutFiguresOf } from '@lib/about-slides';
import { describe, expect, it } from 'vitest';

const body = `
import Stats from '@components/about/Stats.astro';

Some prose.

<Stats id="figure-in-short" items={[{ of: 'lessons', label: 'lessons' }]} />

<BarChart label="Kind" rows={[{ value: 3, label: 'A' }]} />

<GrowthChart
  id="figure-growth"
  points={[{ date: '2026-09-20', lessons: 10 }]}
  events={[]}
/>
`;

describe('aboutFiguresById', () => {
	it('reads each element with an id, with its name and its literal props', () => {
		const figures = aboutFiguresById(body, 'about.mdx');
		expect([...figures.keys()]).toEqual(['figure-in-short', 'figure-growth']);
		expect(figures.get('figure-in-short')).toEqual({
			name: 'Stats',
			props: { id: 'figure-in-short', items: [{ of: 'lessons', label: 'lessons' }] },
		});
		expect(figures.get('figure-growth')?.props.points).toEqual([{ date: '2026-09-20', lessons: 10 }]);
	});
	it('fails on two elements with one id, and on an id that is no string', () => {
		expect(() => aboutFiguresById('<Stats id="a" items={[]} />\n\n<BarChart id="a" rows={[]} />', 'p.mdx')).toThrow(
			/p\.mdx: two elements have id="a"/,
		);
		expect(() => aboutFiguresById('<Stats id={3} items={[]} />', 'p.mdx')).toThrow(
			/<Stats> has an id that is no string/,
		);
	});
	it('leaves an element without an id alone, even with a computed prop', () => {
		expect(aboutFiguresById('<Stats items={items} />', 'p.mdx').size).toBe(0);
	});
});

describe('aboutFigureById', () => {
	it('returns a known figure and names the known ids for an unknown one', () => {
		const figures = aboutFiguresById(body, 'about.mdx');
		expect(aboutFigureById(figures, 'figure-growth').name).toBe('GrowthChart');
		expect(() => aboutFigureById(figures, 'figure-grow')).toThrow(
			/no figure with id="figure-grow"\. Known ids: figure-growth, figure-in-short/,
		);
	});
});

describe('aboutFiguresOf', () => {
	it('parses a body once, and again when it changes', () => {
		const first = aboutFiguresOf(body);
		expect(aboutFiguresOf(body)).toBe(first);
		const changed = aboutFiguresOf(`${body}\n<Stats id="figure-more" items={[]} />\n`);
		expect(changed).not.toBe(first);
		expect(changed.has('figure-more')).toBe(true);
	});
});
