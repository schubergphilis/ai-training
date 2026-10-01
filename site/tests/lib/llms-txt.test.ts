import { alternateSources } from '@lib/alternates';
import { describedByHeadLink, FULL_SEPARATOR, llmsFullTxt, llmsTxt, renderLlmsTxt } from '@lib/llms-txt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_LINKS } from '../../scripts/lib/llms-txt.mjs';
import { alternateDocs } from './alternate-fixtures';
import { type CourseFixture, courses, type DocFixture, type LessonPlanFixture, lessonPlans } from './content';

const site = 'https://schubergphilis.github.io';
const ROOT = 'https://schubergphilis.github.io/ai-training';

/** What the mocked `astro:content` serves; each test starts from the full fixture set. */
const state = vi.hoisted(() => ({
	docs: undefined as DocFixture[] | undefined,
	lessonPlans: undefined as LessonPlanFixture[] | undefined,
	courses: undefined as CourseFixture[] | undefined,
}));

vi.mock('astro:content', async () => {
	const { mockContent } = await import('./content');
	return {
		getCollection: async (name: string) =>
			mockContent({
				...(state.docs ? { docs: state.docs } : {}),
				...(state.lessonPlans ? { lessonPlans: state.lessonPlans } : {}),
				...(state.courses ? { courses: state.courses } : {}),
			}).getCollection(name),
	};
});

const frontPage: DocFixture = {
	id: 'index',
	data: { title: 'AI Training', description: 'An open training suite\nfor AI.' },
};
const conceptsPage: DocFixture = {
	id: 'concepts',
	data: { title: 'Concepts', description: 'How AI works.' },
	body: 'The concepts course.\n',
};
/** Each lesson plan with a description, as `mise run data` requires of a live lesson. */
const describedPlans = lessonPlans.map((p) => ({
	...p,
	data: { ...p.data, description: `About ${p.data.title}.` },
}));

beforeEach(() => {
	state.docs = [frontPage, conceptsPage, ...alternateDocs];
	state.lessonPlans = describedPlans;
	state.courses = undefined;
});

/** The live lessons of the fixtures in course order, and the planned one. */
const live = [
	{ id: 'concepts/how-models-work', title: 'How a language model works' },
	{ id: 'safety/agent-risk', title: 'Why agent safety is different' },
	{ id: 'safety/deeper', title: 'Deeper' },
];

