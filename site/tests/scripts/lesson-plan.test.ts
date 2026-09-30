import { describe, expect, it, vi } from 'vitest';
import type { AreaTree } from '../../scripts/lib/area-tree.mjs';
import { lessonPlan } from '../../scripts/lib/lesson-plan.mjs';

type Area = { dir: string; courses: unknown[]; lessons: unknown[] };

/** A tree in the shape `readAreaTree` returns, with the given course and lesson file contents. */
function tree(areas: Area[]): AreaTree {
	return {
		groups: [],
		alignment: [],
		bibliographyKeys: new Set<string>(),
		bibliographySources: new Map<string, string | null | undefined>(),
		areas: areas.map((a) => ({
			dir: a.dir,
			area: { id: a.dir },
			topics: [],
			competencies: [],
			courses: a.courses.map((data, i) => ({ file: `${a.dir}-${i}.yaml`, stem: `${a.dir}-${i}`, data })),
			lessons: a.lessons.map((data, i) => ({ file: `${i}.yaml`, stem: `${i}`, data })),
		})),
	};
}

describe('lessonPlan', () => {
	it('prints every lesson with its issue, course position, after, assumes, serves and page', () => {
		const t = tree([
			{
				dir: 'a',
				courses: [{ id: 'a', area: 'a', lessons: ['a/live', 'a/two'] }],
				lessons: [
					{ id: 'a/two', title: 'Two', issue: 2, after: ['a/live'], serves: ['a/c/o2'] },
					{
						id: 'a/live',
						title: 'Live',
						issue: 1,
						serves: ['a/c/o1'],
						assumes: [{ objective: 'x/y/z', lesson: 'x/y', section: 's' }, { lesson: 'x/y' }, { objective: 'x/y/z' }],
					},
					{ id: 'a/unlisted' },
				],
			},
			{ dir: 'b', courses: [], lessons: [{ id: 'b/one', issue: 'nine', assumes: [{ objective: 'a/c/o1' }] }] },
		]);
		expect(lessonPlan(t, ['a/live'])).toEqual({
			lessons: [
				{
					id: 'a/two',
					area: 'a',
					title: 'Two',
					issue: 2,
					position: 2,
					after: ['a/live'],
					assumes: [],
					serves: ['a/c/o2'],
					live: false,
				},
				{
					id: 'a/live',
					area: 'a',
					title: 'Live',
					issue: 1,
					position: 1,
					after: [],
					assumes: ['x/y/z', 'x/y/z'],
					serves: ['a/c/o1'],
					live: true,
				},
				{
					id: 'a/unlisted',
					area: 'a',
					title: null,
					issue: null,
					position: null,
					after: [],
					assumes: [],
					serves: [],
					live: false,
				},
				{
					id: 'b/one',
					area: 'b',
					title: null,
					issue: null,
					position: null,
					after: [],
					assumes: ['a/c/o1'],
					serves: [],
					live: false,
				},
			],
		});
	});

	it('leaves out a lesson file without a string id, and keeps only string objectives', () => {
		const t = tree([
			{
				dir: 'a',
				courses: [],
				lessons: [null, { id: 3 }, { id: 'a/1', serves: ['a/c/o1', 4], assumes: [null, { objective: 5 }] }],
			},
		]);
		const plan = lessonPlan(t, []);
		expect(plan.lessons.map((l) => [l.id, l.serves, l.assumes])).toEqual([['a/1', ['a/c/o1'], []]]);
	});

	it('reads the course order from parts, across every course of the area in file order', () => {
		const t = tree([
			{
				dir: 'a',
				courses: [
					{ id: 'a', area: 'a', parts: [{ lessons: ['a/1'] }, { title: 'empty' }, { lessons: ['a/2'] }] },
					{ id: 'a-more', area: 'a', lessons: ['a/3', 'a/1'] },
				],
				lessons: [{ id: 'a/3' }, { id: 'a/2' }, { id: 'a/1' }],
			},
		]);
		expect(lessonPlan(t, []).lessons.map((l) => [l.id, l.position])).toEqual([
			['a/3', 3],
			['a/2', 2],
			['a/1', 1],
		]);
	});
});

describe('lesson-plan command', () => {
	it('prints the plan of this checkout as JSON with a trailing newline', async () => {
		// In-process: importing the script runs it once, and the spy collects what it writes. A `bun`
		// child process took over 5 s on a busy machine (#555).
		const chunks: string[] = [];
		const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
			chunks.push(String(chunk));
			return true;
		});
		try {
			await import('../../scripts/lesson-plan.mjs');
		} finally {
			write.mockRestore();
		}
		const out = chunks.join('');
		expect(out.endsWith('}\n')).toBe(true);
		const plan = JSON.parse(out);
		expect(plan.lessons.length).toBeGreaterThan(0);
		expect(plan.lessons.some((l: { live: boolean }) => l.live)).toBe(true);
		expect(Object.keys(plan.lessons[0])).toEqual([
			'id',
			'area',
			'title',
			'issue',
			'position',
			'after',
			'assumes',
			'serves',
			'live',
		]);
	});
});
