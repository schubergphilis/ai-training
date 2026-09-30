/** The Markdown alternate head hint (spec S12 "Head hints") and `llms.txt` (S12 "`llms.txt`"): both resolve on the served site. */
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

test("a page's describedby link leads to llms.txt, whose lesson link leads to the lesson text", async ({
	page,
	request,
}) => {
	const lesson = liveLessons()[0] as string;
	await page.goto(`${lesson}/`);
	const link = page.locator('head link[rel="describedby"]');
	await expect(link).toHaveCount(1);
	const index = new URL((await link.getAttribute('href')) as string);
	expect(index.pathname).toBe('/ai-training/llms.txt');
	const res = await request.get('llms.txt');
	expect(res.status()).toBe(200);
	const text = await res.text();
	// An agent follows the lesson's link from the index to its alternate.
	const alternate = new URL(`${lesson}/index.md`, index);
	expect(text).toContain(`](${alternate.href}): `);
	const md = await request.get(alternate.pathname.replace(/^\/ai-training\//, ''));
	expect(md.status()).toBe(200);
	const body = await md.text();
	expect(body.startsWith('# ')).toBe(true);
	// The page frame is HTML; the alternate has none of it.
	expect(body).not.toMatch(/<!doctype html|<html/i);
});
