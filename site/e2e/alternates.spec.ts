/** The Markdown alternate head hint (spec S12 "Head hints"): it resolves on the served site. */
import { expect, liveLessons, test } from './fixtures';

test("a lesson page's Markdown alternate hint resolves to its alternate", async ({ page, request }) => {
	// The first live lesson in area and course order, from the data tree (#242); every lesson page gets the hint the same way.
	const lesson = liveLessons()[0] as string;
	await page.goto(`${lesson}/`);
	const link = page.locator('head link[rel="alternate"][type="text/markdown"]');
	await expect(link).toHaveCount(1);
	const href = (await link.getAttribute('href')) as string;
	// The href is absolute on the published origin, so it is fetched from the local server under the same path.
	const url = new URL(href);
	expect(url.pathname).toBe(`/ai-training/${lesson}/index.md`);
	const res = await request.get(url.pathname.replace(/^\/ai-training\//, ''));
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toBe('text/markdown; charset=utf-8');
	const title = await page.locator('h1').first().textContent();
	expect(await res.text()).toMatch(new RegExp(`^# ${(title ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n`));
});