describe('llms.txt', () => {
	it('starts with the front page title and description, then the pre-release, license and index paragraphs', async () => {
		const text = await llmsTxt(site);
		expect(text.startsWith('# AI Training\n\n> An open training suite for AI.\n\nThis site is pre-release.')).toBe(
			true,
		);
		expect(text).toContain('[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)');
		expect(text).toContain('[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)');
		expect(text).toContain(`[sitemap index](${ROOT}/sitemap-index.xml)`);
		expect(text).toContain(`[data index](${ROOT}/data/index.json)`);
		expect(text.endsWith('\n')).toBe(true);
		expect(text.endsWith('\n\n')).toBe(false);
	});
	it('has one section per area with a course page in group order, then Guides, Reference and Optional', async () => {
		const headings = [...(await llmsTxt(site)).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
		expect(headings).toEqual(['Concepts', 'Safety', 'Guides', 'Reference', 'Optional']);
	});
	it('lists the course page alternate first in its section, with the area description', async () => {
		const text = await llmsTxt(site);
		expect(text).toContain(`## Safety\n\n- [Safety](${ROOT}/safety/index.md): Safety.\n- [Why agent safety`);
	});
	it('lists every live lesson exactly once, as its alternate with its data-tree description', async () => {
		const text = await llmsTxt(site);
		for (const l of live) {
			const line = `- [${l.title}](${ROOT}/${l.id}/index.md): About ${l.title}.`;
			expect(text.split('\n').filter((x) => x === line)).toHaveLength(1);
			expect(text.split(`${ROOT}/${l.id}/`)).toHaveLength(2);
		}
		const order = live.map((l) => text.indexOf(`${ROOT}/${l.id}/index.md`));
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});
	it('leaves out the planned lesson', async () => {
		const text = await llmsTxt(site);
		expect(text).not.toContain('Coming soon');
		expect(text).not.toContain('safety/coming');
	});
	it('lists the guides, the reference files and the optional links', async () => {
		const text = await llmsTxt(site);
		expect(text).toContain(
			`## Guides\n\n- [How to study with the tutor](${ROOT}/guides/tutor/index.md): Install the tutor.`,
		);
		expect(text).toContain(`- [Glossary](${ROOT}/glossary/index.md): Every concept.`);
		expect(text).toContain(`](${ROOT}/data/checkpoints.json): `);
		expect(text).toContain(`](${ROOT}/data/tutor.md): `);
		expect(text).toContain(`](${ROOT}/llms-full.txt): `);
		expect(text).toContain(`- [Contributing](${ROOT}/contributing/index.md): Building the site.`);
	});
	it('links only to alternates the build writes, besides the data files and llms-full.txt', async () => {
		const text = await llmsTxt(site);
		const paths = new Set((await alternateSources()).map((s) => `${ROOT}${s.path}index.md`));
		const links = [...text.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map((m) => m[1] ?? '');
		const other = [`${ROOT}/data/checkpoints.json`, `${ROOT}/data/tutor.md`, `${ROOT}/llms-full.txt`];
		for (const url of links) expect(paths.has(url) || other.includes(url), url).toBe(true);
	});
	it('leaves out a planned lesson between two live ones and keeps the order of the others', async () => {
		state.courses = courses.map((c) =>
			c.data.id === 'safety'
				? {
						...c,
						data: { id: 'safety', area: 'safety', lessons: ['safety/deeper', 'safety/coming', 'safety/agent-risk'] },
					}
				: c,
		);
		const text = await llmsTxt(site);
		expect(text).not.toContain('safety/coming');
		expect(text.indexOf(`${ROOT}/safety/deeper/index.md`)).toBeLessThan(
			text.indexOf(`${ROOT}/safety/agent-risk/index.md`),
		);
		const full = await llmsFullTxt(site);
		expect(full).not.toContain('# Coming soon');
		expect(full.indexOf('# Deeper\n')).toBeLessThan(full.indexOf('# Why agent safety is different\n'));
	});
	it('lists the course page of an area whose course has no live lesson', async () => {
		const later = describedPlans.find((p) => p.data.id === 'safety/coming') as LessonPlanFixture;
		state.lessonPlans = [
			...describedPlans,
			{ id: 'using-agents/lessons/later', data: { ...later.data, id: 'using-agents/later', title: 'Later' } },
		];
		state.courses = [
			...courses,
			{
				id: 'using-agents/courses/using-agents',
				data: { id: 'using-agents', area: 'using-agents', lessons: ['using-agents/later'] },
			},
		];
		state.docs = [
			...(state.docs ?? []),
			{ id: 'using-agents', data: { title: 'Using agents', description: 'Using agents.' }, body: 'The course.\n' },
		];
		const text = await llmsTxt(site);
		expect(text).toContain(
			`## Using agents\n\n- [Using agents](${ROOT}/using-agents/index.md): Using agents.\n\n## Guides`,
		);
		expect(text).not.toContain('using-agents/later');
		const full = await llmsFullTxt(site);
		expect(full.split(FULL_SEPARATOR).filter((t) => t.startsWith('# Using agents\n'))).toHaveLength(1);
	});
	it('holds no link off the site besides the license links the dist check allows', async () => {
		const links = [...(await llmsTxt(site)).matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? '');
		const off = links.filter((url) => !url.startsWith(`${ROOT}/`));
		expect(off).toEqual(EXTERNAL_LINKS);
	});
	it('fails when a live lesson has no description', async () => {
		state.lessonPlans = lessonPlans;
		await expect(llmsTxt(site)).rejects.toThrow('concepts/how-models-work: a live lesson needs a description');
	});
	it('fails when an area with a live lesson has no course page', async () => {
		state.docs = [frontPage, ...alternateDocs];
		await expect(llmsTxt(site)).rejects.toThrow('area concepts has live lessons but no course page');
		await expect(llmsFullTxt(site)).rejects.toThrow('area concepts has live lessons but no course page');
	});
	it('fails when the front page is missing', async () => {
		state.docs = [conceptsPage, ...alternateDocs];
		await expect(llmsTxt(site)).rejects.toThrow('llms.txt links the page index');
	});
});

describe('renderLlmsTxt', () => {
	it('folds each note to one line and writes a link without a note bare', () => {
		const text = renderLlmsTxt(
			{
				title: 'T',
				summary: 'S',
				sections: [
					{
						heading: 'H',
						links: [
							{ name: 'a', url: 'https://x/a', note: 'one\n  two' },
							{ name: 'b', url: 'https://x/b', note: '' },
						],
					},
				],
			},
			site,
		);
		expect(text.endsWith('## H\n\n- [a](https://x/a): one two\n- [b](https://x/b)\n')).toBe(true);
	});
});

describe('llms-full.txt', () => {
	it('holds each course page and live lesson alternate exactly once, in course order', async () => {
		const full = await llmsFullTxt(site);
		const sources = new Map((await alternateSources()).map((s) => [s.path, s]));
		const paths = ['/concepts/', `/${live[0]?.id}/`, '/safety/', `/${live[1]?.id}/`, `/${live[2]?.id}/`];
		const texts = await Promise.all(paths.map((p) => sources.get(p)?.render(site) ?? ''));
		expect(full).toBe(texts.join(FULL_SEPARATOR));
		for (const t of texts) expect(full.split(t)).toHaveLength(2);
		const order = texts.map((t) => full.indexOf(t));
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});
	it('separates two alternates with a --- line with a blank line on each side', async () => {
		const full = await llmsFullTxt(site);
		expect(full.split('\n\n---\n\n')).toHaveLength(5);
		expect(full.endsWith('\n')).toBe(true);
	});
	it('holds no planned lesson, guide or reference page', async () => {
		const full = await llmsFullTxt(site);
		expect(full).not.toContain('# Coming soon');
		expect(full).not.toContain('# How to study with the tutor');
		expect(full).not.toContain('# Glossary');
		expect(full).not.toContain('# Contributing');
	});
});

describe('describedByHeadLink', () => {
	it('points at llms.txt under the base path', () => {
		expect(describedByHeadLink(site)).toEqual({
			tag: 'link',
			attrs: { rel: 'describedby', href: `${ROOT}/llms.txt` },
		});
	});
});
