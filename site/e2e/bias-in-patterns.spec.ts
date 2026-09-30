/** The ranker widget of safety/bias-in-patterns (site/src/components/widgets/BiasInPatternsRanker.astro). */
import { expect, test } from './fixtures';

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
