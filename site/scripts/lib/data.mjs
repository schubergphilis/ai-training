/**
 * The data tree check's logic (specs S09, S10, S11): the YAML under
 * site/src/data must agree with itself and with the lesson pages under
 * site/src/content/docs. The content collection schemas check each file's
 * shape at build; this checks what one file says about another.
 * `checkData` reports an error when
 *
 * - groups.yaml names an area with no directory, lists an area twice, gives
 *   two groups the same `order`, or an area directory is in no group; an
 *   area file's `id` or `group` disagrees with its directory or its group;
 * - a topic, competency, course or lesson file's `id` isn't `<area>/<stem>`
 *   (a course's `<stem>`), or its `area` isn't its directory; a concept id
 *   is defined twice across topics;
 * - a competency draws on an unknown topic, or an objective id isn't under
 *   its competency, or a behavior cites (`(@key)`) a key the bibliography
 *   lacks; an alignment row names an unknown objective;
 * - a course's id isn't its area's (spec S01: one course per area), a
 *   course lists a lesson the area has no file for, a lesson is in two
 *   courses or in none, or an area has no course;
 * - a lesson covers an unknown topic or one from another area, serves or
 *   assumes an unknown objective, comes `after` a lesson not in its area,
 *   introduces an unknown concept or one another lesson introduces, cites
 *   a source key the bibliography lacks, sets one of `sources-checked`
 *   and `review-by` without the other (spec S11 pairs them), or has a
 *   `review-by` on or before `sources-checked`;
 * - a lesson page (`<area>/<lesson>.mdx`) has no lesson file, carries a
 *   frontmatter field the lesson file owns, cites a source (`(@key)`, the
 *   remark citation plugin's form) that its lesson file's `sources` list
 *   lacks, or its lesson file has no `description` or an `assumes` entry
 *   without `lesson` and `section`; a course page (`<area>/index.mdx`)
 *   carries `title` or `description`;
 * - a lesson or course page has a citation token (`(@`) in a component prop
 *   string, which the citation plugin never renders (`propCitations`);
 * - a lesson file, live or planned, has an `assumes` entry whose `section`
 *   is not a `## ` heading slug of the named lesson's page
 *   (`checkAssumedSections`); an entry whose lesson has no page yet is
 *   skipped, and the build rejects a live page that names one;
 * - a lesson page in the `foundations` group shows a surface that needs a
 *   programmer (spec S03 "Foundations audience"): a `<Predict run=...>`, a
 *   fenced block tagged `sh`, `bash`, `shell`, `python` or `json`, or the
 *   words `terminal`, `python3` or `git clone` outside a code span or
 *   fence, unless `FOUNDATIONS_EXEMPT` lists it with the issue that fixes
 *   it; a listed lesson that shows no such surface is a stale entry and
 *   fails too;
 * - a lesson file lists `proofs` (spec S11 "Lesson file") but its area is
 *   not in the `foundations` group, or a proof is not a `.py` file under
 *   site/examples/ (`proofErrors`).
 *
 * It also reports an error when a lesson page uses a component the lesson
 * time estimate has no rule for (`checkLessonTimes`).
 *
 * It reports a warning, which doesn't fail, when a concept of one of the
 * area's topics is introduced by no lesson: a gap in the plan, which is a
 * content decision. It warns, too, when a live lesson's reading,
 * checkpoints and widgets alone are estimated at over 25 minutes (spec S03 "Length",
 * `checkLessonTimes`). `scripts/check-data.mjs` is the command-line entry;
 * tests import this.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import { parse } from 'yaml';
import { citationKeys, hasMultipleKeys, multipleKeysMessage } from '../../plugins/citation-syntax.mjs';
import { jsxElements, literalOf, parseMdx, propValue } from '../../src/lib/checkpoint-tags.ts';
import { checkExtendsToHref, checkExternalSourceHref } from '../../src/lib/extends-to.ts';
import { unsupportedInline } from '../../src/lib/inline-markdown.ts';
import { LESSON_TIME, lessonTime } from '../../src/lib/lesson-time.ts';
import { assumedSectionError, sectionSlugs } from '../../src/lib/section-slugs.ts';
import { allTopics, courseLessonIds, readAreaTree } from './area-tree.mjs';
import { predictTags } from './examples.mjs';

/** Every file under `dir`, recursively. */
export function* walk(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* walk(p);
		else yield p;
	}
}

/** The parsed YAML frontmatter of an MDX file, or `{}` when it has none. */
export function frontmatter(src) {
	const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
	return m ? (parse(m[1]) ?? {}) : {};
}

