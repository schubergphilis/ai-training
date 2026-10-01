/**
 * The Content Security Policy (issue #608, scripts/lib/csp.mjs): every built
 * page carries the policy `<meta>` in its `<head>` and loads without a
 * violation (the fixture fails a test on one), and search, which runs
 * Pagefind's WebAssembly in a worker, still finds pages.
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTIVES } from '../scripts/lib/csp.mjs';
import { expect, test } from './fixtures';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** The path under the base of every built HTML page, from site/dist, so a new page changes nothing here. */
function builtPages(): string[] {
	const pages: string[] = [];
	for (const entry of readdirSync(DIST, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
		const path = relative(DIST, join(entry.parentPath, entry.name)).split(sep).join('/');
		pages.push(path.endsWith('index.html') ? path.slice(0, -'index.html'.length) : path);
	}
	return pages.sort();
}

for (const path of builtPages()) {
	test(`/${path} carries the Content Security Policy and loads without a violation`, async ({ page }) => {
		await page.goto(path);
		const meta = page.locator('head meta[http-equiv="content-security-policy"]');
		await expect(meta).toHaveCount(1);
		const policy = (await meta.getAttribute('content')) ?? '';
		for (const directive of DIRECTIVES) expect(policy).toContain(directive);
		expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
	});
}

/** What the listeners of the search test saw, on `window.searchEvents`. */
type SearchEvents = { enter: number; enterCancelled: number; submits: number; submitsCancelled: number };

test('search finds pages under the policy, and its form submits nothing', async ({ page, errors }) => {
	await page.goto('');
	await page.locator('button[data-open-modal]').click();
	const dialog = page.getByRole('dialog', { name: 'Search' });
	const box = dialog.getByRole('textbox', { name: 'Search' });
	await box.fill('agent');
	await expect(page.locator('.pagefind-ui__result').first()).toBeVisible();
	// Pagefind's form has `action="javascript:void(0);"`, which `form-action 'self'` blocks if a submit goes through.
	// Pagefind cancels the keydown of Enter in the box, so Enter submits nothing, and its submit handler
	// cancels a submit. Listeners on the window run after Pagefind's in the bubble phase and count both.
	await page.evaluate(() => {
		const seen: SearchEvents = { enter: 0, enterCancelled: 0, submits: 0, submitsCancelled: 0 };
		Object.assign(window, { searchEvents: seen });
		window.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			seen.enter += 1;
			if (e.defaultPrevented) seen.enterCancelled += 1;
		});
		window.addEventListener('submit', (e) => {
			seen.submits += 1;
			if (e.defaultPrevented) seen.submitsCancelled += 1;
		});
	});
	const searchEvents = () => page.evaluate(() => (window as unknown as { searchEvents: SearchEvents }).searchEvents);
	await box.press('Enter');
	await expect.poll(searchEvents).toEqual({ enter: 1, enterCancelled: 1, submits: 0, submitsCancelled: 0 });
	// Submit the form directly, as a Pagefind that stopped cancelling Enter would.
	await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
	await expect.poll(searchEvents).toEqual({ enter: 1, enterCancelled: 1, submits: 1, submitsCancelled: 1 });
	expect(errors, 'no violation after Enter or a submit').toEqual([]);
	await expect(page.locator('.pagefind-ui__result').first()).toBeVisible();
});
