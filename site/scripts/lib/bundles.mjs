/**
 * The lesson bundle check's logic (spec S08 "Build"): the build writes one
 * `dist/data/lessons/<area>/<lesson>.json` per lesson page, and this reads
 * them back. `checkBundles` reports a problem when
 *
 * - a lesson page has no bundle file, or a bundle file has no lesson page;
 * - a bundle is not JSON, its `version` is not `BUNDLE_VERSION`, its `id` is
 *   not its path, or its `url` is not an absolute URL ending in `/<id>/`;
 * - a field S08 "Format" names is missing or has the wrong type, or `mode`
 *   is not `tutorial` or `explanation`;
 * - a fenced code block of the page (```` ``` ```` or `~~~`, three or more) is
 *   not in the bundle's `prose` byte for byte. The prose pass in
 *   `src/lib/lesson-bundles.ts` sets code aside so its rewrites skip it, and
 *   this is the check that it did;
 * - an ungraded example of the page (a `<Predict>` without `objective`, spec
 *   S03 "Examples") has no `Output:` line in `prose` followed by a `text`
 *   fenced block that holds its `answer`, trimmed, as the MDX tree reads it
 *   (`exampleAnswers`). The page shows that output, and no other bundle field
 *   holds it;
 * - a `(@` is in `prose`, a behavior's `claim`, `why` or `example`
 *   (`objectives[].behaviors[]`) or a checkpoint `stem` outside a fenced block or an inline code span,
 *   since the build renders each citation in them as its source (S08 "Lesson
 *   bundles", `src/lib/plain-citations.ts`).
 *
 * `checkExportCitations` applies the same token rule to the `stem` of every
 * item in the site-wide `dist/data/checkpoints.json`.
 *
 * The bundles are written by `src/pages/data/lessons/[...id].json.ts` from
 * the same content collections as the pages, and their unit tests run on
 * fixture lessons. This check reads the built files, so a rewrite that only
 * shows on a real lesson page fails in CI rather than on the tutor.
 * `scripts/check-bundles.mjs` is the command-line entry; tests import this.
 *
 * `checkDataFiles` checks the data tree as JSON (spec S12 "Data tree as
 * JSON"): each built `dist/data/<kind>/<id>.json` must be its YAML source
 * under `src/data/`, parsed with the `yaml` package and without its `notes`,
 * as the two-space JSON text the build writes. It reports a data-tree file
 * with no published file, a published file with no source, and a file whose
 * text differs, with the first line that differs. `checkDataIndex` checks
 * `dist/data/index.json` (S12 "Index") against the same list: each data file
 * listed once, every URL under the site root (`site-address.mjs`), each
 * data URL the built file its entry's `id` names, each `page` the built page
 * of its id, areas in group order and lessons in course order, and a lesson
 * `live` exactly when its bundle was built, with a null `page` and `bundle`
 * when it is planned. The source-to-path table is
 * written out here on purpose, not imported from `src/lib/data-files.ts`, so
 * a mistake in the route is not repeated in its check.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { BUNDLE_VERSION } from '../../src/lib/bundle-version.ts';
import { attrsOf, jsxElements, parseMdx, phaseProp, propValue } from '../../src/lib/checkpoint-tags.ts';
import { courseLessonIds, readAreaTree } from './area-tree.mjs';
import { lessonPages, walk } from './data.mjs';

/** Field name to the `typeof` it must have; the array fields follow. */
export const REQUIRED = {
	version: 'number',
	id: 'string',
	url: 'string',
	title: 'string',
	mode: 'string',
	prose: 'string',
};

/** The fields S08 "Format" lists as arrays. */
export const ARRAYS = ['topics', 'objectives', 'assumes', 'checkpoints', 'extends_to'];

export const MODES = new Set(['tutorial', 'explanation']);

/** The length of the run of `char` that `line` starts with, after its indentation. */
function fenceLength(line, char) {
	let i = 0;
	while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
	let n = 0;
	while (i + n < line.length && line[i + n] === char) n++;
	return n;
}

/** The fence character (backtick or tilde) `line` opens with, when it starts a run of three or more. */
function fenceChar(line) {
	for (const char of ['`', '~']) {
		if (fenceLength(line, char) >= 3) return char;
	}
	return null;
}

