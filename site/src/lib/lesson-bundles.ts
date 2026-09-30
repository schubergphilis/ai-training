import { getCollection } from 'astro:content';
import { splitCitations } from '../../plugins/citation-syntax.mjs';
import { BUNDLE_VERSION } from './bundle-version';
import { buildCheckpointExport, type CheckpointItem } from './checkpoint-items';
import { KIND_OF_TAG } from './checkpoint-rules';
import {
	attrsOf,
	type CheckpointAttr,
	isJsxElement,
	type JsxElement,
	type MdxNode,
	parseMdx,
	phaseProp,
	propValue,
} from './checkpoint-tags';
import type { BibliographyEntry } from './citations';
import { getLessons, type Lesson } from './lessons';
import { type CodeAside, citationText, plainCitations, resolveCitations, setAsideCode } from './plain-citations';
import { absoluteUrl } from './url';

/**
 * Lesson bundles (spec S08 "Lesson bundles"): one JSON file per live lesson,
 * written by the build to `<base>/data/lessons/<area>/<lesson>.json` and
 * read by the published tutor skill. Everything here is built from the same
 * content collections as the lesson page. `bundleOf` and `proseOf` are pure,
 * so the tests run them on the fixture lessons, and `buildLessonBundles`
 * is the one function that reads the collections.
 */

export { BUNDLE_VERSION };

export interface BundleTopic {
	id: string;
	name: string;
	definition: string;
	url: string;
	concepts: { id: string; name: string; definition: string }[];
}

export interface BundleObjective {
	id: string;
	statement: string;
	level: 'base' | 'expert';
	competency_url: string;
	behaviors: { claim: string; why: string; example: string }[];
}

export interface BundleAssumed {
	objective: string;
	lesson: string | null;
	section: string | null;
	/** The section's absolute URL, or null while the teaching lesson is unknown. */
	url: string | null;
}

/** A checkpoint export item without its `lesson`: the bundle's `id` says which lesson. */
export type BundleCheckpoint = Omit<CheckpointItem, 'lesson'>;

export interface LessonBundle {
	version: typeof BUNDLE_VERSION;
	id: string;
	url: string;
	title: string;
	mode: 'tutorial' | 'explanation';
	prose: string;
	topics: BundleTopic[];
	objectives: BundleObjective[];
	assumes: BundleAssumed[];
	checkpoints: BundleCheckpoint[];
	extends_to: { label: string; url: string }[];
}

/** What `bundleOf` reads besides the lesson, as the collections hold it. */
export interface BundleSources {
	topics: Omit<BundleTopic, 'url'>[];
	competencies: { id: string; objectives: Omit<BundleObjective, 'competency_url'>[] }[];
	/** Every item of the site-wide checkpoint export. */
	items: CheckpointItem[];
	/** Every lesson page's id, so an `assumes[].lesson` that names no page fails the build. */
	lessonIds: Set<string>;
	/** site/src/data/bibliography.yaml, keyed by citation key, so a `(@key)` in the prose or a behavior renders as its source. */
	bibliography: Record<string, BibliographyEntry>;
	/** Astro's `site`, the origin the absolute URLs start with. */
	site: string;
}

/** The lesson page URL for a lesson id, `<site><base>/<area>/<lesson>/`. */
export function lessonUrl(id: string, site: string): string {
	return absoluteUrl(`/${id}/`, site);
}

/** A fence long enough to hold `text`, which may itself contain fenced blocks. */
function fenceFor(text: string): string {
	const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
	return '`'.repeat(longest + 1);
}

function fenced(text: string, lang = 'text'): string {
	const fence = fenceFor(text);
	return `${fence}${lang}\n${text.trim()}\n${fence}`;
}

const CHECKPOINT_TAGS = new Set(Object.keys(KIND_OF_TAG));

/**
 * The flag that turns the bundle `prose` renderer into the lesson body of a
 * Markdown alternate (spec S12 "Rendering a lesson body"). Absent, `proseOf`
 * renders the bundle `prose` of S08 "Format" unchanged.
 */
export interface AlternateOptions {
	/** The absolute URL of the HTML page, which an `#<id>` link is resolved against. */
	pageUrl: string;
	/**
	 * Markdown for a component by name, in place of the default rendering. A course page renders its
	 * `CoursePlan` this way, and a page with another generated component can do the same.
	 */
	components?: Record<string, (attrs: Map<string, CheckpointAttr>) => string>;
}

