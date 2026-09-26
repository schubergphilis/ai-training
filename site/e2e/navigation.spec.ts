/** Footer, sidebar, the lesson menu and the generated reference pages. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attrsOf, jsxElements, parseMdx } from '../src/lib/checkpoint-tags';
import { expect, lessonCheckpoints, liveLessons, test } from './fixtures';

const SITE = fileURLToPath(new URL('..', import.meta.url));

/**
 * The first live lesson, in area and course order, whose page has a graded
 * checkpoint and an ungraded example (a `<Predict>` without an `objective`),
 * so its menu shows both groups. Read from the data tree and the MDX source
 * (issue #242), so a new lesson changes nothing here. The first match is
 * enough: every lesson page uses the same layout and menu script, whatever
 * its area, so the tests below don't depend on which lesson comes first.
 */
function lessonWithCheckpointsAndExamples(): string {
	for (const id of liveLessons()) {
		if (lessonCheckpoints(id).length === 0) continue;
		const src = readFileSync(join(SITE, 'src/content/docs', `${id}.mdx`), 'utf8');
		const examples = jsxElements(parseMdx(src)).filter(
			(node) => node.name === 'Predict' && !attrsOf(node, id).has('objective'),
		);
		if (examples.length > 0) return id;
	}
	throw new Error('no live lesson has both a graded checkpoint and an ungraded example');
}

/** The last live lesson of the concepts course, read from the data tree so a new lesson changes nothing here. */
function lastLiveConceptsLesson(): string {
	const last = liveLessons()
		.filter((id) => id.startsWith('concepts/'))
		.at(-1);
	if (!last) throw new Error('no live concepts lesson');
	return last;
}

test('the last lesson of a course links to the next course, and the footer carries the AI notice', async ({ page }) => {
	await page.goto(`${lastLiveConceptsLesson()}/`);
	await expect(page.locator('.site-footer a[rel=next]')).toHaveAttribute('href', '/ai-training/safety/');
	await expect(page.locator('.ai-notice')).toHaveText('Content co-authored by AI.');
});

/**
 * The first live lesson whose plan file sets `review-by`, read from the data
 * tree so a new lesson changes nothing here. Its page shows the review line
 * in the footer, then "Last updated" (issue #339).
 */
function lessonWithReviewBy(): string {
	for (const id of liveLessons()) {
		const [area, lesson] = id.split('/');
		if (!area || !lesson) throw new Error(`lesson id without an area: ${id}`);
		const plan = readFileSync(join(SITE, 'src/data/areas', area, 'lessons', `${lesson}.yaml`), 'utf8');
		if (/^review-by:/m.test(plan)) return id;
	}
	throw new Error('no live lesson sets review-by');
}

test('a lesson with review-by shows the review line once, in the footer, then "Last updated"', async ({ page }) => {
	await page.goto(`${lessonWithReviewBy()}/`);
	const footerLine = page.locator('.site-footer-meta .lesson-review[data-review-by]');
	await expect(footerLine).toHaveCount(1);
	await expect(footerLine).toContainText('Sources checked on');
	await expect(footerLine).toContainText('Review due by');
	await expect(page.locator('.lesson .lesson-review')).toHaveCount(0);
	await expect(page.locator('.site-footer-meta time')).toHaveCount(1);
	await expect(page.locator('.site-footer-meta .lesson-review ~ * time')).toHaveCount(1);
});

test('a page without review-by shows "Last updated" in the footer and no review line', async ({ page }) => {
	await page.goto('settings/');
	await expect(page.locator('.site-footer-meta time')).toHaveCount(1);
	await expect(page.locator('.lesson-review')).toHaveCount(0);
});

test('a page without headings keeps the right column but drops "On this page"', async ({ page }) => {
	await page.goto('settings/');
	await expect(page.locator('.right-sidebar-container')).toHaveCount(1);
	await expect(page.locator('starlight-toc')).toHaveCount(0);
});

test('topic, competency and glossary pages render', async ({ page }) => {
	await page.goto('topics/concepts/how-models-work/');
	await expect(page.locator('h1')).not.toBeEmpty();
	const competency = 'concepts/explains-models';
	await page.goto(`competencies/${competency}/`);
	expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);
	// The course line links to the course of the competency's area (#514).
	const courseArea = competency.split('/')[0];
	await expect(page.locator('[data-competency-course] a')).toHaveAttribute('href', `/ai-training/${courseArea}/`);
	await page.goto('glossary/');
	await expect(page.locator('h1')).toHaveText('Glossary');
});

