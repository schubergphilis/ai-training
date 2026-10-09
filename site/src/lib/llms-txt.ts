import { getCollection } from 'astro:content';
import { alternateSources } from './alternates';
import { getAreas } from './areas';
import { getCourse, isLive } from './courses';
import { getLessons } from './lessons';
import { alternateUrlOf } from './markdown-alternate';
import { absoluteUrl } from './url';

/**
 * The `llms.txt` index and its `llms-full.txt` companion (spec S12
 * "`llms.txt`"), following the llms.txt proposal (https://llmstxt.org/,
 * "Format"). The endpoints `pages/llms.txt.ts` and `pages/llms-full.txt.ts`
 * serve what this module returns. It reads the areas, courses and lessons
 * through the loaders the sidebar uses, so a planned lesson is left out, and
 * every link it writes to an alternate is checked against `alternateSources`.
 */

/** The root-relative path of the index, and of the file that joins every course alternate. */
export const LLMS_TXT_PATH = '/llms.txt';
export const LLMS_FULL_PATH = '/llms-full.txt';

/** The content type of both files, as for any `.txt` file. */
export const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/** What separates two alternates in `llms-full.txt`: a `---` line with a blank line on each side. */
export const FULL_SEPARATOR = '\n---\n\n';

/** One `[name](url): note` list item. `url` is absolute. */
export interface LlmsLink {
	name: string;
	url: string;
	note: string;
}

/** One `##` section of `llms.txt`. */
export interface LlmsSection {
	heading: string;
	links: LlmsLink[];
}

/** Everything `renderLlmsTxt` writes. */
export interface LlmsIndex {
	/** The front page `title`. */
	title: string;
	/** The front page `description`. */
	summary: string;
	sections: LlmsSection[];
}

/** A description folded to one line, as the alternate summary folds it. */
function oneLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * The paragraphs between the summary and the first section (S12 "Layout"): the site is pre-release, the
 * license line with a link to each license, the sitemap index and the data index.
 */
export function introParagraphs(site: string): string[] {
	return [
		'This site is pre-release. Its pages may change, and a lesson may be rewritten or moved.',
		'Content is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and code under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0).',
		`The [sitemap index](${absoluteUrl('/sitemap-index.xml', site)}) lists every page. The [data index](${absoluteUrl('/data/index.json', site)}) lists the data tree as JSON files.`,
	];
}

/** `llms.txt` from its parts, per S12 "Layout". Ends in one newline. */
export function renderLlmsTxt(index: LlmsIndex, site: string): string {
	const item = (l: LlmsLink) => {
		const note = oneLine(l.note);
		return note ? `- [${l.name}](${l.url}): ${note}` : `- [${l.name}](${l.url})`;
	};
	const parts = [
		`# ${index.title.trim()}`,
		`> ${oneLine(index.summary)}`,
		...introParagraphs(site),
		...index.sections.map((s) => `## ${s.heading}\n\n${s.links.map(item).join('\n')}`),
	];
	return `${parts.join('\n\n')}\n`;
}

/** One area's section: the course page, then its live lessons in course order, as page paths. */
interface AreaEntry {
	name: string;
	course: { path: string; note: string };
	lessons: { title: string; path: string; note: string }[];
}

/**
 * The areas in group order, each with its course page and live lessons in course order. An area without a
 * course page has no section, and it is an error when such an area has a live lesson, which would
 * otherwise be missing from both files.
 */
async function areaEntries(): Promise<AreaEntry[]> {
	const [areas, docs] = await Promise.all([getAreas(), getCollection('docs')]);
	const out: AreaEntry[] = [];
	for (const area of areas) {
		if (!docs.some((d) => d.id === area.slug)) {
			const live = await getLessons(area.slug);
			if (live.length > 0)
				throw new Error(`area ${area.slug} has live lessons but no course page, so llms.txt can't list them`);
			continue;
		}
		const course = await getCourse(area.slug);
		out.push({
			name: area.name,
			course: { path: `/${area.slug}/`, note: area.description },
			lessons: course.entries.filter(isLive).map((e) => {
				if (!e.description) throw new Error(`${e.id}: a live lesson needs a description for llms.txt`);
				return { title: e.title, path: `/${e.id}/`, note: e.description };
			}),
		});
	}
	return out;
}