/** One list item, its continuation lines indented so they stay in the item. */
function listItem(text: string): string {
	return `- ${text.trim().replace(/\n/g, '\n  ')}`;
}

function list(items: string[]): string {
	return items.map(listItem).join('\n');
}

/** A prop that must be an array, read for the alternate. `where` names the lesson and the tag in the error. */
function arrayProp(where: string, name: string, attrs: Map<string, CheckpointAttr>, prop: string): unknown[] {
	const v = propValue(attrs, prop);
	if (!Array.isArray(v)) throw new Error(`${where}: ${prop} of <${name}> must be an array`);
	return v;
}

/** The text of an option object (`{ text: '...' }`) or of a plain string item. */
function textOf(where: string, name: string, item: unknown): string {
	const text = typeof item === 'string' ? item : (item as { text?: unknown } | null)?.text;
	if (typeof text !== 'string') throw new Error(`${where}: an item of <${name}> has no text`);
	return text;
}

/**
 * What the page shows of a checkpoint besides its stem, as Markdown: the option texts, the lists of a
 * `Match` or a `Sort`, the steps of an `Order` sorted as the checkpoint export sorts them, or the broken
 * text of a `Repair`. A `Predict` checkpoint shows nothing more. The hint, each option's `why` and the
 * answer are never read here (spec S12 "Rendering a lesson body").
 */
function checkpointOptions(where: string, name: string, attrs: Map<string, CheckpointAttr>, aside: CodeAside): string {
	const texts = (prop: string) => arrayProp(where, name, attrs, prop).map((i) => textOf(where, name, i));
	switch (name) {
		case 'Choice':
		case 'Scenario':
			return list(texts('options'));
		case 'MultiChoice': {
			const options = arrayProp(where, name, attrs, 'options');
			const correct = options.filter((o) => (o as { correct?: unknown } | null)?.correct === true).length;
			return `Select exactly ${correct}.\n\n${list(texts('options'))}`;
		}
		case 'Match':
			return `Statements:\n\n${list(
				arrayProp(where, name, attrs, 'rows')
					.map((r) => (r as { statement?: unknown }).statement)
					.map((t) => textOf(where, name, t)),
			)}\n\nOptions:\n\n${list(texts('options'))}`;
		case 'Order':
			// Sorted by the text the reader sees, code spans restored, as the checkpoint export sorts the source steps.
			return list(texts('steps').sort((a, b) => aside.restore(a).localeCompare(aside.restore(b))));
		case 'Sort':
			return `Buckets:\n\n${list(texts('buckets'))}\n\nItems:\n\n${list(texts('items'))}`;
		case 'Repair': {
			const broken = propValue(attrs, 'broken');
			if (typeof broken !== 'string') throw new Error(`${where}: broken of <Repair> must be a string`);
			return aside.keep(fenced(aside.restore(broken)));
		}
		default:
			return '';
	}
}

/** The output an ungraded example shows under its children: `Output:` and the `answer` in a `text` fence. */
function exampleOutput(where: string, attrs: Map<string, CheckpointAttr>, aside: CodeAside): string {
	const answer = propValue(attrs, 'answer');
	if (typeof answer !== 'string') throw new Error(`${where}: answer of an example <Predict> must be a string`);
	return `Output:\n\n${aside.keep(fenced(aside.restore(answer)))}`;
}

/**
 * One component, as plain Markdown. `children` is already rendered, with code set aside. A `Prompt` or
 * `Response` body is restored and fenced here, and the fenced block is set aside again, so the link pass
 * that follows leaves a code span inside it alone. `where` names the lesson in error messages, which have the
 * shape `attrsOf` uses: `<where>: <problem> of <Tag>`.
 */
