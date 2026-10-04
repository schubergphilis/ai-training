// @ts-check

import { existsSync, readFileSync } from 'node:fs';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';
import { parse as parseYaml } from 'yaml';
import { remarkCheckpoints } from './plugins/remark-checkpoints.mjs';
import { remarkCitations } from './plugins/remark-citations.mjs';
import { remarkTerms } from './plugins/remark-terms.mjs';
import { allLessons, allTopics, courseLessonIds, readAreaTree } from './scripts/lib/area-tree.mjs';
import { CSP } from './scripts/lib/csp.mjs';
import { BASE, SITE } from './scripts/lib/site-address.mjs';

// This is a *project* site: it deploys under a subpath of
// https://schubergphilis.github.io (e.g.
// https://schubergphilis.github.io/ai-training/), so it sets `base`.
// Both are in scripts/lib/site-address.mjs, which `mise run bundles` reads too.
const base = BASE;

/**
 * Content links and image sources are written root-relative (`/guides/foo/`,
 * `/guides/foo.png`) so the markdown stays portable. This rehype plugin
 * prefixes those with the deploy base path at render time, for both
 * `<a href>` and `<img src>` (including raw HTML `<img>` tags).
 */
function rehypeBaseLinks() {
	/** @param {any} node */
	const visit = (node) => {
		const attr =
			node.type === 'element' && node.tagName === 'a'
				? 'href'
				: node.type === 'element' && node.tagName === 'img'
					? 'src'
					: null;
		if (attr) {
			const value = node.properties?.[attr];
			if (
				typeof value === 'string' &&
				value.startsWith('/') &&
				!value.startsWith('//') &&
				!value.startsWith(`${base}/`)
			) {
				node.properties[attr] = base + value;
			}
		}
		for (const child of node.children ?? []) visit(child);
	};
	return (/** @type {any} */ tree) => {
		visit(tree);
	};
}

/**
 * The data tree (site/src/data, specs S09 to S11): groups and areas for the
 * sidebar, topics for the term plugin and the topic sidebar, lessons for the
 * term plugin. The same files are content collections, which validate them at
 * build; here they are read early so the sidebar and the remark plugins have them.
 */
const dataDir = new URL('./src/data/', import.meta.url).pathname;
const tree = readAreaTree(dataDir);
const topics = allTopics(tree);
const lessons = allLessons(tree);
const docsDir = new URL('./src/content/docs/', import.meta.url).pathname;

/** The topic sidebar: one collapsed group per area, in area order, topics by name. */
function topicSidebar() {
	return tree.areas.map((a) => ({
		label: a.area?.name ?? a.dir,
		collapsed: true,
		items: a.topics
			.map((t) => t.data)
			.sort((x, y) => x.name.localeCompare(y.name))
			.map((t) => ({ label: t.name, link: `/topics/${t.id}/` })),
	}));
}

/**
 * The competency sidebar (issue #514): one collapsed group per area that has
 * competencies, in area order, competencies by statement, each linked to its
 * competency page so that page shows as the current one.
 */
function competencySidebar() {
	return tree.areas
		.filter((a) => a.competencies.length > 0)
		.map((a) => ({
			label: a.area?.name ?? a.dir,
			collapsed: true,
			items: a.competencies
				.map((c) => c.data)
				.sort((x, y) => x.statement.localeCompare(y.statement))
				.map((c) => ({ label: c.statement, link: `/competencies/${c.id}/` })),
		}));
}

/**
 * The course sidebar, one group per S01 group: per area, a group whose heading
 * is the course page link, holding the live lessons in course order (spec S11
 * "Sidebar"). A course with parts nests each part as a group. A lesson is live
 * when its page exists, so a new lesson appears in the menu the moment its
 * page lands. Lesson labels come from the lesson YAML, the same source as the
 * page title. The `data-group-link` attribute on the first link is what makes
 * overrides/SidebarSublist.astro render it as the heading (lib/sidebar-groups.ts).
 */
function courseSidebar() {
	return tree.groups.map((g) => ({
		label: g.name,
		items: g.areas.map((/** @type {string} */ slug) => {
			const a = tree.areas.find((x) => x.dir === slug);
			if (!a) throw new Error(`groups.yaml names area ${slug}, but src/data/areas/${slug}/ does not exist`);
			const course = a.courses.find((c) => c.data.id === slug)?.data;
			if (!course) throw new Error(`src/data/areas/${slug}/courses/${slug}.yaml is missing`);
			const name = a.area?.name ?? slug;
			const byId = new Map(a.lessons.map((l) => [l.data.id, l.data]));
			const lessonItem = (/** @type {string} */ id) => {
				const l = byId.get(id);
				if (!l) throw new Error(`course ${slug} lists ${id}, which has no lesson file`);
				if (!existsSync(new URL(`${id}.mdx`, `file://${docsDir}`))) return [];
				return [{ slug: id, label: l.title }];
			};
			const items = course.parts
				? course.parts.flatMap((/** @type {{ title: string, lessons: string[] }} */ p) => {
						const live = p.lessons.flatMap(lessonItem);
						return live.length ? [{ label: p.title, collapsed: false, items: live }] : [];
					})
				: courseLessonIds(course).flatMap(lessonItem);
			return {
				label: name,
				collapsed: false,
				items: [{ slug, label: name, attrs: { 'data-group-link': '' } }, ...items],
			};
		}),
	}));
}

