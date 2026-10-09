import { getCollection } from 'astro:content';
import { KIND_OF_TAG, PHASES } from './checkpoint-rules';
import { attrsOf, checkpointTagsOfSource, jsxElements, parseMdx } from './checkpoint-tags';
import { lessonTime } from './lesson-time';

/**
 * The content figures of the About page (`src/content/docs/about.mdx`,
 * issue #762), counted from the data tree and the lesson pages at build
 * time, so the page never states a stale count. The page shows one figure
 * with `<AboutFigure of="key" />`, and an unknown key fails the build.
 * `getAboutFigures` reads the collections into an `AboutInput`, and
 * `aboutFigures` counts it without reading a collection, so the tests run
 * it directly.
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

/**
 * The counts of one lesson body. Checkpoints come from the site's own tag reader
 * (`checkpointTagsOfSource`), so a checkpoint counts here exactly when it counts on the lesson page,
 * an ungraded `Predict` included. Exercises, habits, widgets and runnable examples are read from the tree.
 */
function countLesson(out: Map<string, number>, lesson: { id: string; body: string }, widgets: Set<string>): void {
	const area = areaOf(lesson.id);
	const where = `src/content/docs/${lesson.id}.mdx`;
	for (const { kind, phase } of checkpointTagsOfSource(lesson.body, where)) {
		if (phase === 'first') {
			addPerArea(out, 'checkpoints', area);
			add(out, `checkpoints:${kind}`);
		} else add(out, `checkpoints-${phase}`);
	}
	for (const el of jsxElements(parseMdx(lesson.body))) {
		const name = el.name ?? '';
		if (name === 'Predict' && attrsOf(el, where).has('run')) add(out, 'examples-run');
		else if (name === 'Exercise') addPerArea(out, 'exercises', area);
		else if (name === 'Habit') addPerArea(out, 'habits', area);
		else if (widgets.has(name)) add(out, 'widget-uses');
	}
	// The rounded time each course plan table shows, so the course tables add up to the About figure.
	add(out, 'minutes', lessonTime(lesson.body, where).minutes);
}

/**
 * The keys whose value can be a true zero, set to 0 first: a figure that drops to zero then shows `0`,
 * and only a misspelled key fails the build.
 */
function zeroKeys(input: AboutInput): string[] {
	const areas = input.groups.flatMap((g) => g.areas);
	const perArea = [
		'lessons',
		'lessons-planned',
		'topics',
		'concepts',
		'competencies',
		'objectives',
		'checkpoints',
		'exercises',
		'habits',
	];
	return [
		...perArea,
		...perArea.flatMap((k) => areas.map((a) => `${k}:${a}`)),
		...Object.values(KIND_OF_TAG).map((k) => `checkpoints:${k}`),
		...PHASES.filter((p) => p !== 'first').map((p) => `checkpoints-${p}`),
		...SOURCE_TYPES.map((t) => `sources:${t}`),
		'lessons-planned:tutorial',
		'lessons-planned:explanation',
		'objectives:base',
		'objectives:expert',
		'behaviors',
		'examples-run',
		'widget-uses',
	];
}

/** The `type` values of a bibliography entry (`content.config.ts`, spec S01 "Source"). */
const SOURCE_TYPES = ['book', 'course', 'paper', 'reference', 'video'];

/** Every figure the About page can show, by key. */
export function aboutFigures(input: AboutInput): Map<string, number> {
	const out = new Map<string, number>(zeroKeys(input).map((k) => [k, 0]));
	out.set('groups', input.groups.length);
	out.set('checkpoint-kinds', Object.keys(KIND_OF_TAG).length);
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

let cached: { key: string; figures: Map<string, number> } | undefined;

/**
 * The figures of the current input. The page uses a figure many times, and counting parses every lesson
 * body, so the figures are kept with the input they were counted from. A call reads the collections, which
 * Astro keeps in memory, and counts again only when the input changed: under the dev server, a new lesson
 * shows in the counts without a restart, and a page load doesn't parse every lesson once per figure.
 */
export async function getAboutFigures(): Promise<Map<string, number>> {
	const input = await loadAboutInput();
	const key = JSON.stringify(input);
	if (cached?.key !== key) cached = { key, figures: aboutFigures(input) };
	return cached.figures;
}

async function loadAboutInput(): Promise<AboutInput> {
	const docs = await getCollection('docs');
	return {
		groups: (await getCollection('groups')).map((g) => g.data),
		courses: (await getCollection('courses')).map((c) => c.data),
		lessonPlans: (await getCollection('lessonPlans')).map((p) => ({ id: p.data.id, mode: p.data.mode })),
		lessons: docs.filter((d) => Boolean(d.data.mode)).map((d) => ({ id: d.id, body: d.body ?? '' })),
		topics: (await getCollection('topics')).map((t) => t.data),
		competencies: (await getCollection('competencies')).map((c) => c.data),
		alignment: (await getCollection('alignment')).map((a) => a.data),
		bibliography: (await getCollection('bibliography')).map((b) => b.data),
		widgets: widgetNames(WIDGET_FILES),
	};
}