function renderTag(
	where: string,
	name: string,
	attrs: Map<string, CheckpointAttr>,
	children: string,
	aside: CodeAside,
	alternate: AlternateOptions | undefined,
): string {
	const str = (n: string) => {
		const v = propValue(attrs, n);
		if (v !== undefined && typeof v !== 'string')
			throw new Error(`${where}: ${n} of <${name}> must be a string, got ${typeof v}`);
		return v;
	};
	const body = children.trim();
	const withHeading = (heading: string) => (body ? `${heading}\n\n${body}` : heading);
	if (CHECKPOINT_TAGS.has(name)) {
		// A `review` alternate is hidden on the page (S03 "Checkpoints"), so the prose leaves it out too.
		// The bundle's `checkpoints` still lists it.
		if (phaseProp(where, attrs) === 'review') return '';
		// A <Predict> without an objective is a worked example, not a checkpoint (S03 "Examples").
		const label = attrs.has('objective') ? 'Checkpoint' : 'Example';
		const title = str('title') ?? str('id') ?? name;
		const heading = withHeading(`#### ${label}: ${title}`);
		if (!alternate) return heading;
		// The alternate adds what the page shows next to the stem (spec S12 "Rendering a lesson body").
		const extra =
			label === 'Example' ? exampleOutput(where, attrs, aside) : checkpointOptions(where, name, attrs, aside);
		return extra ? `${heading}\n\n${extra}` : heading;
	}
	switch (name) {
		case 'Pitfall':
			return withHeading(`#### Pitfall: ${str('title') ?? ''}`.trimEnd());
		case 'Prompt': {
			// The same caption `Prompt.astro` shows, so an invented transcript is marked as one here too.
			const model = str('model') ?? '';
			const recorded = str('recorded') ?? '';
			const illustrative = model === 'illustrative' || recorded === 'illustrative';
			const heading = illustrative
				? 'Prompt (illustrative, not a recorded transcript)'
				: `Prompt · ${model}, recorded ${recorded}`;
			return `#### ${heading}\n\n${aside.keep(fenced(aside.restore(body)))}`;
		}
		case 'Response':
			return `#### Response\n\n${aside.keep(fenced(aside.restore(body)))}`;
		case 'Exercise': {
			const stretch = str('stretch');
			return withHeading('## Exercise') + (stretch ? `\n\nStretch: ${stretch}` : '');
		}
		case 'MorePractice':
			return withHeading('## More practice');
		case 'Recap':
			return withHeading('## Recap');
		case 'Habit':
			// The habit text under its own heading, so the tutor can name it when one is due (S07 "Tutor mode").
			// The alternate mirrors the page, which shows no habit id (spec S12 "Rendering a lesson body").
			if (alternate) return withHeading('#### Habit');
			return withHeading(`#### Habit: ${str('id') ?? ''}`.trimEnd());
		default:
			// Any other component, a widget included, is its children. A self-closing widget leaves nothing.
			return body;
	}
}

/** A component is a JSX element with a capitalized name. A lowercase element is raw HTML (`<a href>`) and stays as written. */
const isComponent = (node: MdxNode): node is JsxElement => isJsxElement(node) && /^[A-Z]/.test(node.name ?? '');

/** The outermost components under `node`, in source order. The search goes through Markdown and raw HTML nodes and stops at a component, whose own children `renderComponents` handles. */
function componentsUnder(node: MdxNode): JsxElement[] {
	const out: JsxElement[] = [];
	for (const child of node.children ?? []) {
		if (isComponent(child)) out.push(child);
		else out.push(...componentsUnder(child));
	}
	return out;
}

/** The source offsets a node spans. The parser sets them on every node, so a missing one is a bug. */
function spanOf(node: MdxNode, where: string): { start: number; end: number } {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start === undefined || end === undefined) throw new Error(`${where}: a node without a source position`);
	return { start, end };
}

/**
 * The text of `src` between `from` and `to`, with each component in `components`
 * (the outermost ones in that range, in order) rendered to Markdown (`renderTag`),
 * children first. `src` is the lesson with its code set aside, parsed by the MDX
 * parser (`lib/checkpoint-tags.ts`), so a tag reads here as it does on the page
 * and a tag inside code is not seen.
 */
