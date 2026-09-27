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

test('the redactor prints what the page shows for the email, the colleague version and the reply', async ({ page }) => {
	await page.goto('safety/redact-before-you-paste/');
	// A code block's innerText renders a blank line differently from a plain pre, so both sides drop blank lines.
	const lines = (text: string) => text.split('\n').filter((line) => line.trim() !== '');
	// The fence that shows a widget's output, picked by its content; exactly one fence on the page holds it.
	const fence = async (text: string) => {
		const found = page.locator('pre[data-language=text]').filter({ hasText: text });
		await expect(found).toHaveCount(1);
		return lines(await found.innerText());
	};
	const email = page.locator('.redactor[data-action=redact]').filter({ has: page.locator('.rd-map:not(:empty)') });
	const reply = page.locator('.redactor[data-action=restore]');
	for (const [widget, shown] of [
		[email, 'From: Person 1 <[email]>'],
		[reply, 'Dear Renske Adelhof,'],
	] as const) {
		await expect(widget).toHaveCount(1);
		await expect(widget.locator('.rd-output')).toBeHidden();
		await widget.locator('.rd-run').click();
		expect(lines(await widget.locator('.rd-output').innerText())).toEqual(await fence(shown));
	}
	const partial = page.locator('.redactor').filter({ has: page.locator('.rd-watch') });
	await expect(partial).toHaveCount(1);
	await partial.getByRole('button', { name: 'Redact' }).click();
	await expect(partial.locator('.rd-leaks')).toHaveText((await fence('still identifying:')).join('\n'));
	await partial.locator('.rd-map').fill('R. A. => Person 1\nNB-4471-0928 => [account number]\nZwolle => [city]');
	await expect(partial.locator('.rd-leaks')).toBeEmpty();
	await partial.getByRole('button', { name: 'Redact' }).click();
	await expect(partial.locator('.rd-leaks')).toHaveText('still identifying: technician');
});

test('the claim checker prints the report the page shows for the first summary', async ({ page }) => {
	await page.goto('safety/spotting-hallucination/');
	const checker = page.locator('.claim-checker').filter({ has: page.locator('.cc-sources') });
	await expect(checker).toHaveCount(1);
	await expect(checker.locator('.cc-lines')).toBeHidden();
	await checker.getByRole('button', { name: 'Check' }).click();
	const fence = checker.locator('xpath=following::pre[contains(., "claims have no source")][1]');
	expect((await checker.locator('.cc-lines').innerText()).trim()).toBe((await fence.innerText()).trim());
	await expect(checker.locator('.cc-missing')).toHaveCount(4);
});
