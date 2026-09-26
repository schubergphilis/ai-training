/**
 * Renders the `Footer` override (issues #274 and #339) with Astro's
 * Container API. Every page shows Starlight's "Last updated", and a lesson
 * whose plan sets `review-by` shows the review line before it.
 * Starlight's own parts read the route locals, so each render passes a
 * fake route with the fields they use.
 */
import Footer from '@components/overrides/Footer.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

const lastUpdated = new Date('2026-09-24T00:00:00Z');

function render(data: Record<string, unknown>) {
	const locals = {
		starlightRoute: {
			entry: { id: 'concepts/how-models-work', data },
			lang: 'en',
			dir: 'ltr',
			lastUpdated,
			editUrl: undefined,
			pagination: { prev: undefined, next: { href: '/ai-training/safety/', label: 'Safety' } },
		},
		t: (key: string) => key,
	} as unknown as App.Locals;
	return container.renderToString(Footer, { locals });
}

describe('Footer', () => {
	it('shows the review line, then "Last updated", on a lesson with review-by', async () => {
		const html = await render({ 'sources-checked': new Date('2026-09-20'), 'review-by': new Date('2027-03-20') });
		const review = html.indexOf('<p class="lesson-review" data-review-by="2027-03-20">');
		const updated = html.indexOf(`<time datetime="${lastUpdated.toISOString()}">`);
		expect(review).toBeGreaterThan(-1);
		expect(updated).toBeGreaterThan(review);
		expect(html).toContain('Sources checked on September 20, 2026. Review due by March 20, 2027.');
		expect(html).toContain('page.lastUpdated');
	});
	it('shows "Last updated" on a page without review-by', async () => {
		const html = await render({ title: 'Concepts' });
		expect(html).toContain('page.lastUpdated');
		expect(html).toContain(`<time datetime="${lastUpdated.toISOString()}">`);
		expect(html).not.toContain('data-review-by');
	});
	it('keeps the pagination before the meta line, and the AI notice on every page', async () => {
		const html = await render({ title: 'Concepts' });
		expect(html).toMatch(/<a href="\/ai-training\/safety\/" rel="next"[\s\S]*<div class="site-footer-meta">/);
		expect(html).toContain('<p class="ai-notice">Content co-authored by AI.</p>');
	});
});
