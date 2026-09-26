import type { PlanEntry } from './courses';
import { lessonTime } from './lesson-time';

/**
 * The pure half of `components/CoursePlan.astro`: the course plan (spec S11)
 * as table cells. No DOM, no collections, so Vitest covers it directly.
 */

/** A competency as the `competencies` collection holds it, reduced to what the table needs. */
export interface CompetencyLike {
	id: string;
	objectives: { id: string }[];
}

/** One `serves` cell item: the id, its short tail, and the competency page anchor when one exists. */
export interface ObjectiveCell {
	id: string;
	tail: string;
	/** Root-relative path to the objective heading on its competency page, or undefined when no page has it. */
	path?: string;
}

/** The part of an id after its last slash; the whole id when it has none. */
export function idTail(id: string): string {
	return id.slice(id.lastIndexOf('/') + 1);
}

/**
 * Where an objective id links. The competency page (`pages/competencies/[...id].astro`)
 * gives each objective heading the id tail as its anchor.
 */
export function objectiveCells(serves: string[], competencies: CompetencyLike[]): ObjectiveCell[] {
	return serves.map((id) => {
		const owner = competencies.find((c) => c.objectives.some((o) => o.id === id));
		const tail = idTail(id);
		return owner ? { id, tail, path: `/competencies/${owner.id}/#${tail}` } : { id, tail };
	});
}

/** The titles of the `after` entries, in the listed order. An id the plan doesn't hold stays an id. */
export function afterTitles(after: string[], plan: PlanEntry[]): string[] {
	return after.map((id) => plan.find((e) => e.id === id)?.title ?? id);
}

/** The `<summary>` text: how many entries the plan holds and how many are live. */
export function planSummary(plan: PlanEntry[]): string {
	const live = plan.filter((e) => e.status === 'live').length;
	return `Lesson plan (${plan.length} lesson${plan.length === 1 ? '' : 's'}, ${live} live)`;
}

/** The exercise cell: each exercise's kind, so a course's mix of do and judge is visible at a glance. */
export function exerciseKinds(entry: Pick<PlanEntry, 'exercises'>): string {
	return entry.exercises.map((x) => x.kind).join(', ');
}

/** The GitHub issue URL of an entry, or undefined when it has none. */
export function issueUrl(issue: number | undefined): string | undefined {
	return issue === undefined ? undefined : `https://github.com/lsimons/ai-training/issues/${issue}`;
}

/** The Minutes cell: a number and whether it is the page's estimate or the plan's target. */
export interface MinutesCell {
	minutes: number;
	kind: 'estimate' | 'target';
}

/**
 * The Minutes cell of an entry (spec S11 "Lesson file"). A live lesson shows
 * the rounded estimate from its page (`lib/lesson-time.ts`, spec S03 "Lesson
 * time"), and a planned one the plan's `minutes` target. The page throws on a
 * component the estimate has no rule for, so the build fails there.
 */
export function minutesCell(entry: Pick<PlanEntry, 'id' | 'minutes' | 'status' | 'lesson'>): MinutesCell {
	if (entry.status === 'live' && entry.lesson) {
		const { minutes } = lessonTime(entry.lesson.body ?? '', `src/content/docs/${entry.id}.mdx`);
		return { minutes, kind: 'estimate' };
	}
	return { minutes: entry.minutes, kind: 'target' };
}