function renderComponents(
	src: string,
	from: number,
	to: number,
	components: JsxElement[],
	aside: CodeAside,
	where: string,
	alternate: AlternateOptions | undefined,
): string {
	let out = '';
	let pos = from;
	for (const node of components) {
		const name = node.name as string;
		const { start, end } = spanOf(node, where);
		const attrs = attrsOf(node, where);
		let children = '';
		const first = node.children[0];
		const last = node.children.at(-1);
		if (first && last) {
			const range = { from: spanOf(first, where).start, to: spanOf(last, where).end };
			children = renderComponents(src, range.from, range.to, componentsUnder(node), aside, where, alternate);
		}
		// A component is a block of its own, so blank lines set it off from its neighbors.
		const rendered =
			alternate?.components?.[name]?.(attrs) ?? renderTag(where, name, attrs, children, aside, alternate);
		out += src.slice(pos, start) + (rendered ? `\n\n${rendered}\n\n` : '');
		pos = end;
	}
	return out + src.slice(pos, to);
}

/** The MDX tree of the lesson with its code set aside. A parse error names `where`. */
function parseAside(text: string, where: string): MdxNode {
	try {
		return parseMdx(text);
	} catch (e) {
		throw new Error(`${where}: ${(e as Error).message}`);
	}
}

/** Every root-relative link and image in Markdown and raw HTML, made absolute. Links with a scheme, `#` and `mailto:` are left alone. */
export function absolutizeLinks(md: string, site: string): string {
	return md
		.replace(/(!?\[[^\]]*\]\()(\/(?!\/)[^)\s]*)/g, (_, pre: string, path: string) => pre + absoluteUrl(path, site))
		.replace(/((?:href|src)=")(\/(?!\/)[^"]*)/g, (_, pre: string, path: string) => pre + absoluteUrl(path, site));
}

/** The MDX import block: the `import` lines (and blank lines between them) before the first line of content. */
function withoutImportBlock(body: string): string {
	const lines = body.split('\n');
	let i = 0;
	while (i < lines.length && (/^import\s/.test(lines[i] as string) || (lines[i] as string).trim() === '')) i++;
	return lines.slice(i).join('\n');
}