/** The docs page with `id`, or an error naming it. */
function docOf<T extends { id: string }>(docs: T[], id: string): T {
	const page = docs.find((d) => d.id === id);
	if (!page) throw new Error(`llms.txt links the page ${id}, but src/content/docs has no such page`);
	return page;
}

/** The facts of `llms.txt`, read from the content collections and the data tree. */
export async function buildLlmsIndex(site: string): Promise<LlmsIndex> {
	const [docs, sources, areas] = await Promise.all([getCollection('docs'), alternateSources(), areaEntries()]);
	const withAlternate = new Set(sources.map((s) => s.path));
	const alternate = (name: string, path: string, note: string): LlmsLink => {
		if (!withAlternate.has(path))
			throw new Error(`llms.txt links the alternate of ${path}, which the build doesn't write`);
		return { name, url: alternateUrlOf(path, site), note };
	};
	const pageAlternate = (id: string): LlmsLink => {
		const page = docOf(docs, id);
		return alternate(page.data.title ?? id, `/${id}/`, page.data.description ?? '');
	};
	const front = docOf(docs, 'index');
	const guides = docs
		.filter((d) => d.id.startsWith('guides/'))
		.map((d) => d.id)
		.sort((a, b) => a.localeCompare(b));
	return {
		title: front.data.title ?? '',
		summary: front.data.description ?? '',
		sections: [
			...areas.map((a) => ({
				heading: a.name,
				links: [
					alternate(a.name, a.course.path, a.course.note),
					...a.lessons.map((l) => alternate(l.title, l.path, l.note)),
				],
			})),
			{ heading: 'Guides', links: guides.map(pageAlternate) },
			{
				heading: 'Reference',
				links: [
					pageAlternate('glossary'),
					{
						name: 'Checkpoint export',
						url: absoluteUrl('/data/checkpoints.json', site),
						note: 'Every checkpoint of the live lessons as JSON, with its options, hint and answer.',
					},
					{
						name: 'Tutor instructions',
						url: absoluteUrl('/data/tutor.md', site),
						note: 'The instruction file an AI tutor reads before it helps a learner with one lesson.',
					},
				],
			},
			{
				heading: 'Optional',
				links: [
					{
						name: 'Full course text',
						url: absoluteUrl(LLMS_FULL_PATH, site),
						note: 'The Markdown alternate of every course page and live lesson, in one file.',
					},
					pageAlternate('contributing'),
					pageAlternate('about'),
				],
			},
		],
	};
}

/** `llms.txt`, ready to serve. */
export async function llmsTxt(site: string): Promise<string> {
	return renderLlmsTxt(await buildLlmsIndex(site), site);
}

/**
 * `llms-full.txt` (S12 "`llms-full.txt`"): the alternate of each course page followed by those of its live
 * lessons in course order, the courses in the order of `llms.txt`, separated by `FULL_SEPARATOR`. Each
 * alternate is the text of its own `index.md`. Ends in one newline.
 */
export async function llmsFullTxt(site: string): Promise<string> {
	const [sources, areas] = await Promise.all([alternateSources(), areaEntries()]);
	const byPath = new Map(sources.map((s) => [s.path, s]));
	const paths = areas.flatMap((a) => [a.course.path, ...a.lessons.map((l) => l.path)]);
	const texts = await Promise.all(
		paths.map((path) => {
			const source = byPath.get(path);
			if (!source) throw new Error(`llms-full.txt needs the alternate of ${path}, which the build doesn't write`);
			return source.render(site);
		}),
	);
	return texts.join(FULL_SEPARATOR);
}

/** The build-time response for either file. */
export function textResponse(text: string): Response {
	return new Response(text, { headers: { 'Content-Type': TEXT_CONTENT_TYPE } });
}

/** The `<link rel="describedby">` head entry that points every page at `llms.txt` (S12 "Place"). */
export function describedByHeadLink(site: string): {
	tag: 'link';
	attrs: { rel: 'describedby'; href: string };
} {
	return { tag: 'link', attrs: { rel: 'describedby', href: absoluteUrl(LLMS_TXT_PATH, site) } };
}