/**
 * Every fenced code block in `src`, opening line to closing line, as the
 * page holds it. A fence is a line that starts with three or more backticks
 * or tildes (after optional indentation), closed by a line of the same
 * character at least as long and nothing else but whitespace, or by the end
 * of the text. This reader is on purpose not the regex `setAsideCode` in
 * `src/lib/plain-citations.ts` uses, so a mistake there is not repeated in
 * the check of its output.
 */
export function fencedBlocks(src) {
	const lines = src.split('\n');
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		const char = fenceChar(lines[i]);
		if (!char) continue;
		const length = fenceLength(lines[i], char);
		const block = [lines[i]];
		for (i++; i < lines.length; i++) {
			block.push(lines[i]);
			const line = lines[i];
			const closes = fenceLength(line, char) >= length && line.trim() === char.repeat(line.trim().length);
			if (closes) break;
		}
		out.push(block.join('\n'));
	}
	return out;
}

/** `code` with every character but a line break removed, so the lines around it keep their numbers. */
const blankOut = (code) => code.replace(/[^\n]/g, '');

/**
 * Each line of `prose` that holds a `(@` outside code, trimmed. Code is the
 * fenced blocks `fencedBlocks` finds and, in the text around them, inline
 * spans: a run of backticks up to the next run of the same length within the
 * paragraph (CommonMark "Code spans"). A token left in the prose is a
 * citation the tutor would quote as raw syntax.
 */
export function citationsOutsideCode(prose) {
	let text = prose;
	for (const block of fencedBlocks(prose)) text = text.replace(block, blankOut(block));
	const outside = text
		.split(/(\n[ \t]*\n)/)
		.map((paragraph) => paragraph.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, blankOut))
		.join('');
	const lines = prose.split('\n');
	return outside.split('\n').flatMap((line, i) => (line.includes('(@') ? [(lines[i] ?? '').trim()] : []));
}

/**
 * The `answer` of each ungraded example in the lesson source `src`, in source
 * order, as `{ id, answer }`: every `<Predict>` without an `objective` prop and
 * not a hidden `review` alternate, read from the MDX tree the page build parses,
 * so the answer is the text the page shows. A parse error or an `answer` that
 * is not a string throws, with `where` in the message.
 */
export function exampleAnswers(src, where) {
	let tree;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${e.message}`);
	}
	const out = [];
	for (const node of jsxElements(tree)) {
		if (node.name !== 'Predict') continue;
		const attrs = attrsOf(node, where);
		if (attrs.has('objective') || phaseProp(where, attrs) === 'review') continue;
		const id = propValue(attrs, 'id');
		const answer = propValue(attrs, 'answer');
		if (typeof answer !== 'string') throw new Error(`${where} #${id}: answer of an example <Predict> must be a string`);
		out.push({ id: typeof id === 'string' ? id : '?', answer });
	}
	return out;
}

/**
 * Whether `prose` holds `answer` as an example output: an `Output:` line, a
 * blank line, and a `text` fenced block (any fence length) whose body is the
 * answer, trimmed.
 */
