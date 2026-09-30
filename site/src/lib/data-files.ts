import { parse } from 'yaml';
import { absoluteUrl } from './url';

/**
 * The data tree as JSON (spec S12 "Data tree as JSON"): `groups.yaml` and
 * each YAML file under `areas/` in `site/src/data/` publish as one JSON file
 * each under `<base>/data/`, and `/data/index.json` lists them.
 *
 * The files are read raw and parsed with the `yaml` package, as
 * `scripts/lib/area-tree.mjs` does, and not through the content collections:
 * a date stays a `YYYY-MM-DD` string and keys keep their source order
 * (S12 "Files"). `publishedPath`, `publishedData`, `dataFilesOf` and
 * `dataIndexOf` are pure, so the tests run them on small inputs, and
 * `dataFiles` is the one function that reads the tree.
 * `mise run bundles` (`scripts/lib/bundles.mjs`, `checkDataFiles`) reads the
 * built files back and compares them with the YAML.
 */

/** The version of `/data/index.json` (S12 "Index"). Bumped when a field changes meaning. */
export const DATA_INDEX_VERSION = 1;

/** One published data file: its path under `/data/` without `.json`, and its content. */
export interface DataFile {
	path: string;
	data: unknown;
}

/**
 * Where the source file at `rel` (a path under `site/src/data/`, such as
 * `areas/safety/topics/agent-risk.yaml`) publishes, as a path under `/data/`
 * without `.json`, per the table in S12 "Files". `null` for a file S12 does
 * not publish: `bibliography.yaml` and `alignment/`.
 */
export function publishedPath(rel: string): string | null {
	if (rel === 'groups.yaml') return 'groups';
	const area = /^areas\/([^/]+)\/area\.yaml$/.exec(rel);
	if (area) return `areas/${area[1]}`;
	const unit = /^areas\/([^/]+)\/(topics|competencies|courses|lessons)\/([^/]+)\.yaml$/.exec(rel);
	if (!unit) return null;
	const [, dir, kind, stem] = unit;
	// A course id is its area id (S01 "Identifiers"), so a course has one segment.
	if (kind === 'courses') return `courses/${stem}`;
	// `/data/lessons/` holds the lesson bundles (S08), so a lesson file publishes under `lesson-plans/`.
	if (kind === 'lessons') return `lesson-plans/${dir}/${stem}`;
	return `${kind}/${dir}/${stem}`;
}

/** `value` without its `notes` key, other keys in their order. A value that is not a plain object is returned as is. */
function withoutNotes(value: unknown): unknown {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
	return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'notes'));
}

/**
 * A parsed YAML file as it publishes: the same keys in the same order,
 * minus every `notes` field S09, S10 and S11 define as prose for authors
 * (the top-level one of an area, competency, course or lesson file, and
 * the one of each course part).
 */
export function publishedData(data: unknown): unknown {
	const out = withoutNotes(data);
	if (out !== null && typeof out === 'object' && !Array.isArray(out) && 'parts' in out) {
		const parts = (out as { parts: unknown }).parts;
		if (Array.isArray(parts)) return { ...out, parts: parts.map(withoutNotes) };
	}
	return out;
}

/**
 * The published files of a data tree given as raw text by path under
 * `site/src/data/`, sorted by published path. A file S12 does not publish is
 * left out.
 */
