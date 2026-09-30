/** Routing cards driven by the comfort level and by checkpoint results (spec S02 "Differentiation by routing"). */
import { expect, liveCourseLessons, passRemaining, test } from './fixtures';

test('the comfort level is set on the settings page, not on a lesson', async ({ page }) => {
	await page.goto('settings/');
	const less = page.locator('[data-comfort=less]');
	await expect(less).toHaveCount(1);
	await less.click();
	await expect(less).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('[data-comfort-note]')).toHaveText('Set: less comfortable.');
	await less.click();
	await expect(less).toHaveAttribute('aria-pressed', 'false');
	await page.goto('building-agents/agent-loop/');
	await expect(page.locator('[data-comfort]')).toHaveCount(0);
});

test('comfort less shows the behind card on an engineering lesson', async ({ page, seed }) => {
	await seed({ comfort: 'less' });
	await page.goto('building-agents/agent-loop/');
	await expect(page.locator('[data-route=behind]')).toBeVisible();
	await expect(page.locator('[data-route=ahead]')).toBeHidden();
});

test('comfort more shows the ahead card', async ({ page, seed }) => {
	await seed({ comfort: 'more' });
	await page.goto('building-agents/agent-loop/');
	await expect(page.locator('[data-route=ahead]')).toBeVisible();
	await expect(page.locator('[data-route=behind]')).toBeHidden();
});

test('without a comfort level both cards stay hidden until a checkpoint result', async ({ page }) => {
	await page.goto('building-agents/agent-loop/');
	await expect(page.locator('[data-route=behind]')).toBeHidden();
	await expect(page.locator('[data-route=ahead]')).toBeHidden();
	// A miss surfaces the assumed objectives.
	const cp = page.locator('#predict-tool-call');
	await cp.locator('textarea').fill('wrong');
	await cp.locator('.cp-check').click();
	await expect(page.locator('[data-route=behind]')).toBeVisible();
	await expect(page.locator('[data-route=ahead]')).toBeHidden();
});

test('a lesson where every checkpoint passes first time shows the ahead card', async ({ page }) => {
	await page.goto('building-agents/agent-loop/');
	const first = page.locator('#predict-tool-call');
	await first.locator('textarea').fill('27°C, sun');
	await first.locator('.cp-check').click();
	await expect(first).toHaveAttribute('data-state', 'passed');
	await passRemaining(page);
	await expect(page.locator('[data-route=ahead]')).toBeVisible();
	await expect(page.locator('[data-finish]')).toBeEnabled();
});

test('a retry on one checkpoint keeps the ahead card hidden even when all pass', async ({ page }) => {
	await page.goto('building-agents/agent-loop/');
	const first = page.locator('#predict-tool-call');
	await first.locator('textarea').fill('27°C, rain');
	await first.locator('.cp-check').click();
	await expect(first).toHaveAttribute('data-state', 'attempted');
	await first.locator('textarea').fill('27°C, sun');
	await first.locator('.cp-check').click();
	await expect(first).toHaveAttribute('data-state', 'passed');
	await passRemaining(page);
	await expect(page.locator('[data-finish]')).toBeEnabled();
	await expect(page.locator('[data-route=ahead]')).toBeHidden();
	await expect(page.locator('[data-route=behind]')).toBeHidden();
});

test('the "Open in tutor" block is on a lesson page and not on a course page', async ({ page }) => {
	const lesson = liveCourseLessons('building-agents')[0];
	await page.goto(`${lesson}/`);
	const block = page.locator('[data-tutor-block]');
	await expect(block).toHaveCount(1);
	await expect(block.locator('pre code').nth(1)).toHaveText(
		`/ai-tutor https://schubergphilis.github.io/ai-training/${lesson}/`,
	);
	await page.goto('building-agents/');
	await expect(page.locator('[data-tutor-block]')).toHaveCount(0);
});
