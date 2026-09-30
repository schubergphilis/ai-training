import type { BibliographyEntry } from './citations';
import { absoluteUrl } from './url';

/**
 * The Markdown alternate of a page (spec S12 "Markdown alternates"): the
 * page as UTF-8 Markdown with no frontmatter, at the page URL plus
 * `index.md`, for an agent that reads the site for a person. This module is
 * the part every page kind shares: the URL, the anatomy around the body
 * (S12 "Anatomy") and the response. It reads no collection, so the tests run
 * it directly. Which pages have an alternate, and how each kind renders its
 * body, is in `lib/alternates.ts`.
 */

/** The content type of an alternate, as `pages/data/tutor.md.ts` sets it and GitHub Pages serves a `.md` file. */
export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

/** The license line of every alternate: the content license and its URL. */
export const LICENSE_LINE = 'License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/';

/** The file name an alternate adds to a page URL, which on this site ends in `/` (S12 "URL scheme"). */
export const ALTERNATE_FILE = 'index.md';

/** A root-relative page path such as `/safety/agent-risk/`, checked: it starts and ends with `/`. */
function checkedPagePath(path: string): string {
	if (!path.startsWith('/') || !path.endsWith('/'))
		throw new Error(`a page path starts and ends with "/", got ${JSON.stringify(path)}`);
	return path;
}

/** The absolute URL of the HTML page at `path`, from Astro's `site` plus the base path. */
export function pageUrlOf(path: string, site: string): string {
	return absoluteUrl(checkedPagePath(path), site);
}

/** The absolute URL of the alternate of the page at `path`: the page URL plus `index.md`. */
export function alternateUrlOf(path: string, site: string): string {
	return `${pageUrlOf(path, site)}${ALTERNATE_FILE}`;
}

/** One cited source of a page, for its `## References` section. */
export interface AlternateReference {
	key: string;
	entry: BibliographyEntry;
}

/** One References list item: the title, the container when it differs from the title, and the `url` when there is one. */
export function referenceLine({ entry }: AlternateReference): string {
	const container = entry.container && entry.container !== entry.title ? `, ${entry.container}` : '';
	const url = entry.url ? `, ${entry.url}` : '';
	return `- ${entry.title}${container}${url}`;
}

/** What `renderAlternate` puts around the body. */
export interface AlternatePage {
	/** The page `title`. For a course page that is the area `name`. */
	title: string;
	/** The page `description`, folded to one line for the summary. */
	description: string;
	/** The root-relative path of the HTML page, such as `/safety/agent-risk/`. */
	path: string;
	/** The page body, already rendered to Markdown by the rules of its page kind. */
	body: string;
	/** The cited sources in order of first citation. The section is left out when there are none. */
	references: AlternateReference[];
}

/**
 * An alternate, per S12 "Anatomy": the title as an H1, the description as a
 * one-line blockquote, the `Page:` and `License:` lines, the body, and a
 * `## References` list when the page cites a source. Ends in one newline.
 */
export function renderAlternate(page: AlternatePage, site: string): string {
	const title = page.title.trim();
	if (!title) throw new Error(`${page.path}: an alternate needs a title`);
	const summary = page.description.replace(/\s+/g, ' ').trim();
	if (!summary) throw new Error(`${page.path}: an alternate needs a description for its summary`);
	const parts = [
		`# ${title}`,
		`> ${summary}`,
		`Page: ${pageUrlOf(page.path, site)}\n${LICENSE_LINE}`,
		page.body.trim(),
	];
	if (page.references.length > 0) parts.push(`## References\n\n${page.references.map(referenceLine).join('\n')}`);
	return `${parts.filter((p) => p !== '').join('\n\n')}\n`;
}

/** The build-time response for an alternate, with the content type GitHub Pages gives a `.md` file. */
export function markdownResponse(text: string): Response {
	return new Response(text, { headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE } });
}

/** The `<link>` head entry that points a page at its alternate (S12 "Head hints"), in Starlight's head config form. */
export function alternateHeadLink(
	path: string,
	site: string,
): {
	tag: 'link';
	attrs: { rel: 'alternate'; type: 'text/markdown'; href: string };
} {
	return { tag: 'link', attrs: { rel: 'alternate', type: 'text/markdown', href: alternateUrlOf(path, site) } };
}