export function hasExampleOutput(prose, answer) {
	const body = answer.trim();
	return fencedBlocks(prose).some((block) => {
		const lines = block.split('\n');
		if (lines.length < 3 || !/^(`{3,}|~{3,})text$/.test(lines[0] ?? '')) return false;
		if (lines.slice(1, -1).join('\n') !== body) return false;
		return prose.includes(`Output:\n\n${block}`);
	});
}

/** `<area>/<lesson>` for every `.json` under `bundlesDir`. */
export function bundleIds(bundlesDir) {
	const out = new Set();
	if (!existsSync(bundlesDir)) return out;
	for (const p of walk(bundlesDir)) {
		if (p.endsWith('.json')) out.add(p.slice(bundlesDir.length + 1).replace(/\.json$/, ''));
	}
	return out;
}

/**
 * Whether `url` is an absolute URL whose path ends in `/<id>/`, the lesson
 * page under the site's origin and base. The origin is not checked here: it
 * is Astro's `site` in `astro.config.mjs`, and importing that config from a
 * `bun` script loads Starlight and every integration. `lessonUrl` in
 * `src/lib/lesson-bundles.ts` builds the URL from `site` and its unit test
 * pins how `site` and the base compose into it, so this check covers the
 * path only.
 */
export function isLessonUrl(url, id) {
	try {
		return new URL(url).pathname.endsWith(`/${id}/`);
	} catch {
		return false;
	}
}

/** The problems of one bundle `id` at `file` against its page source `src`. */
export function checkBundle(id, file, src) {
	const errors = [];
	let bundle;
	try {
		bundle = JSON.parse(readFileSync(file, 'utf8'));
	} catch (e) {
		return [`${id}: not JSON: ${e.message}`];
	}
	if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) return [`${id}: not a JSON object`];
	for (const [field, type] of Object.entries(REQUIRED)) {
		if (typeof bundle[field] !== type) errors.push(`${id}: ${field} must be a ${type}`);
	}
	for (const field of ARRAYS) {
		if (!Array.isArray(bundle[field])) errors.push(`${id}: ${field} must be a list`);
	}
	if (bundle.version !== BUNDLE_VERSION)
		errors.push(`${id}: version is ${JSON.stringify(bundle.version)}, expected ${BUNDLE_VERSION}`);
	if (typeof bundle.id === 'string' && bundle.id !== id) errors.push(`${id}: id is ${JSON.stringify(bundle.id)}`);
	if (typeof bundle.url === 'string' && !isLessonUrl(bundle.url, id))
		errors.push(`${id}: url is ${JSON.stringify(bundle.url)}, expected an absolute URL ending in /${id}/`);
	if (typeof bundle.mode === 'string' && !MODES.has(bundle.mode))
		errors.push(`${id}: mode is ${JSON.stringify(bundle.mode)}, expected tutorial or explanation`);
	if (typeof bundle.prose === 'string') {
		for (const block of fencedBlocks(src)) {
			if (!bundle.prose.includes(block)) {
				const first = block.split('\n')[0];
				errors.push(`${id}: the fenced block starting ${JSON.stringify(first)} is not in prose unchanged`);
			}
		}
		for (const { id: example, answer } of exampleAnswers(src, id)) {
			if (!hasExampleOutput(bundle.prose, answer))
				errors.push(`${id}: the output of example #${example} is not in prose after an Output: line`);
		}
		for (const line of citationsOutsideCode(bundle.prose)) {
			errors.push(`${id}: prose keeps a raw citation token outside code: ${JSON.stringify(line)}`);
		}
	}
	for (const [field, text] of citedFields(bundle)) {
		for (const line of citationsOutsideCode(text)) {
			errors.push(`${id}: ${field} keeps a raw citation token outside code: ${JSON.stringify(line)}`);
		}
	}
	return errors;
}

/**
 * The text fields of a bundle besides `prose` that the build renders
 * citations in, as `[where, text]` pairs: each behavior's `claim`, `why` and
 * `example`, and each checkpoint's `stem`. A field that is missing or not a string is skipped,
 * since the type checks above report a malformed bundle.
 */
function citedFields(bundle) {
	const out = [];
	for (const [o, objective] of (Array.isArray(bundle.objectives) ? bundle.objectives : []).entries()) {
		for (const [b, behavior] of (Array.isArray(objective?.behaviors) ? objective.behaviors : []).entries()) {
			for (const field of ['claim', 'why', 'example']) {
				if (typeof behavior?.[field] === 'string')
					out.push([`objectives[${o}] (${objective.id}) behaviors[${b}].${field}`, behavior[field]]);
			}
		}
	}
	for (const [c, item] of (Array.isArray(bundle.checkpoints) ? bundle.checkpoints : []).entries()) {
		if (typeof item?.stem === 'string') out.push([`checkpoints[${c}] (${item.id}) stem`, item.stem]);
	}
	return out;
}

/**
 * The raw citation tokens in the checkpoint stems of the site-wide export at
 * `file` (`dist/data/checkpoints.json`), as error strings. The export's shape
 * is `mise run checkpoints`' check, so a file that is missing or not the
 * expected JSON is reported here only as that.
 */
export function checkExportCitations(file) {
	if (!existsSync(file)) return [`${file} does not exist; run site-build first`];
	let data;
	try {
		data = JSON.parse(readFileSync(file, 'utf8'));
	} catch (e) {
		return [`checkpoints.json: not JSON: ${e.message}`];
	}
	const errors = [];
	for (const item of Array.isArray(data?.items) ? data.items : []) {
		if (typeof item?.stem !== 'string') continue;
		for (const line of citationsOutsideCode(item.stem)) {
			errors.push(
				`checkpoints.json: ${item.lesson}#${item.id} stem keeps a raw citation token outside code: ${JSON.stringify(line)}`,
			);
		}
	}
	return errors;
}

/**
 * Check the bundles under `bundlesDir` (site/dist/data/lessons) against the
 * lesson pages under `contentDir` and the data tree under `dataDir`. Returns
 * `{ errors: string[], bundles: number }`.
 */
export function checkBundles(bundlesDir, contentDir, dataDir) {
	if (!existsSync(bundlesDir)) return { errors: [`${bundlesDir} does not exist; run site-build first`], bundles: 0 };
	const errors = [];
	const areaIds = new Set(readAreaTree(dataDir).areas.map((a) => a.dir));
	const pages = lessonPages(contentDir, areaIds);
	const built = bundleIds(bundlesDir);
	for (const id of [...pages.keys()].sort()) {
		if (!built.has(id)) {
			errors.push(`${id}: lesson page without a bundle`);
			continue;
		}
		errors.push(
			...checkBundle(id, join(bundlesDir, `${id}.json`), readFileSync(join(contentDir, `${id}.mdx`), 'utf8')),
		);
	}
	for (const id of [...built].sort()) {
		if (!pages.has(id)) errors.push(`${id}: bundle without a lesson page`);
	}
	return { errors, bundles: built.size };
}

/** The published files under `dist/data/` that are not the data tree: the bundles, the checkpoint export and the index. */
const NOT_DATA_TREE = new Set(['checkpoints', 'index']);

/**
 * Every data-tree file under `dataDir` (site/src/data) that S12 "Files"
 * publishes, as published path (under `/data/`, without `.json`) to source
 * file. `bibliography.yaml` and `alignment/` do not publish.
 */
export function dataTreeSources(dataDir) {
	const out = new Map();
	const yamlStems = (dir) =>
		existsSync(dir)
			? readdirSync(dir)
					.filter((f) => f.endsWith('.yaml'))
					.sort()
					.map((f) => f.slice(0, -'.yaml'.length))
			: [];
	if (existsSync(join(dataDir, 'groups.yaml'))) out.set('groups', join(dataDir, 'groups.yaml'));
	const areasDir = join(dataDir, 'areas');
	const areas = existsSync(areasDir)
		? readdirSync(areasDir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name)
				.sort()
		: [];
	for (const area of areas) {
		const dir = join(areasDir, area);
		if (existsSync(join(dir, 'area.yaml'))) out.set(`areas/${area}`, join(dir, 'area.yaml'));
		for (const stem of yamlStems(join(dir, 'topics')))
			out.set(`topics/${area}/${stem}`, join(dir, 'topics', `${stem}.yaml`));
		for (const stem of yamlStems(join(dir, 'competencies')))
			out.set(`competencies/${area}/${stem}`, join(dir, 'competencies', `${stem}.yaml`));
		for (const stem of yamlStems(join(dir, 'courses')))
			out.set(`courses/${stem}`, join(dir, 'courses', `${stem}.yaml`));
		for (const stem of yamlStems(join(dir, 'lessons')))
			out.set(`lesson-plans/${area}/${stem}`, join(dir, 'lessons', `${stem}.yaml`));
	}
	return out;
}

/** A parsed data-tree file without its `notes`: the top-level key, and the one of each course part. */
export function withoutNotes(data) {
	if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
	const out = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'notes'));
	if (Array.isArray(out.parts))
		out.parts = out.parts.map((p) =>
			p !== null && typeof p === 'object' && !Array.isArray(p)
				? Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'notes'))
				: p,
		);
	return out;
}