/**
 * Lesson page id (`<area>/<lesson>`) to frontmatter, for every
 * `<area>/<lesson>.mdx` under `contentDir` whose `<area>` is one of `areaIds`.
 * `<area>/index.mdx` is the course page and isn't listed.
 */
export function lessonPages(contentDir, areaIds) {
	const out = new Map();
	if (!existsSync(contentDir)) return out;
	for (const p of walk(contentDir)) {
		if (!p.endsWith('.mdx')) continue;
		const id = p.slice(contentDir.length + 1).replace(/\.mdx$/, '');
		const [area, lesson, ...rest] = id.split('/');
		if (rest.length || !lesson || lesson === 'index' || !areaIds.has(area)) continue;
		out.set(id, frontmatter(readFileSync(p, 'utf8')));
	}
	return out;
}

/**
 * The fields a lesson page gets from its lesson file; a page's own frontmatter
 * may not set them. `lastUpdated` is on the list too: the page date comes from
 * git (Starlight's `lastUpdated: true`), and a frontmatter date would override it.
 */
export const LESSON_OWNED_FIELDS = [
	'title',
	'description',
	'mode',
	'covers',
	'serves',
	'assumes',
	'extends-to',
	'covered-by',
	'sources-checked',
	'review-by',
	'lastUpdated',
];

/** The group whose lessons follow spec S03 "Foundations audience". */
export const FOUNDATIONS_GROUP = 'foundations';

/**
 * Foundations lessons that still show a surface the rule bans, each with the
 * issue that rewrites it. Remove a line when its issue lands: a listed lesson
 * that shows no banned surface fails the check. No wildcards.
 */
export const FOUNDATIONS_EXEMPT = new Map([
	['concepts/structured-output', 237], // #237: browser format-checker widget replaces the terminal
	['concepts/context-window', 238], // #238: widget or graded checkpoint replaces each Predict
	['concepts/same-prompt-twice', 238], // #238
	['safety/redact-before-you-paste', 238], // #238
	['safety/spotting-hallucination', 238], // #238
	['safety/bias-in-patterns', 284], // #284: went live after #238 was written
	['safety/saying-ai-helped', 284], // #284
]);

/**
 * Fence languages a foundations page may not show: the five tags spec S03
 * "Foundations audience" lists, plus the aliases highlighters accept for the
 * same languages (`py`, `zsh`, `console`), so a page can't dodge the rule by
 * spelling the tag differently.
 */
const BANNED_FENCES = new Set(['sh', 'bash', 'shell', 'zsh', 'console', 'python', 'py', 'json']);
/** Words a foundations page may not use outside a code span or a fence. */
const BANNED_WORDS = /\b(terminal|python3|git clone)\b/i;

/**
 * Every surface in an MDX lesson body that needs a programmer, as
 * `{ line, surface }` (1-based line): a `<Predict run=...>` tag, a fenced
 * block tagged with one of `BANNED_FENCES`, or one of `BANNED_WORDS` in prose.
 * Text inside a fence of any language, inside an inline code span and inside
 * an MDX comment (an expression holding a block comment) is skipped, so a page
 * may quote a command or a `<Predict run=...>` tag in a code span, a `text`
 * fence or a comment without tripping the check. `where` names the page in
 * the error for a page that does not parse.
 */
