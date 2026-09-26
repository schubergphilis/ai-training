/** Interactive widgets embedded in lessons (site/src/components/widgets). */
import { expect, test } from './fixtures';

test('the sampler redraws its bars when the temperature changes', async ({ page }) => {
	await page.goto('concepts/how-models-work/');
	const sampler = page.locator('[data-sampler]');
	await sampler.locator('input[type=range]').fill('0.1');
	await expect(sampler.locator('.bar').first()).toHaveCSS('display', 'grid');
	await expect(sampler.locator('.bar span:last-child').first()).not.toBeEmpty();
});

test('the instructions builder produces a file', async ({ page }) => {
	await page.goto('customizing-agents/instructions/');
	const builder = page.locator('.instructions-builder');
	await expect(builder).toHaveCount(1);
	await expect(builder.locator('pre')).not.toBeEmpty();
});

test('the format checker prints the report the page shows after each sample', async ({ page }) => {
	await page.goto('concepts/structured-output/');
	const samples = page.locator('.format-checker').filter({ has: page.locator('textarea:not(:empty)') });
	const count = await samples.count();
	expect(count).toBeGreaterThan(0);
	for (let i = 0; i < count; i++) {
		const checker = samples.nth(i);
		await checker.getByRole('button', { name: 'Check' }).click();
		const fence = (await checker.locator('xpath=following::pre[1]').innerText()).trim();
		const report = [...(await checker.locator('.fc-lines li').allInnerTexts())];
		const summary = await checker.locator('.fc-summary').innerText();
		expect([...report, summary].join('\n')).toBe(fence);
	}
});

test('the format checker checks a pasted answer', async ({ page }) => {
	await page.goto('concepts/structured-output/');
	const checker = page.locator('.exercise .format-checker');
	await expect(checker).toHaveCount(1);
	await checker
		.locator('textarea')
		.fill(
			'owner: Jonas | task: fix the reset email | due: 2026-10-03 | priority: high\nowner: Sam | task: get quotes | due: 17 October | priority: low',
		);
	await checker.getByRole('button', { name: 'Check' }).click();
	await expect(checker.locator('.fc-lines li')).toHaveText([
		'ok 1: Jonas, fix the reset email, 2026-10-03, high',
		'FAIL 2: due "17 October" is not a date written as YYYY-MM-DD',
	]);
	await expect(checker.locator('.fc-lines li').last()).toHaveClass('fc-fail');
	await expect(checker.locator('.fc-summary')).toHaveText('1 of 2 items pass');
});
