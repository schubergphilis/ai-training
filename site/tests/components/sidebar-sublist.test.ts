/**
 * Renders the `SidebarSublist` override (issue #228) with Astro's Container
 * API: a group whose first link has the `data-group-link` attribute gets that
 * link as its heading next to a caret-only summary, and the groups under it
 * get a plain label.
 */
import SidebarSublist from '@components/overrides/SidebarSublist.astro';
import type { SidebarEntry } from '@lib/sidebar-groups';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

const lesson: SidebarEntry = {
	type: 'link',
	label: 'What a model is',
	href: '/ai-training/concepts/what-a-model-is/',
	isCurrent: false,
	badge: undefined,
	attrs: {},
};
const course: SidebarEntry = {
	type: 'group',
	label: 'Concepts',
	collapsed: true,
	badge: undefined,
	entries: [
		{
			type: 'link',
			label: 'Concepts',
			href: '/ai-training/concepts/',
			isCurrent: false,
			badge: undefined,
			attrs: { 'data-group-link': '' },
		},
		{ type: 'group', label: 'How language models work', collapsed: false, badge: undefined, entries: [lesson] },
	],
};
const plain: SidebarEntry = {
	type: 'group',
	label: 'Contributing',
	collapsed: true,
	badge: undefined,
	entries: [lesson],
};

async function render(sublist: SidebarEntry[]) {
	// The restore point counts groups in `Astro.locals`; an empty object is enough for it.
	return container.renderToString(SidebarSublist, { props: { sublist }, locals: {} as App.Locals });
}

describe('SidebarSublist', () => {
	it('renders the group link as the heading of its group, outside a caret-only summary', async () => {
		const html = await render([course]);
		// The heading link comes first in the item, then the details with a labelled, text-free summary.
		expect(html).toMatch(
			/<li class="linked[^"]*"[^>]*><a href="\/ai-training\/concepts\/" class="large[^"]*" data-group-link[^>]*><span[^>]*>Concepts<\/span><\/a><details[^>]*><summary class="caret-only[^"]*" aria-label="Toggle Concepts"[^>]*><svg/,
		);
		expect(html).not.toMatch(/class="group-label[^"]*"[^>]*><span class="large[^"]*"[^>]*>Concepts</);
		// The part label is plain, and its lesson is nested under it.
		expect(html).toMatch(/<span class="plain-label[^"]*"[^>]*>How language models work</);
		expect(html).toContain('href="/ai-training/concepts/what-a-model-is/"');
		// The collapsed course starts closed. The part is not collapsed, so it starts open.
		expect(html).toMatch(/<details open/);
	});
	it('keeps a linked group’s own badge, and falls back to the heading link’s badge', async () => {
		const badge = { text: 'New', variant: 'note' as const, class: undefined };
		const own = await render([{ ...course, badge }]);
		expect(own).toMatch(/<a href="\/ai-training\/concepts\/"[^>]*>.*?New.*?<\/a>/);
		const [heading, ...rest] = course.entries;
		const onLink = await render([{ ...course, entries: [{ ...(heading as SidebarEntry), badge }, ...rest] }]);
		expect(onLink).toMatch(/<a href="\/ai-training\/concepts\/"[^>]*>.*?New.*?<\/a>/);
	});
	it('renders a plain group with Starlight’s bold label and opens it when it holds the current page', async () => {
		const html = await render([{ ...plain, entries: [{ ...lesson, isCurrent: true }] }]);
		expect(html).toMatch(/<span class="large[^"]*"[^>]*>Contributing</);
		expect(html).toMatch(/<details open/);
		expect(html).toContain('aria-current="page"');
	});
});
