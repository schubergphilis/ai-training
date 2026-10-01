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

test('search finds pages under the policy, and Enter in the box breaks nothing', async ({ page, errors }) => {
	await page.goto('');
	await page.locator('button[data-open-modal]').click();
	const box = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox', { name: 'Search' });
	await box.fill('agent');
	await expect(page.locator('.pagefind-ui__result').first()).toBeVisible();
	// Pagefind's form has `action="javascript:void(0);"`, which `script-src` would block if the submit went through.
	await box.press('Enter');
	// A violation event is queued as a task, so give it time to arrive before the check.
	await page.waitForTimeout(500);
	expect(errors, 'no violation after Enter').toEqual([]);
	await expect(page.locator('.pagefind-ui__result').first()).toBeVisible();
});
