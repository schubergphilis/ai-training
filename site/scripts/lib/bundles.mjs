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
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE_VERSION } from '../../src/lib/bundle-version.ts';
import { readAreaTree } from './area-tree.mjs';
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