/** The published paths of the data-tree files under `distDataDir`: every `.json` but the bundles, the export and the index. */
export function publishedDataPaths(distDataDir) {
	const out = new Set();
	if (!existsSync(distDataDir)) return out;
	for (const p of walk(distDataDir)) {
		if (!p.endsWith('.json')) continue;
		const path = p.slice(distDataDir.length + 1).replace(/\.json$/, '');
		if (path.startsWith('lessons/') || NOT_DATA_TREE.has(path)) continue;
		out.add(path);
	}
	return out;
}

/** The first line where `actual` and `expected` differ, as an error suffix. */
function firstDifference(actual, expected) {
	const a = actual.split('\n');
	const e = expected.split('\n');
	for (let i = 0; i < Math.max(a.length, e.length); i++) {
		if (a[i] !== e[i])
			return `line ${i + 1} is ${JSON.stringify(a[i] ?? null)}, expected ${JSON.stringify(e[i] ?? null)}`;
	}
	return 'the texts differ';
}

/**
 * Check the data tree as JSON under `distDataDir` (site/dist/data) against
 * its YAML under `dataDir` (site/src/data). Returns
 * `{ errors: string[], files: number }`.
 */
export function checkDataFiles(distDataDir, dataDir) {
	if (!existsSync(distDataDir)) return { errors: [`${distDataDir} does not exist; run site-build first`], files: 0 };
	const errors = [];
	const sources = dataTreeSources(dataDir);
	const built = publishedDataPaths(distDataDir);
	for (const [path, source] of [...sources].sort(([a], [b]) => (a < b ? -1 : 1))) {
		if (!built.has(path)) {
			errors.push(`data/${path}.json: data-tree file ${source.slice(dataDir.length + 1)} has no published file`);
			continue;
		}
		const expected = `${JSON.stringify(withoutNotes(parse(readFileSync(source, 'utf8'))), null, 2)}\n`;
		const actual = readFileSync(join(distDataDir, `${path}.json`), 'utf8');
		if (actual !== expected)
			errors.push(
				`data/${path}.json: differs from ${source.slice(dataDir.length + 1)}: ${firstDifference(actual, expected)}`,
			);
	}
	for (const path of [...built].sort()) {
		if (!sources.has(path)) errors.push(`data/${path}.json: published data file without a source under src/data`);
	}
	return { errors, files: built.size };
}