export function foundationsSurfaces(src, where = 'lesson') {
	const out = [];
	const lines = src.split('\n');
	const inFence = new Array(lines.length).fill(false); // true for the body lines and the closing line of a fenced block
	let fence = null; // the fence marker (``` or ~~~) while inside a fenced block
	lines.forEach((text, i) => {
		const open = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(text);
		if (fence) {
			inFence[i] = true;
			if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !open[2]) fence = null;
			return;
		}
		if (open) {
			fence = open[1];
			const lang = open[2].toLowerCase();
			if (BANNED_FENCES.has(lang)) out.push({ line: i + 1, surface: `\`\`\`${lang} fence` });
			return;
		}
		const m = BANNED_WORDS.exec(text.replace(/`[^`]*`/g, ''));
		if (m) out.push({ line: i + 1, surface: `the word "${m[1]}"` });
	});
	// The tags come from the MDX tree (`predictTags`), which puts a fence body and a comment in nodes
	// of their own, so a tag quoted in either is not a JSX element and is skipped.
	for (const { attrs, line } of predictTags(src, where)) {
		const run = propValue(attrs, 'run');
		if (run !== undefined) out.push({ line, surface: `<Predict run="${run}">` });
	}
	return out.sort((a, b) => a.line - b.line);
}

/**
 * The `proofs` rule (spec S11 "Lesson file", #497): errors for the `proofs`
 * of lesson file `l` in an area of group `group`, as `checkData` prints them
 * after `where`. The field is only for a foundations lesson, because an
 * engineering page shows its fixture with `<Predict run=...>`. Each entry is
 * a path relative to `examplesDir` that names a `.py` file there, without
 * `..` or a leading `/`.
 */
export function proofErrors(l, group, examplesDir) {
	if (l?.proofs === undefined) return [];
	const errors = [];
	if (group !== FOUNDATIONS_GROUP) {
		const inGroup = group === undefined ? 'in no group of src/data/groups.yaml' : `in ${JSON.stringify(group)}`;
		errors.push(
			`proofs is only for a lesson in the ${FOUNDATIONS_GROUP} group (spec S09 "Groups"), and this area is ${inGroup}; an engineering page shows its fixture with <Predict run=...>`,
		);
	}
	if (!Array.isArray(l.proofs)) return [...errors, 'proofs is not a list of fixture paths'];
	for (const p of l.proofs) {
		const bad = (why) => errors.push(`proofs ${JSON.stringify(p)} ${why}`);
		if (typeof p !== 'string' || !p.endsWith('.py')) bad('is not a .py fixture path');
		else if (isAbsolute(p) || normalize(p) !== p || p.split('/').includes('..'))
			bad('is not a plain path relative to site/examples/');
		else if (!existsSync(join(examplesDir, p)) || !statSync(join(examplesDir, p)).isFile())
			bad('is not a file under site/examples/');
	}
	return errors;
}

/**
 * The foundations audience rule (spec S03): every lesson page whose area is
 * in `FOUNDATIONS_GROUP` shows none of `foundationsSurfaces`, unless `exempt`
 * lists it, and every exempt lesson still shows at least one (or the entry
 * is stale). `pageIds` are the lesson page ids under `contentDir`. Returns
 * error strings in the format `checkData` uses.
 */
export function checkFoundationsAudience(tree, contentDir, pageIds, exempt = FOUNDATIONS_EXEMPT) {
	const errors = [];
	const group = tree.groups.find((g) => g?.id === FOUNDATIONS_GROUP);
	const areas = new Set(group?.areas ?? []);
	const seen = new Set();
	for (const id of [...pageIds].sort()) {
		if (!areas.has(id.split('/')[0])) continue;
		const where = `src/content/docs/${id}.mdx`;
		const found = foundationsSurfaces(readFileSync(join(contentDir, `${id}.mdx`), 'utf8'), where);
		if (exempt.has(id)) {
			seen.add(id);
			if (found.length === 0) {
				errors.push(
					`${where}: is exempt from the foundations audience rule for #${exempt.get(id)} but shows no banned surface, so remove its FOUNDATIONS_EXEMPT line in scripts/lib/data.mjs`,
				);
			}
			continue;
		}
		for (const { line, surface } of found) {
			errors.push(
				`${where}:${line}: ${surface}, which a foundations lesson may not show (spec S03 "Foundations audience")`,
			);
		}
	}
	for (const [id, issue] of exempt) {
		if (!seen.has(id)) {
			errors.push(
				`scripts/lib/data.mjs: FOUNDATIONS_EXEMPT lists ${id} (#${issue}), which is not a foundations lesson page, so remove the line`,
			);
		}
	}
	return errors;
}

/**
 * The `assumes[].section` rule (spec S11): in every lesson file, live or
 * planned, an entry that names a `lesson` and a `section` names a `## `
 * heading of that lesson's page, by the slug the build gives it
 * (`src/lib/section-slugs.ts`). An entry whose lesson has no page under
 * `contentDir` (`pageIds`) is skipped: the section can't exist yet, and the
 * build's `MarkdownContent.astro` rejects a live page that names one.
 * `rel` turns a data file path into the form `checkData` prints. Returns
 * error strings in the format `checkData` uses.
 */
