import {
	type CompetencyCoverage,
	competencyLessons,
	competencyMapStates,
	orderByCoursePlan,
} from '@scripts/competency-map-model';
import { emptyRecord } from '@scripts/progress-model';
import { describe, expect, it } from 'vitest';

// Two competencies whose objectives share the lesson a/shared, and one objective per competency with its own lesson.
const coverage: CompetencyCoverage[] = [
	{
		id: 'a/one',
		objectives: [
			{ id: 'a/one/x', lessons: ['a/shared', 'a/first'] },
			{ id: 'a/one/y', lessons: ['a/shared'] },
		],
	},
	{
		id: 'a/two',
		objectives: [
			{ id: 'a/two/z', lessons: ['a/shared'] },
			{ id: 'a/two/w', lessons: ['a/second'] },
			{ id: 'a/two/gap', lessons: [] },
		],
	},
];

describe('competencyLessons', () => {
	it('lists a lesson that serves two objectives once', () => {
		expect(competencyLessons(coverage[0] as CompetencyCoverage)).toEqual(['a/shared', 'a/first']);
	});
});

describe('competencyMapStates', () => {
	it('is untouched everywhere on an empty record', () => {
		const { competencies, objectives } = competencyMapStates(coverage, emptyRecord());
		expect([...competencies.values()]).toEqual(['untouched', 'untouched']);
		expect(objectives.size).toBe(5);
		expect([...objectives.values()].every((s) => s === 'untouched')).toBe(true);
	});

	it('colors both competencies from one shared lesson, each by its own other lessons', () => {
		const rec = emptyRecord();
		rec.lessons['a/shared'] = { state: 'finished', at: '2026-01-01' };
		rec.lessons['a/first'] = { state: 'skipped', at: '2026-01-01' };
		const { competencies, objectives } = competencyMapStates(coverage, rec);
		expect(competencies.get('a/one')).toBe('finished');
		expect(objectives.get('a/one/x')).toBe('finished');
		expect(objectives.get('a/one/y')).toBe('finished');
		// a/two also needs a/second, so the shared lesson makes it in progress.
		expect(competencies.get('a/two')).toBe('in-progress');
		expect(objectives.get('a/two/z')).toBe('finished');
		expect(objectives.get('a/two/w')).toBe('untouched');
		expect(objectives.get('a/two/gap')).toBe('untouched');
	});

	it('is in progress for a lesson that is only read', () => {
		const rec = emptyRecord();
		rec.lessons['a/first'] = { state: 'read', at: '2026-01-01' };
		const { competencies, objectives } = competencyMapStates(coverage, rec);
		expect(competencies.get('a/one')).toBe('in-progress');
		expect(objectives.get('a/one/x')).toBe('in-progress');
		expect(objectives.get('a/one/y')).toBe('untouched');
		expect(competencies.get('a/two')).toBe('untouched');
	});
});

describe('orderByCoursePlan', () => {
	const c = (statement: string, ...objectives: string[]) => ({
		statement,
		objectives: objectives.map((id) => ({ id })),
	});
	const plan = [{ serves: [] }, { serves: ['late/o'] }, { serves: ['early/o', 'tie-b/o'] }, { serves: ['tie-a/o'] }];

	it('orders by the first plan entry that serves one of the objectives', () => {
		const late = c('Aaa', 'late/o');
		const early = c('Zzz', 'nothing/o', 'early/o');
		expect(orderByCoursePlan([early, late], plan)).toEqual([late, early]);
	});

	it('breaks a tie by statement, when one entry serves both', () => {
		const b = c('Beta', 'tie-b/o');
		const a = c('Alpha', 'early/o');
		expect(orderByCoursePlan([b, a], plan)).toEqual([a, b]);
	});

	it('puts a competency no entry serves last, by statement among themselves', () => {
		const none2 = c('Yes', 'x/o');
		const none1 = c('Maybe', 'y/o');
		const served = c('Zulu', 'tie-a/o');
		expect(orderByCoursePlan([none2, served, none1], plan)).toEqual([served, none1, none2]);
	});
});