export function dataFilesOf(raw: Record<string, string>): DataFile[] {
	const out: DataFile[] = [];
	for (const [rel, text] of Object.entries(raw)) {
		const path = publishedPath(rel);
		if (path !== null) out.push({ path, data: publishedData(parse(text)) });
	}
	return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const ROOT = '../data/';
const RAW = import.meta.glob<string>(['../data/groups.yaml', '../data/areas/**/*.yaml'], {
	query: '?raw',
	import: 'default',
	eager: true,
});

/** Every published file of `site/src/data/`, read at build time. */
export function dataFiles(): DataFile[] {
	return dataFilesOf(Object.fromEntries(Object.entries(RAW).map(([p, text]) => [p.slice(ROOT.length), text])));
}

/** The JSON text of a published file: two-space indent and a final newline, as the other `/data/` files. */
export function dataJson(data: unknown): string {
	return `${JSON.stringify(data, null, 2)}\n`;
}

export interface DataIndexEntry {
	id: string;
	url: string;
	page: string;
}

export interface DataIndexLesson {
	id: string;
	plan: string;
	live: boolean;
	page: string | null;
	bundle: string | null;
}

export interface DataIndexArea extends DataIndexEntry {
	topics: DataIndexEntry[];
	competencies: DataIndexEntry[];
	courses: { id: string; url: string }[];
	lessons: DataIndexLesson[];
}

export interface DataIndex {
	version: typeof DATA_INDEX_VERSION;
	groups: string;
	checkpoints: string;
	areas: DataIndexArea[];
}

/** The ids after `<kind>/` of the published files under `<kind>/<area>/`, in path order. */
function idsUnder(paths: string[], kind: string, area: string): string[] {
	const prefix = `${kind}/${area}/`;
	return paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(kind.length + 1));
}

/** The lesson ids of a course file in course order: the flat `lessons` list, or the `parts` lists joined. */
function courseLessons(course: unknown): string[] {
	const c = course as { lessons?: unknown; parts?: unknown } | null;
	if (Array.isArray(c?.lessons)) return c.lessons.filter((id): id is string => typeof id === 'string');
	if (Array.isArray(c?.parts))
		return c.parts.flatMap((p: { lessons?: unknown }) =>
			Array.isArray(p?.lessons) ? p.lessons.filter((id): id is string => typeof id === 'string') : [],
		);
	return [];
}

/**
 * `/data/index.json` (S12 "Index") for the published `files`, with absolute
 * URLs on `site`. Areas are in group order (groups by their `order`, then
 * the areas each lists), topics and competencies in file name order, and the
 * lessons of an area in its course's order. A lesson is live when `liveIds`
 * has it: its lesson page exists, and then its bundle does too (S08).
 */
export function dataIndexOf(files: DataFile[], liveIds: ReadonlySet<string>, site: string): DataIndex {
	const url = (path: string) => absoluteUrl(path, site);
	const byPath = new Map(files.map((f) => [f.path, f.data]));
	const paths = files.map((f) => f.path);
	const groups = byPath.get('groups');
	const areaIds = (Array.isArray(groups) ? [...groups] : [])
		.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
		.flatMap((g) => (Array.isArray(g?.areas) ? g.areas : []))
		.filter((a): a is string => typeof a === 'string' && byPath.has(`areas/${a}`));
	const areas = areaIds.map((area) => {
		const courseIds = paths.filter((p) => p.startsWith('courses/')).map((p) => p.slice('courses/'.length));
		const courses = courseIds.filter((id) => (byPath.get(`courses/${id}`) as { area?: unknown })?.area === area);
		const lessons = courses.flatMap((id) => courseLessons(byPath.get(`courses/${id}`)));
		return {
			id: area,
			url: url(`/data/areas/${area}.json`),
			page: url(`/${area}/`),
			topics: idsUnder(paths, 'topics', area).map((id) => ({
				id,
				url: url(`/data/topics/${id}.json`),
				page: url(`/topics/${id}/`),
			})),
			competencies: idsUnder(paths, 'competencies', area).map((id) => ({
				id,
				url: url(`/data/competencies/${id}.json`),
				page: url(`/competencies/${id}/`),
			})),
			courses: courses.map((id) => ({ id, url: url(`/data/courses/${id}.json`) })),
			lessons: lessons.map((id) => {
				const live = liveIds.has(id);
				return {
					id,
					plan: url(`/data/lesson-plans/${id}.json`),
					live,
					page: live ? url(`/${id}/`) : null,
					bundle: live ? url(`/data/lessons/${id}.json`) : null,
				};
			}),
		};
	});
	return {
		version: DATA_INDEX_VERSION,
		groups: url('/data/groups.json'),
		checkpoints: url('/data/checkpoints.json'),
		areas,
	};
}