export function checkAssumedSections(tree, contentDir, pageIds, rel) {
	const errors = [];
	const pages = new Set(pageIds);
	const slugsOf = new Map();
	for (const a of tree.areas) {
		for (const { data: l, file } of a.lessons) {
			for (const x of l?.assumes ?? []) {
				if (!x?.lesson || !x?.section || !pages.has(x.lesson)) continue;
				if (!slugsOf.has(x.lesson)) {
					// Without the frontmatter, which remark-parse would read as a `---` rule and a heading.
					const src = readFileSync(join(contentDir, `${x.lesson}.mdx`), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
					slugsOf.set(x.lesson, sectionSlugs(parseMdx(src)));
				}
				const error = assumedSectionError(rel(file), x.lesson, x.section, slugsOf.get(x.lesson));
				if (error) errors.push(error);
			}
		}
	}
	return errors;
}

/**
 * The error for a lesson whose `sources-checked` and `review-by` disagree,
 * or `null` when it sets both in order or neither. Spec S11 "Lesson file"
 * pairs the two: the check date means nothing without the date the sources
 * are due again, and the reverse, and the due date comes after the check.
 * A value that isn't a date is left to the content schema at build.
 */
export function reviewDatePairError(lesson) {
	const checkedRaw = lesson?.['sources-checked'];
	const dueRaw = lesson?.['review-by'];
	if (checkedRaw == null && dueRaw == null) return null;
	if (dueRaw == null) return 'sets sources-checked without review-by, which spec S11 pairs with it';
	if (checkedRaw == null) return 'sets review-by without sources-checked, which spec S11 pairs with it';
	const checked = new Date(String(checkedRaw)).getTime();
	const due = new Date(String(dueRaw)).getTime();
	if (Number.isNaN(checked) || Number.isNaN(due)) return null;
	if (due <= checked) return `review-by ${dueRaw} is not after sources-checked ${checkedRaw}`;
	return null;
}

/**
 * Props whose text a component shows verbatim as code, so a `(@` in one is
 * what the reader should see: the expected output of a `<Predict>` (spec S03
 * "Examples"), and the broken artifact and the model answer of a `<Repair>`
 * (`components/lesson/Repair.astro` puts both in a textarea or a `pre`).
 */
export const CODE_PROPS = new Map([
	['Predict', new Set(['answer'])],
	['Repair', new Set(['broken', 'model'])],
]);

/**
 * A code span per CommonMark: a run of backticks, closed by the next run of
 * the same length, so ``a ` b`` is one span.
 */
const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;

/**
 * Every string inside a prop value, with its path from the prop name
 * (`options[2].why`), depth first in source order.
 * @param {unknown} value
 * @param {string} path
 * @returns {Array<{ path: string, text: string }>}
 */
function propStrings(value, path) {
	if (typeof value === 'string') return [{ path, text: value }];
	if (Array.isArray(value)) return value.flatMap((v, i) => propStrings(v, `${path}[${i}]`));
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([k, v]) => propStrings(v, `${path}.${k}`));
	}
	return [];
}

/**
 * The citation tokens (`(@`) in the component prop strings of an MDX page.
 * The citation remark plugin rewrites text nodes only, and a prop is never a
 * text node (`plugins/mdast-walk.mjs`), so a token in a checkpoint option's
 * `why`, a `hint`, a `title` or any other prop reaches the page as literal
 * text (#378). A prop string is a quoted prop (`title="..."`) or a string
 * anywhere in a literal expression prop (`options={[{ why: '...' }]}`), on a
 * component or a raw HTML element. Exempt are text inside a code span in the
 * string, the props in `CODE_PROPS`, and an expression prop that is not a
 * literal, which no reader can see before render time (the checkpoint reader
 * rejects one on a checkpoint tag). An expression prop that is only partly a
 * literal, such as an array with one identifier in it, is skipped as a whole,
 * its literal strings included. Tags inside a fence or a code span are
 * not JSX in the MDX tree, so they are skipped too. A page that does not
 * parse throws, naming `where`.
 * @param {string} src
 * @param {string} where
 * @returns {Array<{ line: number, tag: string, prop: string, token: string }>}
 */
