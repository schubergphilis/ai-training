import { getCollection } from 'astro:content';
import { type CheckpointTag, KIND_OF_TAG } from './checkpoint-rules';
import { attrsOf, jsxElements, parseMdx, phaseProp } from './checkpoint-tags';
import { lessonTime } from './lesson-time';

/**
 * The content figures of the About page (`src/content/docs/about.mdx`,
 * issue #762), counted from the data tree and the lesson pages at build
 * time, so the page never states a stale count. The page shows one figure
 * with `<AboutFigure of="key" />`, and an unknown key fails the build.
 * `getAboutFigures` reads the collections into an `AboutInput` once per
 * build, and `aboutFigures` counts it without reading a collection, so the
 * tests run it directly.
 *
 * Keys are kebab-case. A per-area figure is the key, a colon and the area
 * slug (`lessons:concepts`). A per-kind figure is the key, a colon and the
 * kind (`checkpoints:multi-choice`, `sources:paper`).
 */

export interface AboutInput {
	groups: { areas: string[] }[];
	courses: { area: string; parts?: unknown[] }[];
	/** Every lesson plan file. The id is `<area>/<lesson>`. */
	lessonPlans: { id: string; mode: 'tutorial' | 'explanation' }[];
	/** Every live lesson page: its id `<area>/<lesson>` and its MDX body. */
	lessons: { id: string; body: string }[];
	topics: { area: string; concepts: unknown[] }[];
	competencies: { area: string; objectives: { level: 'base' | 'expert'; behaviors: unknown[] }[] }[];
	alignment: { rows: unknown[] }[];
	bibliography: { type: string }[];
	/** The component names of the interactive widgets (`components/widgets/*.astro`). */
	widgets: string[];
}

/** The area slug of a `<area>/<lesson>` id. */
const areaOf = (id: string) => id.split('/')[0] ?? id;

/** Adds `n` to `key` in `out`, starting at zero. */
function add(out: Map<string, number>, key: string, n = 1): void {
	out.set(key, (out.get(key) ?? 0) + n);
}

/** Adds `n` to `key` and to `key:<area>`. */
function addPerArea(out: Map<string, number>, key: string, area: string, n = 1): void {
	add(out, key, n);
	add(out, `${key}:${area}`, n);
}

/** The counts of one lesson body: its checkpoints by phase and kind, exercises, habits, widgets and runnable examples. */
function countLesson(out: Map<string, number>, lesson: { id: string; body: string }, widgets: Set<string>): void {
	const area = areaOf(lesson.id);
	const where = `src/content/docs/${lesson.id}.mdx`;
	for (const el of jsxElements(parseMdx(lesson.body))) {
		const name = el.name ?? '';
		const attrs = attrsOf(el, where);
		if (name === 'Predict' && attrs.has('run')) add(out, 'examples-run');
		if (name in KIND_OF_TAG) {
			// A Predict without an objective is an ungraded example, no checkpoint (spec S03 "Examples").
			if (name === 'Predict' && !attrs.has('objective')) continue;
			const phase = phaseProp(where, attrs);
			if (phase === 'first') {
				addPerArea(out, 'checkpoints', area);
				add(out, `checkpoints:${KIND_OF_TAG[name as CheckpointTag]}`);
			} else {
				add(out, `checkpoints-${phase}`);
			}
		} else if (name === 'Exercise') addPerArea(out, 'exercises', area);
		else if (name === 'Habit') addPerArea(out, 'habits', area);
		else if (widgets.has(name)) add(out, 'widget-uses');
	}
	add(out, 'minutes', lessonTime(lesson.body, where).totalMinutes);
}

/** Every figure the About page can show, by key. */
export function aboutFigures(input: AboutInput): Map<string, number> {
	const out = new Map<string, number>();
	out.set('groups', input.groups.length);
	out.set(
		'areas',
		input.groups.reduce((n, g) => n + g.areas.length, 0),
	);
	out.set('courses', input.courses.length);
	out.set(
		'course-parts',
		input.courses.reduce((n, c) => n + (c.parts?.length ?? 0), 0),
	);
	for (const p of input.lessonPlans) {
		addPerArea(out, 'lessons-planned', areaOf(p.id));
		add(out, `lessons-planned:${p.mode}`);
	}
	for (const t of input.topics) {
		addPerArea(out, 'topics', t.area);
		addPerArea(out, 'concepts', t.area, t.concepts.length);
	}
	for (const c of input.competencies) {
		addPerArea(out, 'competencies', c.area);
		for (const o of c.objectives) {
			addPerArea(out, 'objectives', c.area);
			add(out, `objectives:${o.level}`);
			add(out, 'behaviors', o.behaviors.length);
		}
	}
	out.set('alignment-frameworks', input.alignment.length);
	out.set(
		'alignment-rows',
		input.alignment.reduce((n, a) => n + a.rows.length, 0),
	);
	for (const b of input.bibliography) add(out, `sources:${b.type}`);
	out.set('sources', input.bibliography.length);
	out.set('widget-kinds', input.widgets.length);

	const widgets = new Set(input.widgets);
	for (const l of input.lessons) {
		addPerArea(out, 'lessons', areaOf(l.id));
		countLesson(out, l, widgets);
	}
	// The site's own time estimate of every live lesson (spec S03 "Lesson time"), in whole hours.
	out.set('study-hours', Math.round((out.get('minutes') ?? 0) / 60));
	out.delete('minutes');
	return out;
}

/** One figure for the page, formatted with a thousands separator. An unknown key fails the build with the keys it knows. */
export function aboutFigure(figures: Map<string, number>, key: string): string {
	const value = figures.get(key);
	if (value === undefined) {
		const known = [...figures.keys()].sort().join(', ');
		throw new Error(`about.mdx: <AboutFigure of="${key}" /> names no figure. Known figures: ${known}`);
	}
	return value.toLocaleString('en-US');
}

/** The widget component names, from the files in `components/widgets/`. */
const WIDGET_FILES = Object.keys(import.meta.glob('../components/widgets/*.astro'));
export const widgetNames = (files: string[]) => files.map((f) => f.replace(/^.*\//, '').replace(/\.astro$/, '')).sort();

let cached: Promise<Map<string, number>> | undefined;

/** The figures of the current build, read once: the page uses `<AboutFigure>` many times. */
export function getAboutFigures(): Promise<Map<string, number>> {
	cached ??= loadAboutFigures();
	return cached;
}

async function loadAboutFigures(): Promise<Map<string, number>> {
	const docs = await getCollection('docs');
	return aboutFigures({
		groups: (await getCollection('groups')).map((g) => g.data),
		courses: (await getCollection('courses')).map((c) => c.data),
		lessonPlans: (await getCollection('lessonPlans')).map((p) => ({ id: p.data.id, mode: p.data.mode })),
		lessons: docs.filter((d) => Boolean(d.data.mode)).map((d) => ({ id: d.id, body: d.body ?? '' })),
		topics: (await getCollection('topics')).map((t) => t.data),
		competencies: (await getCollection('competencies')).map((c) => c.data),
		alignment: (await getCollection('alignment')).map((a) => a.data),
		bibliography: (await getCollection('bibliography')).map((b) => b.data),
		widgets: widgetNames(WIDGET_FILES),
	});
}
