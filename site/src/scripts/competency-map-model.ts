/**
 * The DOM-free part of the competency map (issue #514): the order of the
 * competency boxes in an area column, and the state of each competency and
 * objective from the live lessons that serve it. The state rule is the topic
 * map's `topicState`, so the two maps agree. `competency-map.ts` colors the
 * map from these, and `CompetencyMap.astro` orders it.
 */
import type { ProgressRecord } from './progress-model';
import { topicState } from './topic-map-model';

/** An objective and the live lessons that serve it, as the component passes it in `data-coverage`. */
export interface ObjectiveCoverage {
	id: string;
	lessons: string[];
}

/** A competency and its objectives, in YAML order. */
export interface CompetencyCoverage {
	id: string;
	objectives: ObjectiveCoverage[];
}

export type MapState = ReturnType<typeof topicState>;

/**
 * The live lessons that serve any objective of the competency, each once,
 * so a lesson that serves two of its objectives counts once.
 */
export function competencyLessons(c: CompetencyCoverage): string[] {
	return [...new Set(c.objectives.flatMap((o) => o.lessons))];
}

/**
 * The state of every competency and every objective on the map, keyed by
 * id. A competency takes the state of the lessons that serve any of its
 * objectives, and an objective of the lessons that serve it.
 */
export function competencyMapStates(
	coverage: readonly CompetencyCoverage[],
	rec: ProgressRecord,
): { competencies: Map<string, MapState>; objectives: Map<string, MapState> } {
	const competencies = new Map<string, MapState>();
	const objectives = new Map<string, MapState>();
	for (const c of coverage) {
		competencies.set(c.id, topicState(competencyLessons(c), rec));
		for (const o of c.objectives) objectives.set(o.id, topicState(o.lessons, rec));
	}
	return { competencies, objectives };
}

/** What the ordering needs of a competency. */
export interface Orderable {
	statement: string;
	objectives: readonly { id: string }[];
}

/**
 * The competencies of one area in course order: a competency goes first
 * when the first lesson in the course plan that serves one of its
 * objectives comes earlier. A competency that no plan entry serves goes
 * last. Ties go by statement.
 */
export function orderByCoursePlan<T extends Orderable>(
	competencies: readonly T[],
	plan: readonly { serves: readonly string[] }[],
): T[] {
	const first = (c: T) => {
		const own = new Set(c.objectives.map((o) => o.id));
		const i = plan.findIndex((e) => e.serves.some((s) => own.has(s)));
		return i < 0 ? Number.POSITIVE_INFINITY : i;
	};
	const rank = new Map(competencies.map((c) => [c, first(c)]));
	return [...competencies].sort(
		(a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0) || a.statement.localeCompare(b.statement),
	);
}