test('the landing page points at the first lesson', async ({ page }) => {
	await page.goto('');
	await expect(page.locator('[data-continue]')).toHaveAttribute('href', /\/ai-training\/concepts\//);
});

test('the topic map is the heading of the topic groups, and clicking it opens the map (#228)', async ({ page }) => {
	await page.goto('progress/');
	const heading = page.locator('nav.sidebar li.linked > a[href="/ai-training/map/"]');
	await expect(heading).toHaveCount(1);
	// The heading's group holds the per-area topic groups, closed until the map is open.
	const group = heading.locator('xpath=following-sibling::details[1]');
	const area = group.locator('summary .plain-label').first();
	await expect(area).toHaveText('Concepts');
	await expect(area).toBeHidden();
	await heading.click();
	await expect(page).toHaveURL(/\/ai-training\/map\/$/);
	await expect(
		page.locator('nav.sidebar li.linked > a[href="/ai-training/map/"] + details summary .plain-label').first(),
	).toBeVisible();
});

test('the competency map is the heading of the competency groups, and clicking it opens the map (#514)', async ({
	page,
}) => {
	await page.goto('progress/');
	const heading = page.locator('nav.sidebar li.linked > a[href="/ai-training/competencies/"]');
	await expect(heading).toHaveCount(1);
	// The heading's group holds the per-area competency groups, closed until the map is open.
	const group = heading.locator('xpath=following-sibling::details[1]');
	const area = group.locator('summary .plain-label').first();
	await expect(area).toHaveText('Concepts');
	await expect(area).toBeHidden();
	await heading.click();
	await expect(page).toHaveURL(/\/ai-training\/competencies\/$/);
	await expect(
		page.locator('nav.sidebar li.linked > a[href="/ai-training/competencies/"] + details summary .plain-label').first(),
	).toBeVisible();
	// A competency page opened from the map is the current page in its sidebar group.
	const box = page.locator('.competency-node a.competency-title').first();
	const target = await box.getAttribute('href');
	const current = page.locator(`nav.sidebar a[href="${target}"]`);
	// Its area group is closed on the map page, so the link only shows once its page is open.
	await expect(current).toBeHidden();
	await box.click();
	await expect(page).toHaveURL(new RegExp(`${target}$`));
	await expect(current).toHaveAttribute('aria-current', 'page');
	await expect(current).toBeVisible();
});

test('clicking an open course heading opens the course page with the group still open (#228)', async ({ page }) => {
	// Starlight persists the open state per group on a summary click. The heading is not in the summary, so
	// the state stays as the server rendered it (issue #228 review, finding 1).
	await page.goto('concepts/how-models-work/');
	const heading = page.locator('nav.sidebar li.linked > a[href="/ai-training/concepts/"]');
	const lesson = page.locator('nav.sidebar a[href="/ai-training/concepts/how-models-work/"]');
	await expect(lesson).toBeVisible();
	await heading.click();
	await expect(page).toHaveURL(/\/ai-training\/concepts\/$/);
	await expect(page.locator('nav.sidebar li.linked > a[href="/ai-training/concepts/"]')).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(lesson).toBeVisible();
	// The caret toggles the group without leaving the page.
	await page.locator('nav.sidebar li.linked > a[href="/ai-training/concepts/"] + details > summary').click();
	await expect(lesson).toBeHidden();
	await expect(page).toHaveURL(/\/ai-training\/concepts\/$/);
});

test('a Checkpoints or Examples menu entry scrolls to its section (#220, #291)', async ({ page }) => {
	const lesson = lessonWithCheckpointsAndExamples();
	await page.goto(`${lesson}/`);
	const groups = [
		{ slug: 'checkpoints', marker: 'data-checkpoint' },
		{ slug: 'examples', marker: 'data-example' },
	];
	for (const { slug, marker } of groups) {
		const link = page.locator(`nav.lesson-toc[aria-labelledby="lesson-toc-${slug}"] li a`).first();
		const href = await link.getAttribute('href');
		expect(href, `the first ${slug} entry links to a fragment`).toMatch(/^#.+/);
		const id = (href as string).slice(1);
		// The fragment names a section of the group's kind, off screen before the click so the
		// in-viewport check after it means the click scrolled.
		const section = page.locator(`[id="${id}"]`);
		await expect(section).toHaveAttribute(marker, /.*/);
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect(section).not.toBeInViewport();
		await link.click();
		await expect(page).toHaveURL((url) => url.pathname.endsWith(`/${lesson}/`) && url.hash === `#${id}`);
		await expect(section).toBeInViewport();
	}
});

test('on a phone, a Checkpoints entry of the "On this page" dropdown closes it and scrolls (#287)', async ({
	page,
}) => {
	const lesson = lessonWithCheckpointsAndExamples();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${lesson}/`);
	const details = page.locator('mobile-starlight-toc details');
	const link = details
		.locator('[data-lesson-toc-mobile] [aria-labelledby="lesson-toc-mobile-checkpoints"] li a')
		.first();
	// The client script moves the groups into the panel, so the entry is in the dropdown before it opens.
	await expect(link).toBeAttached();
	await expect(details).toHaveJSProperty('open', false);
	await details.locator('summary').click();
	await expect(details).toHaveJSProperty('open', true);
	const href = await link.getAttribute('href');
	expect(href, 'the first checkpoints entry links to a fragment').toMatch(/^#.+/);
	const id = (href as string).slice(1);
	const section = page.locator(`[id="${id}"]`);
	await expect(section).toHaveAttribute('data-checkpoint', /.*/);
	await expect(section).not.toBeInViewport();
	await link.click();
	await expect(details).toHaveJSProperty('open', false);
	await expect(page).toHaveURL((url) => url.pathname.endsWith(`/${lesson}/`) && url.hash === `#${id}`);
	await expect(section).toBeInViewport();
});
