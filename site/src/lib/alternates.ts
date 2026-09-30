import { getCollection } from 'astro:content';
import { getAreas } from './areas';
import type { BibliographyEntry } from './citations';
import { type CoursePlan, getCourse, isLive, type PlanEntry } from './courses';
import { type AlternateOptions, renderLessonBody } from './lesson-bundles';
import { getLessons } from './lessons';
import { pageUrlOf, renderAlternate } from './markdown-alternate';

/**
 * Which pages have a Markdown alternate, and how each one renders (spec S12
 * "Which pages get one" and "Rendering the other pages"). The alternate
 * route (`pages/[...page]/index.md.ts`) builds one file per entry, and the
 * head hint (`route-data.ts`) links a page to its alternate only when its
 * path is here, so no page points at a file that doesn't exist. A new page
 * kind gets its alternate by adding its entries to `alternateSources`.
 */

/** One page with an alternate: its root-relative path and the function that renders the alternate. */
export interface AlternateSource {
	/** The HTML page's path, such as `/safety/agent-risk/`. */
	path: string;
	render: (site: string) => Promise<string>;
}

async function getBibliography(): Promise<Record<string, BibliographyEntry>> {
	return Object.fromEntries((await getCollection('bibliography')).map((e) => [e.id, e.data]));
}

/** The course plan of a course page alternate: a `##` heading per part (none in a flat course), each with its lessons. */
export function coursePlanMarkdown(course: CoursePlan, site: string): string {
	const line = (e: PlanEntry) => {
		if (!isLive(e)) return `- ${e.title} (planned)`;
		const link = `- [${e.title}](${pageUrlOf(`/${e.id}/`, site)})`;
		return e.description ? `${link}: ${e.description}` : link;
	};
	if (!course.parts) return course.entries.map(line).join('\n');
	return course.parts.map((p) => `## ${p.title}\n\n${p.lessons.map(line).join('\n')}`).join('\n\n');
}

/**
 * The alternate of a docs page whose body is Markdown or MDX: the body through the lesson body renderer
 * with the alternate flag, which also gives a guide the link rules of a lesson (S12 "Rendering the other
 * pages"), inside the anatomy of S12 "Anatomy". `components` renders a generated component by name.
 */
export async function renderPageAlternate(
	page: {
		id: string;
		body?: string | undefined;
		data: { title?: string | undefined; description?: string | undefined };
	},
	path: string,
	site: string,
	components?: AlternateOptions['components'],
): Promise<string> {
	const bibliography = await getBibliography();
	const pageUrl = pageUrlOf(path, site);
	const { markdown, cited } = renderLessonBody(page.body ?? '', site, page.id, bibliography, {
		pageUrl,
		...(components ? { components } : {}),
	});
	return renderAlternate(
		{
			title: page.data.title ?? '',
			description: page.data.description ?? '',
			path,
			body: markdown,
			references: cited.map((key) => ({ key, entry: bibliography[key] as BibliographyEntry })),
		},
		site,
	);
}

/** Every live lesson: its page body through the lesson body renderer with the alternate flag. */
async function lessonSources(): Promise<AlternateSource[]> {
	return (await getLessons()).map((lesson) => {
		const path = `/${lesson.id}/`;
		return { path, render: (site) => renderPageAlternate(lesson, path, site) };
	});
}

/** Every course page: its own prose, the lesson graph left out, and the course plan as lists. */
async function courseSources(): Promise<AlternateSource[]> {
	const [areas, docs] = await Promise.all([getAreas(), getCollection('docs')]);
	return areas.flatMap((area) => {
		const page = docs.find((d) => d.id === area.slug);
		if (!page) return [];
		const path = `/${area.slug}/`;
		return [
			{
				path,
				render: async (site: string) => {
					const plan = coursePlanMarkdown(await getCourse(area.slug), site);
					return renderPageAlternate(page, path, site, { CoursePlan: () => plan });
				},
			},
		];
	});
}

/** Every page with an alternate, in a fixed order: the course pages in group order, then the lessons by id. */
export async function alternateSources(): Promise<AlternateSource[]> {
	return [...(await courseSources()), ...(await lessonSources())];
}

/** The paths of the pages with an alternate, for the head hint. */
export async function alternatePaths(): Promise<Set<string>> {
	return new Set((await alternateSources()).map((s) => s.path));
}