export function propCitations(src, where = 'lesson') {
	let tree;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${e.message}`);
	}
	const out = [];
	for (const node of jsxElements(tree)) {
		const tag = node.name ?? 'fragment';
		for (const a of node.attributes) {
			if (a.type !== 'mdxJsxAttribute' || !a.name) continue;
			if (CODE_PROPS.get(tag)?.has(a.name)) continue;
			let value;
			if (typeof a.value === 'string') value = a.value;
			else if (a.value && typeof a.value === 'object') {
				try {
					value = literalOf(a.value.data?.estree?.body[0]?.expression);
				} catch {
					continue;
				}
			} else continue;
			for (const { path, text } of propStrings(value, a.name)) {
				const plain = text.replace(CODE_SPAN, '');
				const at = plain.indexOf('(@');
				if (at === -1) continue;
				const close = plain.indexOf(')', at);
				const token = (close === -1 ? plain.slice(at, at + 40) : plain.slice(at, close + 1)).replace(/\s+/g, ' ');
				out.push({ line: a.position?.start.line ?? node.position?.start.line ?? 0, tag, prop: path, token });
			}
		}
	}
	return out;
}

/**
 * The error for a citation token in a prop string, in the format `checkData`
 * uses.
 * @param {string} where
 * @param {{ line: number, tag: string, prop: string, token: string }} found
 */
export function propCitationMessage(where, { line, tag, prop, token }) {
	return `${where}:${line}: <${tag}> prop ${prop} holds the citation ${token}, which the page shows as literal text because citations in props are not rendered. Name the source in words, or cite it in the page text`;
}

/**
 * The `(@key)` citations in competency behaviors (spec S10) whose key the
 * bibliography lacks, as error strings in the format `checkData` uses. The
 * competency page renders these tokens as references, so a typo would fail
 * the build; this fails the data check first. Like `citationKeys` on a
 * lesson page, this scans raw text, so a token inside a code span counts too.
 * @param {ReturnType<typeof readAreaTree>} tree
 * @param {(file: string) => string} rel
 */
export function checkBehaviorCitations(tree, rel) {
	const errors = [];
	for (const a of tree.areas) {
		for (const { data: c, file } of a.competencies) {
			for (const o of c?.objectives ?? []) {
				(o.behaviors ?? []).forEach((b, i) => {
					for (const field of ['claim', 'why', 'example']) {
						for (const key of citationKeys(String(b?.[field] ?? ''))) {
							if (hasMultipleKeys(key)) {
								errors.push(multipleKeysMessage(`${rel(file)}: objective ${o.id} behavior ${i + 1} ${field}`, key));
							} else if (!tree.bibliographyKeys.has(key)) {
								errors.push(
									`${rel(file)}: objective ${o.id} behavior ${i + 1} ${field} cites "${key}", which is not a bibliography key`,
								);
							}
						}
					}
				});
			}
		}
	}
	return errors;
}

/**
 * The `extends-to` and `covered-by` hrefs that break the rule in
 * `src/lib/extends-to.ts` (spec S11 "Lesson file"), as error strings in the
 * format `checkData` uses. An `extends-to` href is a root-relative page path
 * or an `https://` URL under a bibliography `url`, and a `covered-by` href
 * is the URL form only. The build applies the same rule from
 * `MarkdownContent.astro` and `TableOfContents.astro`, so this fails the
 * data check first, with the same message.
 * @param {ReturnType<typeof readAreaTree>} tree
 * @param {(file: string) => string} rel
 */
export function checkSourceHrefs(tree, rel) {
	const errors = [];
	const sources = tree.bibliographySources;
	for (const a of tree.areas) {
		for (const { data: l, file } of a.lessons) {
			for (const x of l?.['extends-to'] ?? []) {
				if (typeof x?.href !== 'string') {
					errors.push(`${rel(file)}: extends-to entry ${JSON.stringify(x?.label ?? x)} has no href`);
					continue;
				}
				const check = checkExtendsToHref(x.href, sources);
				if (check.kind === 'invalid') errors.push(`${rel(file)}: ${check.reason}`);
			}
			const coveredBy = l?.['covered-by'];
			if (coveredBy && typeof coveredBy.href !== 'string') {
				errors.push(`${rel(file)}: covered-by has no href`);
			} else if (coveredBy) {
				const check = checkExternalSourceHref(coveredBy.href, sources, 'covered-by');
				if (check.kind === 'invalid') errors.push(`${rel(file)}: ${check.reason}`);
			}
		}
	}
	return errors;
}

/**
 * The competency behaviors (spec S10) whose text uses a Markdown form the
 * competency page renderer does not support (`unsupportedInline` in
 * `lib/inline-markdown.ts`), as error strings in the format `checkData` uses. The
 * page would show the form as literal text, so this fails the data check
 * first. Code spans are skipped, so `snake_case` in one is fine.
 * @param {ReturnType<typeof readAreaTree>} tree
 * @param {(file: string) => string} rel
 */
export function checkBehaviorMarkdown(tree, rel) {
	const errors = [];
	for (const a of tree.areas) {
		for (const { data: c, file } of a.competencies) {
			for (const o of c?.objectives ?? []) {
				(o.behaviors ?? []).forEach((b, i) => {
					for (const field of ['claim', 'why', 'example']) {
						for (const form of unsupportedInline(String(b?.[field] ?? ''))) {
							errors.push(
								`${rel(file)}: objective ${o.id} behavior ${i + 1} ${field} uses ${form}, which the competency page does not render`,
							);
						}
					}
				});
			}
		}
	}
	return errors;
}

/**
 * Check the tree under `dataDir` against the pages under `contentDir`.
 * `foundationsExempt` is the exemption list for `checkFoundationsAudience`
 * and defaults to `FOUNDATIONS_EXEMPT`; tests pass their own.
 * `examplesDir` is where `proofs` paths point, site/examples/ by default.
 * Returns `{ errors: string[], warnings: string[], lessons: number, pages: number }`.
 */
export function checkData(
	dataDir,
	contentDir,
	{ foundationsExempt = FOUNDATIONS_EXEMPT, examplesDir = join(dataDir, '..', '..', 'examples') } = {},
) {
	const errors = [];
	const warnings = [];
	const fail = (msg) => errors.push(msg);
	const rel = (file) => `src/data/${file.slice(dataDir.length).replace(/^\//, '')}`;
	if (!existsSync(join(dataDir, 'areas'))) {
		return { errors: [`${join(dataDir, 'areas')} does not exist`], warnings, lessons: 0, pages: 0 };
	}
	const tree = readAreaTree(dataDir);

	// Groups and areas.
	const grouped = new Map(); // area -> group id
	const orders = new Set();
	for (const g of tree.groups) {
		if (orders.has(g?.order)) fail(`src/data/groups.yaml: group ${g.id} has the same order as another group`);
		orders.add(g?.order);
		for (const a of g.areas ?? []) {
			if (grouped.has(a)) fail(`src/data/groups.yaml: area ${a} is listed twice`);
			grouped.set(a, g.id);
			if (!tree.areas.some((x) => x.dir === a)) fail(`src/data/groups.yaml: area ${a} has no src/data/areas/${a}/`);
		}
	}
	const areaIds = new Set(tree.areas.map((a) => a.dir));
	for (const a of tree.areas) {
		const where = `src/data/areas/${a.dir}/area.yaml`;
		if (!a.area) {
			fail(`${where}: missing`);
			continue;
		}
		if (a.area.id !== a.dir) fail(`${where}: id is ${JSON.stringify(a.area.id)}, expected ${a.dir} (the directory)`);
		if (!grouped.has(a.dir)) fail(`${where}: no group in src/data/groups.yaml lists ${a.dir}`);
		else if (a.area.group !== grouped.get(a.dir)) {
			fail(`${where}: group is ${JSON.stringify(a.area.group)}, but groups.yaml lists it under ${grouped.get(a.dir)}`);
		}
	}

	// Ids that other files point at.
	const topicIds = new Set();
	const topicArea = new Map();
	const conceptIds = new Map(); // concept -> topic id
	const conceptsOfArea = new Map(); // area -> Set of concept ids
	for (const a of tree.areas) {
		conceptsOfArea.set(a.dir, new Set());
		for (const { data: t, file, stem } of a.topics) {
			const where = rel(file);
			if (t?.id !== `${a.dir}/${stem}`) fail(`${where}: id is ${JSON.stringify(t?.id)}, expected ${a.dir}/${stem}`);
			if (t?.area !== a.dir) fail(`${where}: area is ${JSON.stringify(t?.area)}, expected ${a.dir}`);
			topicIds.add(t?.id);
			topicArea.set(t?.id, a.dir);
			for (const c of t?.concepts ?? []) {
				if (conceptIds.has(c.id)) fail(`${where}: concept ${c.id} is also defined in ${conceptIds.get(c.id)}`);
				conceptIds.set(c.id, t.id);
				conceptsOfArea.get(a.dir).add(c.id);
			}
		}
	}
	const objectiveIds = new Set();
	for (const a of tree.areas) {
		for (const { data: c, file, stem } of a.competencies) {
			const where = rel(file);
			if (c?.id !== `${a.dir}/${stem}`) fail(`${where}: id is ${JSON.stringify(c?.id)}, expected ${a.dir}/${stem}`);
			if (c?.area !== a.dir) fail(`${where}: area is ${JSON.stringify(c?.area)}, expected ${a.dir}`);
			for (const t of c?.topics ?? [])
				if (!topicIds.has(t)) fail(`${where}: topics ${JSON.stringify(t)} is not a topic id`);
			for (const o of c?.objectives ?? []) {
				if (!o?.id?.startsWith(`${c?.id}/`))
					fail(`${where}: objective ${JSON.stringify(o?.id)} is not under ${c?.id}/`);
				objectiveIds.add(o?.id);
			}
		}
	}
	for (const { data: f, file, stem } of tree.alignment) {
		const where = rel(file);
		if (f?.id !== stem) fail(`${where}: id is ${JSON.stringify(f?.id)}, expected ${stem} (the file name)`);
		for (const row of f?.rows ?? []) {
			for (const o of row?.objectives ?? []) {
				if (!objectiveIds.has(o)) fail(`${where} ${row.code}: objective ${JSON.stringify(o)} is not an objective id`);
			}
		}
	}

	// Courses and lessons.
	const pages = lessonPages(contentDir, areaIds);
	const lessonIds = new Set();
	const sourcesOf = new Map(); // lesson id -> Set of bibliography keys the plan lists
	const introducedBy = new Map(); // area -> Map(concept -> lesson id)
	for (const a of tree.areas) {
		const areaLessons = new Set(a.lessons.map((l) => l.data?.id));
		const listedIn = new Map(); // lesson id -> course file
		if (a.courses.length === 0) fail(`src/data/areas/${a.dir}/courses/: no course file`);
		for (const { data: c, file, stem } of a.courses) {
			const where = rel(file);
			if (c?.id !== stem) fail(`${where}: id is ${JSON.stringify(c?.id)}, expected ${stem} (the file name)`);
			if (c?.id !== a.dir)
				fail(`${where}: id is ${JSON.stringify(c?.id)}, expected ${a.dir} (one course per area, spec S01)`);
			if (c?.area !== a.dir) fail(`${where}: area is ${JSON.stringify(c?.area)}, expected ${a.dir}`);
			for (const id of courseLessonIds(c)) {
				if (!areaLessons.has(id))
					fail(`${where}: lists ${id}, which has no file under src/data/areas/${a.dir}/lessons/`);
				if (listedIn.has(id)) fail(`${where}: ${id} is also listed in ${listedIn.get(id)}`);
				listedIn.set(id, where);
			}
		}
		const introduced = new Map();
		introducedBy.set(a.dir, introduced);
		for (const { data: l, file, stem } of a.lessons) {
			const where = rel(file);
			if (l?.id !== `${a.dir}/${stem}`) fail(`${where}: id is ${JSON.stringify(l?.id)}, expected ${a.dir}/${stem}`);
			if (lessonIds.has(l?.id)) fail(`${where}: duplicate id`);
			lessonIds.add(l?.id);
			sourcesOf.set(l?.id, new Set(l?.sources ?? []));
			if (!listedIn.has(l?.id)) fail(`${where}: no course under src/data/areas/${a.dir}/courses/ lists it`);
			if (!topicIds.has(l?.covers)) fail(`${where}: covers ${JSON.stringify(l?.covers)} is not a topic id`);
			else if (topicArea.get(l.covers) !== a.dir) fail(`${where}: covers ${l.covers}, a topic of another area`);
			for (const s of l?.serves ?? [])
				if (!objectiveIds.has(s)) fail(`${where}: serves ${JSON.stringify(s)} is not an objective id`);
			for (const x of l?.assumes ?? []) {
				if (!objectiveIds.has(x?.objective))
					fail(`${where}: assumes ${JSON.stringify(x?.objective)} is not an objective id`);
			}
			for (const x of l?.after ?? []) {
				if (!areaLessons.has(x)) fail(`${where}: after ${JSON.stringify(x)} is not a lesson of this area`);
			}
			for (const c of l?.introduces ?? []) {
				if (!conceptIds.has(c)) fail(`${where}: introduces ${JSON.stringify(c)} is not a concept id`);
				else if (introduced.has(c)) fail(`${where}: introduces ${c}, which ${introduced.get(c)} also introduces`);
				else introduced.set(c, l.id);
			}
			for (const s of l?.sources ?? []) {
				if (!tree.bibliographyKeys.has(s)) fail(`${where}: sources ${JSON.stringify(s)} is not a bibliography key`);
			}
			const pairError = reviewDatePairError(l);
			if (pairError) fail(`${where}: ${pairError}`);
			for (const e of proofErrors(l, grouped.get(a.dir), examplesDir)) fail(`${where}: ${e}`);
			const page = pages.get(l?.id);
			if (page) {
				if (!l?.description) fail(`${where}: the lesson is live, so it needs a description`);
				for (const x of l?.assumes ?? []) {
					if (!x?.lesson || !x?.section) {
						fail(
							`${where}: assumes ${x?.objective} without the lesson and section that teach it, which a live lesson needs`,
						);
					}
				}
			}
		}
		for (const c of conceptsOfArea.get(a.dir)) {
			if (!introduced.has(c))
				warnings.push(`src/data/areas/${a.dir}: no lesson introduces the concept ${c} (${conceptIds.get(c)})`);
		}
	}

	// Pages.
	for (const [id, fm] of [...pages].sort()) {
		const where = `src/content/docs/${id}.mdx`;
		if (!lessonIds.has(id)) {
			fail(
				`${where}: lesson page without a lesson file at src/data/areas/${id.split('/')[0]}/lessons/${id.split('/')[1]}.yaml`,
			);
			continue;
		}
		const owned = LESSON_OWNED_FIELDS.filter((k) => k in fm);
		if (owned.length) fail(`${where}: frontmatter sets ${owned.join(', ')}, which the lesson file owns`);
		// The plan may list a source the page doesn't cite (consulted, not quoted), so only this direction is checked.
		for (const key of citationKeys(readFileSync(join(contentDir, `${id}.mdx`), 'utf8'))) {
			if (hasMultipleKeys(key)) fail(multipleKeysMessage(where, key));
			else if (!sourcesOf.get(id).has(key)) fail(`${where}: cites "${key}", which its plan file's sources list lacks`);
		}
		for (const found of propCitations(readFileSync(join(contentDir, `${id}.mdx`), 'utf8'), where)) {
			fail(propCitationMessage(where, found));
		}
	}
	for (const e of checkBehaviorMarkdown(tree, rel)) fail(e);
	for (const e of checkBehaviorCitations(tree, rel)) fail(e);
	for (const e of checkSourceHrefs(tree, rel)) fail(e);
	for (const e of checkFoundationsAudience(tree, contentDir, pages.keys(), foundationsExempt)) fail(e);
	for (const e of checkAssumedSections(tree, contentDir, pages.keys(), rel)) fail(e);
	const times = checkLessonTimes(
		contentDir,
		[...pages.keys()].filter((id) => lessonIds.has(id)),
	);
	for (const e of times.errors) fail(e);
	warnings.push(...times.warnings);
	for (const a of tree.areas) {
		const index = join(contentDir, a.dir, 'index.mdx');
		if (!existsSync(index)) continue;
		const owned = ['title', 'description'].filter((k) => k in frontmatter(readFileSync(index, 'utf8')));
		if (owned.length)
			fail(`src/content/docs/${a.dir}/index.mdx: frontmatter sets ${owned.join(', ')}, which area.yaml owns`);
		for (const found of propCitations(readFileSync(index, 'utf8'), `src/content/docs/${a.dir}/index.mdx`)) {
			fail(propCitationMessage(`src/content/docs/${a.dir}/index.mdx`, found));
		}
	}

	return { errors, warnings, lessons: lessonIds.size, pages: pages.size };
}

/**
 * The lesson time estimate (`src/lib/lesson-time.ts`, spec S03 "Lesson
 * time") of each page in `pageIds`, lesson page ids under `contentDir`.
 * A page the estimate cannot read, such as one with a component it has no
 * rule for, is an error. A page whose reading, checkpoints and widgets alone come to
 * more than `LESSON_TIME.warnMinutes`, unrounded, is a warning: the lesson
 * is a candidate to trim or split, which is a content decision. The plan's
 * `minutes` is not compared, because on a live lesson it is the historical
 * target.
 */
export function checkLessonTimes(contentDir, pageIds) {
	const errors = [];
	const warnings = [];
	for (const id of [...pageIds].sort()) {
		const where = `src/content/docs/${id}.mdx`;
		let core;
		try {
			core = lessonTime(readFileSync(join(contentDir, `${id}.mdx`), 'utf8'), where).coreMinutes;
		} catch (e) {
			errors.push(e.message);
			continue;
		}
		if (core > LESSON_TIME.warnMinutes) {
			warnings.push(
				`${where}: reading, checkpoints and widgets come to about ${Math.round(core)} minutes without the exercise, over the ${LESSON_TIME.warnMinutes} of spec S03 "Length"; trim or split the lesson`,
			);
		}
	}
	return { errors, warnings };
}

/**
 * Print a `checkData` result the way `mise run data` shows it and return the
 * exit code: warnings go to `out.warn` and never fail, errors to
 * `out.error` and exit 1, and a clean run prints one summary line to
 * `out.log`. `scripts/check-data.mjs` calls it with `console`.
 * @param {{ errors: string[], warnings: string[], lessons: number, pages: number }} result
 * @param {{ log: (m: string) => void, warn: (m: string) => void, error: (m: string) => void }} [out]
 */
export function reportData({ errors, warnings, lessons, pages }, out = console) {
	for (const w of warnings) out.warn(`data: warning: ${w}`);
	if (errors.length) {
		for (const e of errors) out.error(`data: ${e}`);
		out.error(`data: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
		return 1;
	}
	out.log(
		`data: ${lessons} lesson plan${lessons === 1 ? '' : 's'}, ${pages} lesson page${pages === 1 ? '' : 's'}, all consistent${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}`,
	);
	return 0;
}

/** Every topic id and every learning objective id under `dataDir`, for other checks. */
export function knownIds(dataDir) {
	const tree = readAreaTree(dataDir);
	return {
		topicIds: new Set(allTopics(tree).map((t) => t.id)),
		objectiveIds: new Set(
			tree.areas.flatMap((a) => a.competencies.flatMap((c) => (c.data.objectives ?? []).map((o) => o.id))),
		),
	};
}
