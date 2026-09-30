import { splitCitations } from '../../plugins/citation-syntax.mjs';
import type { BibliographyEntry } from './citations';
import { absolutizeLinks } from './lesson-bundles';
import { type AlternateReference, pageUrlOf, renderAlternate } from './markdown-alternate';
import { plainCitations, setAsideCode } from './plain-citations';

/**
 * The bodies of the generated reference pages' Markdown alternates (spec S12
 * "Rendering the other pages"): the glossary entries, a topic page and a
 * competency page. Each function takes what its page reads from the data
 * tree and reads no collection itself, so the tests call it directly;
 * `lib/alternates.ts` gathers the data and lists the pages.
 */

/** One concept of a topic, as the topic YAML holds it. */
export interface ConceptData {
	id: string;
	name: string;
	definition: string;
}

/** The topic fields the glossary and the topic page show. */
export interface TopicData {
	id: string;
	area: string;
	name: string;
	definition: string;
	concepts: ConceptData[];
	links: { prerequisites: string[]; related?: string[] };
	sources?: string[];
}

/** One glossary entry: a concept and the topic it belongs to. */
export interface GlossaryEntry extends ConceptData {
	topic: TopicData;
}

/**
 * Every concept of every topic, sorted by name, as the glossary page lists
 * them (`components/Glossary.astro` renders the same list). A concept id
 * used twice throws, because the glossary anchor would be ambiguous.
 */
export function glossaryEntries(topics: TopicData[]): GlossaryEntry[] {
	const entries = topics
		.flatMap((t) => t.concepts.map((c) => ({ ...c, topic: t })))
		.sort((a, b) => a.name.localeCompare(b.name));
	const seen = new Set<string>();
	for (const e of entries) {
		if (seen.has(e.id)) throw new Error(`Duplicate concept id ${e.id} (in ${e.topic.id})`);
		seen.add(e.id);
	}
	return entries;
}

/** The `<Glossary />` of the glossary alternate: one `## <name> (<id>)` per concept, its definition and its topic page. */
export function glossaryMarkdown(topics: TopicData[], site: string): string {
	return glossaryEntries(topics)
		.map(
			(e) =>
				`## ${e.name} (${e.id})\n\n${e.definition}\n\nTopic: [${e.topic.name}](${pageUrlOf(`/topics/${e.topic.id}/`, site)})`,
		)
		.join('\n\n');
}

/** A comma-separated list of links, or `none` when the list is empty. */
function linkList(links: { text: string; path: string }[], site: string, none: string): string {
	return links.length ? links.map((l) => `[${l.text}](${pageUrlOf(l.path, site)})`).join(', ') : none;
}

/** A lesson as a topic or competency page links it. */
export interface LessonLink {
	id: string;
	title: string;
	mode?: string | undefined;
}

/** What a topic page shows, gathered from the data tree. */
export interface TopicPageData {
	topic: TopicData;
	areaName: string;
	/** The topic name for an id, as the page shows a link to another topic. */
	nameOf: (id: string) => string;
	/** The topics that list this one as a prerequisite. */
	dependants: TopicData[];
	/** The competencies that draw on this topic. */
	competencies: { id: string; statement: string }[];
	/** The live lessons that cover this topic. */
	lessons: LessonLink[];
	bibliography: Record<string, BibliographyEntry>;
}

/** One entry of a topic page's Sources section: the key, the title (linked when it has a url), the container and the type. */
function sourceLine(key: string, entry: BibliographyEntry | undefined): string {
	if (!entry) return `- \`${key}\` (unknown key)`;
	const title = entry.url ? `[${entry.title}](${entry.url})` : entry.title;
	const container = entry.container ? `, ${entry.container}` : '';
	return `- \`${key}\` ${title}${container} (${entry.type})`;
}

/**
 * A topic page alternate (S12 "Rendering the other pages"): the area line,
 * the definition, then Concepts, Links, Lessons and Sources under the
 * page's headings. "Your reference" is left out, because it reads browser
 * storage. The Sources section is the page's own list, so the alternate
 * has no separate References section.
 */
export function topicAlternate(data: TopicPageData, site: string): string {
	const { topic } = data;
	const path = `/topics/${topic.id}/`;
	const concepts = topic.concepts.map(
		(c) => `- **${c.name}**: ${c.definition} [glossary](${pageUrlOf('/glossary/', site)}#${c.id})`,
	);
	const topicLinks = (ids: string[]) => ids.map((id) => ({ text: data.nameOf(id), path: `/topics/${id}/` }));
	const links = [
		`- **Builds on:** ${linkList(topicLinks(topic.links.prerequisites), site, 'nothing')}`,
		`- **Leads to:** ${linkList(
			data.dependants.map((d) => ({ text: d.name, path: `/topics/${d.id}/` })),
			site,
			'nothing yet',
		)}`,
	];
	const related = topic.links.related ?? [];
	if (related.length) links.push(`- **Related:** ${linkList(topicLinks(related), site, '')}`);
	if (data.competencies.length)
		links.push(
			`- **Competencies drawing on it:** ${linkList(
				data.competencies.map((c) => ({ text: c.statement, path: `/competencies/${c.id}/` })),
				site,
				'',
			)}`,
		);
	const lessons = data.lessons.length
		? data.lessons
				.map((l) => `- [${l.title}](${pageUrlOf(`/${l.id}/`, site)})${l.mode ? ` (${l.mode})` : ''}`)
				.join('\n')
		: 'No lesson covers this topic yet.';
	const sources = topic.sources ?? [];
	const body = [
		`*${data.areaName}* · topic \`${topic.id}\``,
		topic.definition,
		`## Concepts\n\n${concepts.join('\n')}`,
		`## Links\n\n${links.join('\n')}`,
		`## Lessons\n\n${lessons}`,
		`## Sources\n\n${sources.length ? sources.map((k) => sourceLine(k, data.bibliography[k])).join('\n') : 'Original material.'}`,
	];
	return renderAlternate(
		{ title: topic.name, description: topic.definition, path, body: body.join('\n\n'), references: [] },
		site,
	);
}

