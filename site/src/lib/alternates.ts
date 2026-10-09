import { getCollection } from 'astro:content';
import { aboutFigure, getAboutFigures } from './about-figures';
import { getAreas } from './areas';
import type { BibliographyEntry } from './citations';
import { type CoursePlan, getCourse, isLive, type PlanEntry } from './courses';
import { type AlternateOptions, renderLessonBody } from './lesson-bundles';
import { getLessons } from './lessons';
import { pageUrlOf, renderAlternate } from './markdown-alternate';
import {
	alignmentRowsOf,
	competencyAlternate,
	glossaryMarkdown,
	type TopicData,
	topicAlternate,
} from './reference-alternates';

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

/** Every guide (`/guides/<slug>/`) and the contributing page: the page's Markdown with the lesson link rules. */
async function plainPageSources(): Promise<AlternateSource[]> {
	const docs = (await getCollection('docs'))
		.filter((d) => d.id.startsWith('guides/') || d.id === 'contributing')
		.sort((a, b) => a.id.localeCompare(b.id));
	return docs.map((page) => {
		const path = `/${page.id}/`;
		return { path, render: (site: string) => renderPageAlternate(page, path, site) };
	});
}

/**
 * The About page (issue #762): its prose, with each `<AboutFigure>` as its number. The topic map and the
 * widget on the page leave nothing, as a widget does in a lesson alternate.
 */
async function aboutSources(): Promise<AlternateSource[]> {
	const page = (await getCollection('docs')).find((d) => d.id === 'about');
	if (!page) return [];
	const path = '/about/';
	return [
		{
			path,
			render: async (site: string) => {
				const figures = await getAboutFigures();
				return renderPageAlternate(page, path, site, {
					AboutFigure: (attrs) => aboutFigure(figures, String(attrs.get('of')?.value)),
				});
			},
		},
	];
}

async function getTopics(): Promise<TopicData[]> {
	return (await getCollection('topics')).map((t) => t.data);
}

/** The glossary: its own prose, with `<Glossary />` as one `##` heading per concept. */
async function glossarySources(): Promise<AlternateSource[]> {
	const page = (await getCollection('docs')).find((d) => d.id === 'glossary');
	if (!page) return [];
	const path = '/glossary/';
	return [
		{
			path,
			render: async (site: string) => {
				const entries = glossaryMarkdown(await getTopics(), site);
				return renderPageAlternate(page, path, site, { Glossary: () => entries });
			},
		},
	];
}

/** Every topic page (`pages/topics/[...id].astro`), from the data the page reads. */
async function topicSources(): Promise<AlternateSource[]> {
	const topics = await getTopics();
	return topics.map((topic) => ({
		path: `/topics/${topic.id}/`,
		render: async (site: string) => {
			const [areas, lessons, competencies, bibliography] = await Promise.all([
				getAreas(),
				getLessons(),
				getCollection('competencies'),
				getBibliography(),
			]);
			return topicAlternate(
				{
					topic,
					areaName: areas.find((a) => a.slug === topic.area)?.name ?? topic.area,
					nameOf: (id) => topics.find((t) => t.id === id)?.name ?? id,
					dependants: topics.filter((t) => t.links.prerequisites.includes(topic.id)),
					competencies: competencies.map((c) => c.data).filter((c) => c.topics.includes(topic.id)),
					lessons: lessons
						.filter((l) => l.data.covers === topic.id)
						.map((l) => ({ id: l.id, title: l.data.title ?? l.id, mode: l.data.mode })),
					bibliography,
				},
				site,
			);
		},
	}));
}

/** Every competency page (`pages/competencies/[...id].astro`), from the data the page reads. */
async function competencySources(): Promise<AlternateSource[]> {
	const competencies = (await getCollection('competencies')).map((c) => c.data);
	return competencies.map((competency) => ({
		path: `/competencies/${competency.id}/`,
		render: async (site: string) => {
			const [areas, topics, lessons, alignment, bibliography] = await Promise.all([
				getAreas(),
				getTopics(),
				getLessons(),
				getCollection('alignment'),
				getBibliography(),
			]);
			const area = areas.find((a) => a.slug === competency.area);
			if (!area) throw new Error(`competency ${competency.id}: area ${competency.area} is not an area`);
			const own = new Set(competency.objectives.map((o) => o.id));
			return competencyAlternate(
				{
					id: competency.id,
					statement: competency.statement,
					area: { slug: area.slug, name: area.name },
					topics: competency.topics.map((id) => ({ id, name: topics.find((t) => t.id === id)?.name ?? id })),
					objectives: competency.objectives.map((o) => ({
						...o,
						servedBy: lessons
							.filter((l) => (l.data.serves ?? []).includes(o.id))
							.map((l) => ({ id: l.id, title: l.data.title ?? l.id })),
					})),
					alignment: alignmentRowsOf(
						alignment.map((f) => f.data),
						own,
					),
					bibliography,
				},
				site,
			);
		},
	}));
}

/**
 * Every page with an alternate, in a fixed order: the course pages in group order, the lessons by id, the
 * guides and the contributing page by id, the About page, the glossary, then the topic and competency pages.
 */
export async function alternateSources(): Promise<AlternateSource[]> {
	return [
		...(await courseSources()),
		...(await lessonSources()),
		...(await plainPageSources()),
		...(await aboutSources()),
		...(await glossarySources()),
		...(await topicSources()),
		...(await competencySources()),
	];
}

/** The paths of the pages with an alternate, for the head hint. */
export async function alternatePaths(): Promise<Set<string>> {
	return new Set((await alternateSources()).map((s) => s.path));
}
