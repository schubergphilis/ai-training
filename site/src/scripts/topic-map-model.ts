/**
 * The DOM-free part of the topic map (spec S02 "Rendering rules"): a topic's
 * state from the lessons that cover it, and the prerequisite edge paths from
 * box positions. `topic-map.ts` draws the map from these.
 */
import type { Box } from './course-graph-model';
import type { ProgressRecord } from './progress-model';

export type { Box } from './course-graph-model';

/** A topic and the live lessons that cover it, as the component passes it in `data-coverage`. */
export interface TopicCoverage {
	id: string;
	lessons: string[];
}

/**
 * Finished once every covering lesson is finished or skipped, in progress
 * once any has an entry, else untouched. A topic without lessons stays
 * untouched, which the map shows as not started.
 */
export function topicState(lessons: readonly string[], rec: ProgressRecord): 'finished' | 'in-progress' | 'untouched' {
	const states = lessons.map((l) => rec.lessons[l]?.state);
	if (lessons.length && states.every((s) => s === 'finished' || s === 'skipped')) return 'finished';
	return states.some(Boolean) ? 'in-progress' : 'untouched';
}

/**
 * The path from a prerequisite box to the topic box, relative to the map.
 * In one column it is a straight line from bottom center to top center.
 * Across columns it is a curve between the facing side centers.
 */
export function topicEdgePath(from: Box, to: Box, map: Box): string {
	const sameCol = Math.abs(from.left - to.left) < 2;
	if (sameCol) {
		const x1 = from.left + from.width / 2 - map.left;
		const x2 = to.left + to.width / 2 - map.left;
		return `M${x1},${from.bottom - map.top} L${x2},${to.top - map.top}`;
	}
	const rightward = from.left < to.left;
	const x1 = (rightward ? from.right : from.left) - map.left;
	const y1 = from.top + from.height / 2 - map.top;
	const x2 = (rightward ? to.left : to.right) - map.left;
	const y2 = to.top + to.height / 2 - map.top;
	const mx = (x1 + x2) / 2;
	return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
