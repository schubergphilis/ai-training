/**
 * The About slides (issue #762, `content/docs/about/slides.mdx`): the deck
 * shows one slide at a time, the buttons, the keys and the hash move between
 * slides, an agenda link opens the slide with that heading, and the last
 * slide links back to the site.
 */
import { expect, test } from './fixtures';

test('the slides move with the buttons, the keys and the hash', async ({ page }) => {
	await page.goto('about/slides/');
	const slides = page.locator('[data-slide]');
	const count = await slides.count();
	expect(count).toBeGreaterThanOrEqual(8);
	expect(count).toBeLessThanOrEqual(15);
	const counter = page.locator('[data-slide-counter]');
	await expect(counter).toHaveText(`1 / ${count}`);
	await expect(slides.first()).toBeVisible();
	await expect(slides.nth(1)).toBeHidden();
	// The page header and footer are hidden behind the deck.
	await expect(page.locator('.page')).toBeHidden();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(counter).toHaveText(`2 / ${count}`);
	await expect(page).toHaveURL(/#2$/);
	await page.keyboard.press('ArrowRight');
	await expect(counter).toHaveText(`3 / ${count}`);
	await page.keyboard.press('PageUp');
	await expect(counter).toHaveText(`2 / ${count}`);
	// Each move is a history entry (#2, #3, #2), so the browser's back button goes to the slide before.
	await page.goBack();
	await expect(counter).toHaveText(`3 / ${count}`);

	await page.keyboard.press('End');
	await expect(counter).toHaveText(`${count} / ${count}`);
	await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
	await expect(slides.last().getByRole('link', { name: 'Read the full About page' })).toHaveAttribute(
		'href',
		'/ai-training/about/',
	);

	await page.goto('about/slides/#3');
	await expect(counter).toHaveText(`3 / ${count}`);
});

test('an agenda link opens the slide with that heading', async ({ page }) => {
	await page.goto('about/slides/#2');
	const agenda = page.locator('[data-slide]').nth(1);
	const link = agenda.getByRole('link').first();
	const id = ((await link.getAttribute('href')) ?? '').replace(/^#/, '');
	await link.click();
	const target = page.locator('[data-slide]').filter({ has: page.locator(`[id="${id}"]`) });
	await expect(target).toBeVisible();
	await expect(page.locator('[data-slide]:visible')).toHaveCount(1);
});

test('every slide fits the window of a laptop and of a projector', async ({ page }) => {
	for (const size of [
		{ width: 1280, height: 800 },
		{ width: 1920, height: 1080 },
	]) {
		await page.setViewportSize(size);
		await page.goto('about/slides/#1');
		const count = await page.locator('[data-slide]').count();
		for (let i = 0; i < count; i++) {
			const slide = page.locator('[data-slide]').nth(i);
			if (i > 0) await page.keyboard.press('ArrowRight');
			await expect(slide).toBeVisible();
			const overflow = await slide.evaluate((s) => s.scrollHeight - s.clientHeight);
			expect(overflow, `slide ${i + 1} at ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
		}
	}
});
