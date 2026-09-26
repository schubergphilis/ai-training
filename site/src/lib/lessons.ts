import { type CollectionEntry, getCollection } from 'astro:content';
import { type CheckpointKind, type CheckpointPhase, DEFAULT_REVISION, isReviewable } from './checkpoint-rules';
import { type CheckpointTagInfo, checkpointTagsOfSource, conceptsProp, stringProp } from './checkpoint-tags';
import { type HabitInfo, habitTagsOfSource } from './habit-tags';

/**
 * A lesson page: a docs entry whose data the lesson docs loader filled from
 * its lesson YAML (spec S11 "Lesson page"), so `title`, `mode`, `covers` and
 * `serves` are always present.
 */
export type LessonData = CollectionEntry<'docs'>['data'] & {
	title: string;
	mode: 'tutorial' | 'explanation';
	covers: string;
	serves: string[];
};
export type Lesson = Omit<CollectionEntry<'docs'>, 'data'> & { data: LessonData };

export type { CheckpointAttr, CheckpointTagInfo } from './checkpoint-tags';
export { conceptsProp } from './checkpoint-tags';
export type { HabitInfo } from './habit-tags';

export interface CheckpointInfo {
	id: string;
	title: string;
	kind: CheckpointKind;
	reviewable: boolean;
	/** Bumped by authors when the answer changes (spec S05 "Content changes"). */
	revision: number;
	/** The one learning objective the checkpoint evidences (spec S03 "Checkpoints"). */
	objective: string;
	/** The S02 concept ids the checkpoint exercises, at least one (spec S03 "Checkpoints"). */
	concepts: string[];
	/** One paragraph that makes the item readable outside its lesson, shown on the review page. */
	context: string | undefined;
	hint: string;
	/** The children of the tag, as Markdown source. Empty for a self-closing tag. */
	stem: string;
	/**
	 * `first`, `review` or `practice` (spec S01 "Checkpoint"). Only `first` checkpoints count on the lesson
	 * page and in progress; `review` ones are hidden there, `practice` ones are in "More practice".
	 */
	phase: CheckpointPhase;
}

/** Every lesson: a docs entry with `mode`, which only the lesson YAML sets. */
export async function getLessons(area?: string): Promise<Lesson[]> {
	const docs = await getCollection('docs');
	return docs
		.filter((d): d is Lesson => Boolean(d.data.mode))
		.filter((d) => !area || d.id.startsWith(`${area}/`))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The `proofs` of a lesson's file (spec S11 "Lesson file"): the fixtures
 * behind a foundations page that `mise run examples` runs against the page's
 * `text` fences (spec S03 "Examples", #497). Empty for a lesson without them
 * and for a page that is no lesson.
 */
export async function lessonProofsOf(lessonId: string): Promise<string[]> {
	const plans = await getCollection('lessonPlans');
	return plans.find((p) => p.data.id === lessonId)?.data.proofs ?? [];
}

/**
 * The checkpoint tags of a lesson, read from the MDX tree of its body
 * (`lib/checkpoint-tags.ts`). A collection entry carries the source and not
 * the tree the page build made, and this reader is synchronous, so the body
 * is parsed here with the same parser rather than read from rendered
 * frontmatter. The remark plugin (`plugins/remark-checkpoints.mjs`) runs the
 * same function over the build's tree, so a tag that fails here failed the
 * page first, with the file path in the message.
 */
export function checkpointTagsOf(lesson: Lesson): CheckpointTagInfo[] {
	return checkpointTagsOfSource(lesson.body ?? '', lesson.id);
}

/**
 * One checkpoint from its tag. Component ids are the checkpoint ids (spec
 * S03). Reviewability follows the same rule the component uses for
 * `data-reviewable` (`lib/checkpoint-rules.ts`).
 */
export function checkpointOf(lesson: Lesson, { tag, kind, attrs, stem, phase }: CheckpointTagInfo): CheckpointInfo {
	const id = stringProp(`${lesson.id} <${tag}>`, attrs, 'id');
	if (!id) throw new Error(`${lesson.id}: <${tag}> without an id`);
	const where = `${lesson.id}#${id}`;
	const str = (name: string) => stringProp(where, attrs, name);
	const title = str('title') ?? id;
	const reviewAttr = attrs.get('review')?.value;
	if (reviewAttr !== undefined && typeof reviewAttr !== 'boolean') {
		throw new Error(`${where}: review must be {true} or {false}, got ${JSON.stringify(reviewAttr)}`);
	}
	const revisionAttr = attrs.get('revision')?.value;
	const revision = revisionAttr === undefined ? DEFAULT_REVISION : revisionAttr;
	if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1)
		throw new Error(`${where}: revision must be a positive integer, got ${JSON.stringify(revisionAttr)}`);
	const honor = kind === 'predict' && !attrs.has('answer');
	return {
		id,
		title,
		kind,
		revision,
		reviewable: isReviewable({ kind, review: reviewAttr, honor, phase }),
		objective: str('objective') ?? '',
		concepts: conceptsProp(where, attrs),
		context: str('context'),
		hint: str('hint') ?? '',
		stem,
		phase,
	};
}

/**
 * The checkpoints of a lesson, read from the MDX tree of its body. By default
 * only the lesson's own `first` phase, which the lesson page counts, finishing
 * needs, and progress figures use (spec S04 "Progress display"). Pass
 * `{ alternates: true }` to include the `review` and `practice` checkpoints too.
 */
export function checkpointsOf(lesson: Lesson, options: { alternates?: boolean } = {}): CheckpointInfo[] {
	const all = checkpointTagsOf(lesson).map((t) => checkpointOf(lesson, t));
	return options.alternates ? all : all.filter((c) => c.phase === 'first');
}

/**
 * The habits of a lesson (spec S07 "Authoring"), read from the MDX tree of
 * its body by `lib/habit-tags.ts`, which also applies the authoring rules:
 * at most two, kebab-case ids that are unique and not a section slug, after
 * the recap. The review page and the progress catalog read the text here.
 */
export function habitsOf(lesson: Lesson): HabitInfo[] {
	return habitTagsOfSource(lesson.body ?? '', lesson.id);
}