/** Every `#<id>` link in Markdown and raw HTML, resolved against `pageUrl`, so it works outside the page. */
function absolutizeFragments(md: string, pageUrl: string): string {
	return md
		.replace(/(!?\[[^\]]*\]\()(#[^)\s]*)/g, (_, pre: string, frag: string) => pre + pageUrl + frag)
		.replace(/((?:href|src)=")(#[^"]*)/g, (_, pre: string, frag: string) => pre + pageUrl + frag);
}

/** A rendered lesson body and the citation keys it holds, in order of first citation in the rendered text. */
export interface RenderedBody {
	markdown: string;
	cited: string[];
}

/**
 * The one lesson body renderer. Without `alternate` it is the bundle `prose`;
 * with it, the lesson body of a Markdown alternate, which differs in the
 * ways spec S12 "Rendering a lesson body" lists.
 */
export function renderLessonBody(
	body: string,
	site: string,
	where: string,
	bibliography: Record<string, BibliographyEntry>,
	alternate?: AlternateOptions,
): RenderedBody {
	const aside = setAsideCode(withoutImportBlock(body));
	const text = resolveCitations(aside.text, bibliography, aside, where);
	const tree = parseAside(text, where);
	const components = renderComponents(text, 0, text.length, componentsUnder(tree), aside, where, alternate);
	// Runs of blank lines are collapsed before the code comes back, so a double blank line inside a fence stays.
	let rendered = absolutizeLinks(components, site);
	if (alternate) rendered = absolutizeFragments(rendered, alternate.pageUrl);
	const markdown = `${aside.restore(rendered.replace(/\n{3,}/g, '\n\n')).trim()}\n`;
	return { markdown, cited: citedKeys(aside.text, markdown, bibliography) };
}

/**
 * The keys of the `(@key)` tokens outside code in `text`, kept when their
 * rendered form is in `markdown` and ordered by where it first is there. A
 * token in a left-out part, such as a hidden `review` alternate, is dropped,
 * because the reader never sees it.
 */
function citedKeys(text: string, markdown: string, bibliography: Record<string, BibliographyEntry>): string[] {
	const keys = [...new Set(splitCitations(text).flatMap((p) => (p.type === 'citation' ? [p.key] : [])))];
	return keys
		.map((key) => ({ key, at: markdown.indexOf(citationText(bibliography[key] as BibliographyEntry)) }))
		.filter((k) => k.at >= 0)
		.sort((a, b) => a.at - b.at)
		.map((k) => k.key);
}

/**
 * The lesson body as Markdown for a reader without the components: the
 * import block dropped, components rendered to plain text (a `Pitfall`
 * becomes a titled paragraph, a `Prompt` a fenced block), widgets omitted,
 * links absolute, and each `(@key)` citation rendered by `citationText` from
 * `bibliography`. Fenced blocks and inline code are copied unchanged, the
 * citations in them included. `where` names the lesson in error messages.
 * This is the bundle `prose` (spec S08 "Format"): `renderLessonBody` without
 * the alternate flag.
 */
export function proseOf(
	body: string,
	site: string,
	where = 'lesson',
	bibliography: Record<string, BibliographyEntry> = {},
): string {
	return renderLessonBody(body, site, where, bibliography).markdown;
}

/**
 * The bundle of one lesson. Throws when `covers` names an unknown topic, a
 * served objective is in no competency, or an `assumes` entry names a lesson
 * that has no page, so its `url` would be a 404.
 */
export function bundleOf(lesson: Lesson, sources: BundleSources): LessonBundle {
	const { site } = sources;
	const { data } = lesson;
	const topic = sources.topics.find((t) => t.id === data.covers);
	if (!topic) throw new Error(`${lesson.id}: covers ${data.covers}, which is not a topic`);
	const objectives = data.serves.map((id): BundleObjective => {
		const owner = sources.competencies.find((c) => c.objectives.some((o) => o.id === id));
		const objective = owner?.objectives.find((o) => o.id === id);
		if (!owner || !objective) throw new Error(`${lesson.id}: serves ${id}, which is in no competency`);
		const tail = id.split('/').at(-1) ?? id;
		return {
			id,
			statement: objective.statement,
			level: objective.level,
			competency_url: absoluteUrl(`/competencies/${owner.id}/#${tail}`, site),
			behaviors: objective.behaviors.map((b, i) => {
				const cite = (field: 'claim' | 'why' | 'example') =>
					plainCitations(b[field], sources.bibliography, `${lesson.id}: ${id} behavior ${i + 1} ${field}`);
				return { claim: cite('claim'), why: cite('why'), example: cite('example') };
			}),
		};
	});
	const assumes = (data.assumes ?? []).map((a): BundleAssumed => {
		if (a.lesson && !sources.lessonIds.has(a.lesson))
			throw new Error(`${lesson.id}: assumes ${a.objective} from ${a.lesson}, which is not a lesson page`);
		return {
			objective: a.objective,
			lesson: a.lesson ?? null,
			section: a.section ?? null,
			url: a.lesson ? `${lessonUrl(a.lesson, site)}${a.section ? `#${a.section}` : ''}` : null,
		};
	});
	const checkpoints = sources.items
		.filter((i) => i.lesson === lesson.id)
		.map(({ lesson: _lesson, ...rest }): BundleCheckpoint => rest);
	return {
		version: BUNDLE_VERSION,
		id: lesson.id,
		url: lessonUrl(lesson.id, site),
		title: data.title,
		mode: data.mode,
		prose: proseOf(lesson.body ?? '', site, lesson.id, sources.bibliography),
		topics: [
			{
				id: topic.id,
				name: topic.name,
				definition: topic.definition,
				url: absoluteUrl(`/topics/${topic.id}/`, site),
				concepts: topic.concepts.map((c) => ({ id: c.id, name: c.name, definition: c.definition })),
			},
		],
		objectives,
		assumes,
		checkpoints,
		extends_to: (data['extends-to'] ?? []).map((e) => ({ label: e.label, url: absoluteUrl(e.href, site) })),
	};
}

/** One bundle per live lesson (every lesson page), in lesson id order, so the output is the same on every build. */
export async function buildLessonBundles(site: string): Promise<LessonBundle[]> {
	const [topics, competencies, bibliography, lessons, { items }] = await Promise.all([
		getCollection('topics'),
		getCollection('competencies'),
		getCollection('bibliography'),
		getLessons(),
		buildCheckpointExport(),
	]);
	const sources: BundleSources = {
		topics: topics.map((t) => t.data),
		competencies: competencies.map((c) => c.data),
		items,
		lessonIds: new Set(lessons.map((l) => l.id)),
		bibliography: Object.fromEntries(bibliography.map((e) => [e.id, e.data])),
		site,
	};
	return lessons.map((l) => bundleOf(l, sources));
}
