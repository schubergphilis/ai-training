/** Interactive widgets embedded in lessons (site/src/components/widgets). */
import { expect, test } from './fixtures';

test('the sampler redraws its bars when the temperature changes', async ({ page }) => {
	await page.goto('concepts/how-models-work/');
	const sampler = page.locator('[data-sampler]');
	await sampler.locator('input[type=range]').fill('0.1');
	await expect(sampler.locator('.bar').first()).toHaveCSS('display', 'grid');
	await expect(sampler.locator('.bar span:last-child').first()).not.toBeEmpty();
});

test('the token counter prints the two reports the page shows for the sample', async ({ page }) => {
	await page.goto('concepts/context-window/');
	const counter = page.locator('[data-token-counter]');
	await expect(counter).toHaveCount(1);
	await counter.getByRole('button', { name: 'Count' }).click();
	const countsFence = page.locator('pre').filter({ hasText: 'tokens (estimate):' });
	const pagesFence = page.locator('pre').filter({ hasText: 'one page:' });
	await expect(countsFence).toHaveCount(1);
	await expect(pagesFence).toHaveCount(1);
	const counts = (await countsFence.innerText()).trim();
	const pages = (await pagesFence.innerText()).trim();
	expect((await counter.locator('.tc-counts li').allInnerTexts()).join('\n')).toBe(counts);
	expect((await counter.locator('.tc-pages li').allInnerTexts()).join('\n')).toBe(pages);
	await counter.locator('textarea').fill('Hello, world!');
	await expect(counter.locator('.tc-counts li')).toHaveCount(0);
	await counter.getByRole('button', { name: 'Count' }).click();
	await expect(counter.locator('.tc-counts li').last()).toHaveText('tokens (estimate): 4');
});

test('the repeated runs widget prints the summary the page shows at temperature 0', async ({ page }) => {
	await page.goto('concepts/same-prompt-twice/');
	const widget = page.locator('[data-repeated-runs]');
	await expect(widget).toHaveCount(1);
	await widget.locator('input[type=range]').fill('0');
	await expect(widget.locator('output')).toHaveText('0.0');
	await widget.getByRole('button', { name: 'Run 10 times' }).click();
	await expect(widget.locator('.rr-lines li')).toHaveCount(10);
	const fenceLocator = page.locator('pre').filter({ hasText: '10 of 10 runs give the same answer' });
	await expect(fenceLocator).toHaveCount(1);
	const fence = (await fenceLocator.innerText()).trim();
	await expect(widget.locator('.rr-summary li')).toHaveText([fence]);
	await widget.getByLabel('Check each answer').check();
	await expect(widget.locator('.rr-lines li')).toHaveCount(0);
	await widget.getByRole('button', { name: 'Run 10 times' }).click();
	await expect(widget.locator('.rr-summary li')).toHaveText([
		'10 of 10 runs give the same answer as run 1',
		'10 of 10 runs pass the check: the answer names Canberra',
	]);
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

test('the line comparer prints the report the page shows after each sample, and compares pasted code', async ({
	page,
}) => {
	await page.goto('safety/saying-ai-helped/');
	const widgets = page.locator('.line-compare');
	await expect(widgets).toHaveCount(2);
	for (let i = 0; i < 2; i++) {
		const widget = widgets.nth(i);
		await expect(widget.locator('.lc-lines')).toBeHidden();
		await widget.getByRole('button', { name: 'Compare' }).click();
		const fence = widget.locator('xpath=following::pre[contains(., "lines also appear in")][1]');
		expect((await widget.locator('.lc-lines').innerText()).trim()).toBe((await fence.innerText()).trim());
	}
	const first = widgets.first();
	await first.locator('textarea').fill('words = text.split()\nprint(words)');
	await expect(first.locator('.lc-lines')).toBeHidden();
	await first.getByRole('button', { name: 'Compare' }).click();
	await expect(first.locator('.lc-lines')).toHaveText(
		'1 of 2 lines also appear in truncate.py\nlines not in truncate.py:\n  print(words)',
	);
});

// The ranker of safety/bias-in-patterns (BiasInPatternsRanker.astro).
test('the bias-in-patterns ranker prints the rankings the page shows, and equal totals with no bonus', async ({
	page,
}) => {
	await page.goto('safety/bias-in-patterns/');
	const widget = page.locator('[data-bias-in-patterns-ranker]');
	await expect(widget).toHaveCount(1);
	await expect(widget.locator('output')).toHaveText('2');
	await widget.getByRole('button', { name: 'Rank both runs' }).click();
	// A code block's innerText renders a blank line differently from a plain pre, so both sides drop blank lines.
	const lines = (text: string) => text.split('\n').filter((line) => line.trim() !== '');
	const fence = page.locator('pre[data-language=text]').filter({ hasText: 'shortlisted over both runs:' });
	await expect(fence).toHaveCount(1);
	const shown = [
		...lines(await widget.locator('.bp-runs').innerText()),
		await widget.locator('.bp-totals').innerText(),
	];
	expect(shown).toEqual(lines(await fence.innerText()));
	await widget.locator('input[type=range]').fill('0');
	await expect(widget.locator('.bp-totals')).toBeEmpty();
	await widget.getByRole('button', { name: 'Rank both runs' }).click();
	await expect(widget.locator('.bp-totals')).toHaveText('shortlisted over both runs: list A 6, list B 6');
});
