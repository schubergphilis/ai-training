/**
 * What the e2e specs need to know about the content without counting it by
 * hand: which lessons are live, per course, per topic and per objective, and which graded
 * checkpoints and ungraded examples a lesson page has. A lesson is live when
 * its lesson file under site/src/data has a page under site/src/content/docs,
 * so the course percentage a spec expects depends on the content directory.
 * The specs compute their counts from here and a new lesson page needs no
 * spec change.
 *
 * The tree is read through `readAreaTree` and the pages through
 * `lessonPages`, the same readers `check-data` uses. The checkpoints are read
 * through the tag reader the build uses, with the id guard of the export
 * check, and the examples through the example runner's reader.
 * `tests/scripts/live-lessons.test.ts` covers this; `e2e/fixtures.ts` wraps
 * it with the repository paths.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkpointTagsOfSource } from '../../src/lib/checkpoint-tags.ts';
import { courseLessonIds, readAreaTree } from './area-tree.mjs';
import { checkpointTagId } from './checkpoints.mjs';
import { lessonPages } from './data.mjs';
import { predictTags } from './examples.mjs';

/**
 * @typedef {{ id: string, area: string, topic: string }} LiveLesson A live lesson, its area (which is its course, spec S01) and the topic it covers.
 * @typedef {{ id: string, kind: string, phase: string }} PageCheckpoint One graded checkpoint tag of a lesson page, as the page shows it.
 * @typedef {{ id: string, run: string | undefined }} PageExample One ungraded example of a lesson page and the fixture it runs from.
 */

/**
 * Every live lesson in course order, across areas. A lesson a course lists
 * without a page is planned and left out.
 * @param {string} dataDir site/src/data
 * @param {string} contentDir site/src/content/docs
 * @returns {LiveLesson[]}
 */
export function liveLessons(dataDir, contentDir) {
	const tree = readAreaTree(dataDir);
	const pages = lessonPages(contentDir, new Set(tree.areas.map((a) => a.dir)));
	/** @type {LiveLesson[]} */
	const out = [];
	for (const a of tree.areas) {
		const covers = new Map(a.lessons.map((l) => [l.data?.id, l.data?.covers ?? '']));
		for (const course of a.courses) {
			for (const id of courseLessonIds(course.data)) {
				if (!pages.has(id)) continue;
				out.push({ id, area: a.dir, topic: covers.get(id) ?? '' });
			}
		}
	}
	return out;
}

/**
 * The live lesson ids of the course of `area`, in course order.
 * @param {string} dataDir
 * @param {string} contentDir
 * @param {string} area
 * @returns {string[]}
 */
export function liveCourseLessonIds(dataDir, contentDir, area) {
	return liveLessons(dataDir, contentDir)
		.filter((l) => l.area === area)
		.map((l) => l.id);
}

/**
 * The live lesson ids that cover `topic`, in course order.
 * @param {string} dataDir
 * @param {string} contentDir
 * @param {string} topic
 * @returns {string[]}
 */
export function liveTopicLessonIds(dataDir, contentDir, topic) {
	return liveLessons(dataDir, contentDir)
		.filter((l) => l.topic === topic)
		.map((l) => l.id);
}

/**
 * The live lesson ids that serve `objective`, in course order across areas.
 * @param {string} dataDir
 * @param {string} contentDir
 * @param {string} objective
 * @returns {string[]}
 */
export function liveObjectiveLessonIds(dataDir, contentDir, objective) {
	const tree = readAreaTree(dataDir);
	/** @type {Set<string>} */
	const serving = new Set();
	for (const a of tree.areas)
		for (const l of a.lessons) if ((l.data?.serves ?? []).includes(objective)) serving.add(l.data.id);
	return liveLessons(dataDir, contentDir)
		.filter((l) => serving.has(l.id))
		.map((l) => l.id);
}

/**
 * The graded checkpoints the page of `lesson` shows, in page order: every
 * `[data-checkpoint]` section, which is the `first` checkpoints and the
 * `practice` ones in "More practice", each with its `phase`. A hidden
 * `review` alternate is not listed, and neither is an ungraded example (a
 * `<Predict>` without an objective), as in the build. A spec that counts
 * what finishing needs filters on `phase === 'first'`. A tag without a
 * string `id` is reported as an error by the export check, so here it
 * throws.
 * @param {string} contentDir
 * @param {string} lesson `<area>/<lesson>`
 * @returns {PageCheckpoint[]}
 */
export function pageCheckpoints(contentDir, lesson) {
	const src = readFileSync(join(contentDir, `${lesson}.mdx`), 'utf8');
	return checkpointTagsOfSource(src, lesson)
		.filter((t) => t.phase !== 'review')
		.map((t) => {
			const id = checkpointTagId(t);
			if (id === undefined) throw new Error(`${lesson}: <${t.tag}> without an id="..."`);
			return { id, kind: t.kind, phase: t.phase };
		});
}

/**
 * The ids of the hidden `review` alternates on the page of `lesson`, in page
 * order: the checkpoints `pageCheckpoints` leaves out, which the review page
 * may ask in place of a `first` checkpoint (spec S05).
 * @param {string} contentDir
 * @param {string} lesson `<area>/<lesson>`
 * @returns {string[]}
 */
export function pageAlternates(contentDir, lesson) {
	const src = readFileSync(join(contentDir, `${lesson}.mdx`), 'utf8');
	return checkpointTagsOfSource(src, lesson)
		.filter((t) => t.phase === 'review')
		.map((t) => {
			const id = checkpointTagId(t);
			if (id === undefined) throw new Error(`${lesson}: <${t.tag}> without an id="..."`);
			return id;
		});
}

/**
 * The ungraded examples the page of `lesson` shows, in page order: every
 * `<Predict>` without an `objective`, as in the build (spec S03 "Examples"),
 * each with the `run` fixture CI verifies it from, or `undefined` when it
 * has none. The tags are read with the example runner's reader, which
 * throws on a tag it cannot read.
 * @param {string} contentDir
 * @param {string} lesson `<area>/<lesson>`
 * @returns {PageExample[]}
 */
export function pageExamples(contentDir, lesson) {
	const src = readFileSync(join(contentDir, `${lesson}.mdx`), 'utf8');
	return predictTags(src, lesson)
		.filter((t) => !t.attrs.has('objective'))
		.map((t) => {
			const id = checkpointTagId(t);
			if (id === undefined) throw new Error(`${lesson}: <Predict> example without an id="..."`);
			const run = t.attrs.get('run')?.value;
			return { id, run: typeof run === 'string' ? run : undefined };
		});
}