/**
 * The path under `/data/` without `.json` that `url` names, or null when it
 * is not a string that starts with `root` (the site root) and names a
 * `data/*.json` file under it.
 */
function dataPathOf(url, root) {
	if (typeof url !== 'string' || !url.startsWith(root)) return null;
	const m = /^data\/(.+)\.json$/.exec(url.slice(root.length));
	return m ? m[1] : null;
}

/** The ids of `entries` (a list of objects with an `id`), or `[]` when it is no list. */
const idsOf = (entries) => (Array.isArray(entries) ? entries.map((e) => e?.id) : []);

/**
 * Check `index.json` under `distDataDir` (S12 "Index") against the data
 * tree under `dataDir` and the built site around `distDataDir`. `root` is
 * the site root every URL must start with (`SITE_ROOT` in
 * `site-address.mjs`). Returns the problems as strings.
 */
export function checkDataIndex(distDataDir, dataDir, root) {
	const file = join(distDataDir, 'index.json');
	if (!existsSync(file)) return [`${file} does not exist; run site-build first`];
	let index;
	try {
		index = JSON.parse(readFileSync(file, 'utf8'));
	} catch (e) {
		return [`index.json: not JSON: ${e.message}`];
	}
	if (index === null || typeof index !== 'object' || Array.isArray(index)) return ['index.json: not a JSON object'];
	const distDir = join(distDataDir, '..');
	const errors = [];
	const listed = [];
	const offRoot = (where, url) => {
		if (typeof url === 'string' && url.startsWith(root)) return false;
		errors.push(`index.json: ${where} is ${JSON.stringify(url)}, not a URL under the site root ${root}`);
		return true;
	};
	/** Record the data file `url` names, which must be `data/<expected>.json` under the root and built. */
	const listUrl = (where, url, expected) => {
		if (offRoot(where, url)) return null;
		const path = dataPathOf(url, root);
		if (path === null || !existsSync(join(distDataDir, `${path}.json`))) {
			errors.push(`index.json: ${where} is ${JSON.stringify(url)}, not the URL of a built /data/ file`);
			return path;
		}
		if (path !== expected)
			errors.push(`index.json: ${where} is ${JSON.stringify(url)}, but its id says ${root}data/${expected}.json`);
		return path;
	};
	/** `url` must be the page at `path` (no leading slash) under the root, and built. */
	const page = (where, url, path) => {
		if (offRoot(where, url)) return;
		if (url !== `${root}${path}` || !existsSync(join(distDir, path, 'index.html')))
			errors.push(`index.json: ${where} is ${JSON.stringify(url)}, expected the built page ${root}${path}`);
	};
	if (index.version !== 1) errors.push(`index.json: version is ${JSON.stringify(index.version)}, expected 1`);
	listed.push(listUrl('groups', index.groups, 'groups'));
	listUrl('checkpoints', index.checkpoints, 'checkpoints');
	const tree = readAreaTree(dataDir);
	const areaIds = tree.groups
		.flatMap((g) => (Array.isArray(g?.areas) ? g.areas : []))
		.filter((a) => tree.areas.some((d) => d.dir === a && d.area !== null));
	const indexAreas = Array.isArray(index.areas) ? index.areas : [];
	if (JSON.stringify(idsOf(indexAreas)) !== JSON.stringify(areaIds))
		errors.push(
			`index.json: areas are ${JSON.stringify(idsOf(indexAreas))}, expected group order ${JSON.stringify(areaIds)}`,
		);
	for (const area of indexAreas) {
		const a = String(area?.id);
		listed.push(listUrl(`areas ${a} url`, area?.url, `areas/${a}`));
		page(`areas ${a} page`, area?.page, `${a}/`);
		for (const t of Array.isArray(area?.topics) ? area.topics : []) {
			listed.push(listUrl(`topic ${t?.id} url`, t?.url, `topics/${t?.id}`));
			page(`topic ${t?.id} page`, t?.page, `topics/${t?.id}/`);
		}
		for (const c of Array.isArray(area?.competencies) ? area.competencies : []) {
			listed.push(listUrl(`competency ${c?.id} url`, c?.url, `competencies/${c?.id}`));
			page(`competency ${c?.id} page`, c?.page, `competencies/${c?.id}/`);
		}
		for (const c of Array.isArray(area?.courses) ? area.courses : [])
			listed.push(listUrl(`course ${c?.id} url`, c?.url, `courses/${c?.id}`));
		const courseOrder = (tree.areas.find((d) => d.dir === a)?.courses ?? []).flatMap((c) => courseLessonIds(c.data));
		if (JSON.stringify(idsOf(area?.lessons)) !== JSON.stringify(courseOrder))
			errors.push(
				`index.json: area ${a} lessons are ${JSON.stringify(idsOf(area?.lessons))}, expected course order ${JSON.stringify(courseOrder)}`,
			);
		for (const l of Array.isArray(area?.lessons) ? area.lessons : []) {
			listed.push(listUrl(`lesson ${l?.id} plan`, l?.plan, `lesson-plans/${l?.id}`));
			const built = existsSync(join(distDataDir, 'lessons', `${l?.id}.json`));
			if (l?.live !== built)
				errors.push(
					`index.json: lesson ${l?.id} live is ${JSON.stringify(l?.live)}, but its bundle ${built ? 'was' : 'was not'} built`,
				);
			if (built) {
				page(`lesson ${l?.id} page`, l?.page, `${l?.id}/`);
				listUrl(`lesson ${l?.id} bundle`, l?.bundle, `lessons/${l?.id}`);
			} else if (l?.page !== null || l?.bundle !== null) {
				errors.push(`index.json: planned lesson ${l?.id} has a page or bundle; both must be null`);
			}
		}
	}
	const expected = dataTreeSources(dataDir);
	const seen = new Set();
	for (const path of listed) {
		if (path === null) continue;
		if (seen.has(path)) errors.push(`index.json: data/${path}.json is listed twice`);
		seen.add(path);
		if (!expected.has(path)) errors.push(`index.json: data/${path}.json is listed but is no data-tree file`);
	}
	for (const path of expected.keys()) {
		if (!seen.has(path)) errors.push(`index.json: data/${path}.json is not listed`);
	}
	return errors;
}