/** One behavior of an objective, as the competency YAML holds it. */
export interface BehaviorData {
	claim: string;
	why: string;
	example: string;
}

/** One objective of a competency, with the live lessons that serve it. */
export interface ObjectiveData {
	id: string;
	statement: string;
	level: string;
	behaviors: BehaviorData[];
	servedBy: LessonLink[];
}

/** One alignment row that names an objective of the competency. */
export interface AlignmentRowData {
	framework: string;
	code: string;
	asks: string;
	/** The objective ids of this competency the row names. */
	objectives: string[];
}

/** What a competency page shows, gathered from the data tree. */
export interface CompetencyPageData {
	id: string;
	statement: string;
	area: { slug: string; name: string };
	topics: { id: string; name: string }[];
	objectives: ObjectiveData[];
	alignment: AlignmentRowData[];
	bibliography: Record<string, BibliographyEntry>;
}

/** A table cell: one line, with a `|` escaped so it doesn't end the cell. */
function cell(text: string): string {
	return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

/** The `(@key)` keys outside code in `text`, in order. */
function citedIn(text: string): string[] {
	return splitCitations(setAsideCode(text).text).flatMap((p) => (p.type === 'citation' ? [p.key] : []));
}

/**
 * The alignment rows of a competency (spec S10 "Alignment"): each framework
 * row that names at least one of `own`, with only those objectives kept.
 * The competency page and its alternate list the same rows.
 */
export function alignmentRowsOf(
	frameworks: { framework: string; rows: { code: string; asks: string; objectives: string[] }[] }[],
	own: Set<string>,
): AlignmentRowData[] {
	return frameworks.flatMap((f) =>
		f.rows
			.filter((r) => r.objectives.some((o) => own.has(o)))
			.map((r) => ({
				framework: f.framework,
				code: r.code,
				asks: r.asks,
				objectives: r.objectives.filter((o) => own.has(o)),
			})),
	);
}

/**
 * A competency page alternate (S12 "Rendering the other pages"): the area
 * and course lines, the topics it draws on, each objective with its level,
 * its behaviors table (`claim`, `why`, `example`) and the lessons serving
 * it, the alignment table, and the References of the behaviors' citations
 * in order of first citation. The progress colors are left out.
 */
export function competencyAlternate(data: CompetencyPageData, site: string): string {
	const path = `/competencies/${data.id}/`;
	const where = `competency ${data.id}`;
	const text = (s: string) => absolutizeLinks(plainCitations(s, data.bibliography, where), site);
	const objectives = data.objectives.map((o) => {
		const behaviors = o.behaviors.length
			? [
					'| Claim | Why | Example |',
					'| ----- | --- | ------- |',
					...o.behaviors.map((b) => `| ${cell(text(b.claim))} | ${cell(text(b.why))} | ${cell(text(b.example))} |`),
				].join('\n')
			: '*Behaviors not written yet.*';
		const served = o.servedBy.length
			? `Served by: ${linkList(
					o.servedBy.map((l) => ({ text: l.title, path: `/${l.id}/` })),
					site,
					'',
				)}`
			: 'No lesson serves this objective yet.';
		return `### ${o.statement} (${o.level})\n\n${behaviors}\n\n${served}`;
	});
	const body = [
		`*${data.area.name}* · competency \`${data.id}\``,
		`**Taught in:** the [${data.area.name}](${pageUrlOf(`/${data.area.slug}/`, site)}) course`,
		`**Draws on:** ${linkList(
			data.topics.map((t) => ({ text: t.name, path: `/topics/${t.id}/` })),
			site,
			'',
		)}`,
		`## Learning objectives\n\n${objectives.join('\n\n')}`,
	];
	if (data.alignment.length)
		body.push(
			[
				'## Alignment',
				'',
				'| Framework | Code | Asks | Objectives here |',
				'| --------- | ---- | ---- | --------------- |',
				...data.alignment.map(
					(a) =>
						`| ${cell(a.framework)} | ${cell(a.code)} | ${cell(a.asks)} | ${a.objectives.map((o) => o.split('/').pop()).join(', ')} |`,
				),
			].join('\n'),
		);
	const keys = [
		...new Set(
			data.objectives.flatMap((o) => o.behaviors.flatMap((b) => [b.claim, b.why, b.example].flatMap(citedIn))),
		),
	];
	const references: AlternateReference[] = keys.map((key) => ({
		key,
		entry: data.bibliography[key] as BibliographyEntry,
	}));
	return renderAlternate(
		{ title: data.statement, description: `Competency ${data.id}`, path, body: body.join('\n\n'), references },
		site,
	);
}