/**
 * The bibliography (site/src/data/bibliography.yaml) for the citation plugin.
 * The same file is a content collection, which validates its entries; here it
 * is only read so `(@key)` can resolve at remark time.
 */
const bibliography = parseYaml(readFileSync(new URL('./src/data/bibliography.yaml', import.meta.url), 'utf8'));

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base,
	// Content Security Policy (issue #608): Astro writes it as a <meta> into every
	// page. The policy and why it has each source are in scripts/lib/csp.mjs.
	security: { csp: CSP },
	// No inline <style>: Astro 7.3 leaves the inline styles of components used in
	// MDX out of `style-src`, so every style is a file under 'self' (#608).
	build: { inlineStylesheets: 'never' },
	markdown: {
		// Checkpoint props first, read from the tree before any plugin rewrites
		// it. Then first-mention terms, then citations `(@key)` (spec S03
		// "Citations and terms"). Terms run before citations so the References
		// list the citation plugin appends is never scanned for terms. Both
		// emit root-relative or in-page links, so they run before
		// rehypeBaseLinks, which adds the deploy base.
		remarkPlugins: [
			remarkCheckpoints,
			[remarkTerms, { topics, lessons, docsDir }],
			[remarkCitations, { bibliography }],
		],
		rehypePlugins: [rehypeBaseLinks],
	},
	integrations: [
		starlight({
			// Fails the build on a dead internal link. lychee cannot do this
			// job here: root-relative links resolve against the published
			// schubergphilis.github.io origin, which .lychee.toml excludes.
			//
			// The glossary anchors (`/glossary/#<concept>`) are rendered by the
			// Glossary component, so the validator, which only reads Markdown
			// headings, cannot see them and would reject every term link the
			// remark-terms plugin emits. That one prefix is excluded here, and
			// remark-terms covers it instead: it fails the build on any Markdown
			// link to `/glossary/#<id>` whose id is not a concept, on every page,
			// and its own links are built from concept ids. Every other link is
			// still validated by the plugin below.
			plugins: [
				starlightLinksValidator({
					exclude: ({ link }) => link.startsWith(`${base}/glossary/#`),
				}),
			],
			title: 'AI Training',
			// The footer's "Last updated" date is the file's last git commit, so it moves
			// on every edit. `sources-checked` in the lesson file is a separate date.
			lastUpdated: true,
			description:
				'An open training suite for getting started with AI: concepts, safety, using agents, AI-assisted software engineering, customizing and building agents.',
			favicon: '/favicon.svg',
			// Adds the Markdown alternate head hint to the pages that have one (spec S12 "Head hints").
			routeMiddleware: './src/route-data.ts',
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'apple-touch-icon',
						sizes: '180x180',
						href: `${base}/apple-touch-icon.png`,
					},
				},
			],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/schubergphilis/ai-training' },
				// The organization site this is a sub-site of (spec S14).
				{ icon: 'external', label: 'Schuberg Philis open source', href: 'https://schubergphilis.github.io/' },
			],
			editLink: { baseUrl: 'https://github.com/schubergphilis/ai-training/edit/main/site/' },
			// Inter is self-hosted from its package, so a page load sends no request to a font service (spec S14).
			customCss: ['@fontsource-variable/inter', './src/styles/custom.css', './src/styles/lesson.css'],
			sidebar: [
				// Ordered by what a learner needs first. "Your data" holds the tutor guide
				// too, so it is near the top, but collapsed until the learner opens it.
				{
					label: 'Your data',
					collapsed: true,
					items: [
						{ slug: 'progress', label: 'Your progress' },
						{ slug: 'reference', label: 'Your reference' },
						{ slug: 'settings', label: 'Your settings' },
						{ slug: 'guides/tutor', label: 'Study with the tutor' },
					],
				},
				// The Foundations and Engineering groups come from the data tree; see courseSidebar().
				...courseSidebar(),
				{
					label: 'Reference',
					items: [
						// The topic map is the heading of the per-area topic groups (issue #228).
						{
							label: 'Topic map',
							collapsed: true,
							items: [{ slug: 'map', label: 'Topic map', attrs: { 'data-group-link': '' } }, ...topicSidebar()],
						},
						// The competency map is the heading of the per-area competency groups, as the topic map is (#514).
						{
							label: 'Competency map',
							collapsed: true,
							items: [
								{ slug: 'competencies', label: 'Competency map', attrs: { 'data-group-link': '' } },
								...competencySidebar(),
							],
						},
						{ slug: 'glossary', label: 'Glossary' },
					],
				},
				{
					label: 'Contributing',
					collapsed: true,
					items: [
						{ slug: 'contributing', label: 'Contributing' },
						{ slug: 'guides/writing-pages', label: 'Writing pages' },
					],
				},
				{ slug: 'guides/running-a-workshop', label: 'Run a workshop' },
			],
			components: {
				// Lesson frame: routing cards, finish/skip, checkpoint script.
				MarkdownContent: './src/components/overrides/MarkdownContent.astro',
				// The default footer plus the "Content co-authored by AI." notice.
				Footer: './src/components/overrides/Footer.astro',
				// No "On this page" when it would list only the title; the column stays.
				TableOfContents: './src/components/overrides/TableOfContents.astro',
				// The default mobile dropdown plus the same groups, moved in by a client script.
				MobileTableOfContents: './src/components/overrides/MobileTableOfContents.astro',
				// The default sidebar plus a due review count next to each course link.
				Sidebar: './src/components/overrides/Sidebar.astro',
			},
		}),
	],
});
