/**
 * Shared test setup: every page blocks requests that leave the site under
 * test (web fonts and the like get an empty reply, so no spec waits on the
 * network), and any `pageerror` or console error fails the test. Specs
 * import `test` and `expect` from here instead of `@playwright/test`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { readAreaTree } from '../scripts/lib/area-tree.mjs';
import {
	liveCourseLessonIds,
	liveLessons as liveLessonList,
	liveObjectiveLessonIds,
	liveTopicLessonIds,
	pageAlternates,
	pageCheckpoints,
	pageExamples,
} from '../scripts/lib/live-lessons.mjs';
import { STORAGE_KEY, storageKeyFor, VERSION } from '../src/scripts/progress-model';

export { STORAGE_KEY, storageKeyFor, VERSION };

const SITE = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(SITE, 'src/data');
const CONTENT_DIR = join(SITE, 'src/content/docs');

/**
 * The live lesson ids of the course of `area`, from the data tree and the
 * content directory (issue #242). A spec that expects a percentage or a
 * count computes it from this list, so a new lesson page changes no spec.
 */
export function liveCourseLessons(area: string): string[] {
	return liveCourseLessonIds(DATA_DIR, CONTENT_DIR, area);
}

/** The live lesson ids of every area, in area and course order. */
export function liveLessons(): string[] {
	return liveLessonList(DATA_DIR, CONTENT_DIR).map((l) => l.id);
}

/** The live lesson ids that cover `topic`. */
export function liveTopicLessons(topic: string): string[] {
	return liveTopicLessonIds(DATA_DIR, CONTENT_DIR, topic);
}

/** The live lesson ids that serve `objective` (a full objective id). */
export function liveObjectiveLessons(objective: string): string[] {
	return liveObjectiveLessonIds(DATA_DIR, CONTENT_DIR, objective);
}

/** The objective ids of `competency`, in YAML order, from the data tree. */
export function competencyObjectives(competency: string): string[] {
	const file = readAreaTree(DATA_DIR)
		.areas.flatMap((a) => a.competencies)
		.find((c) => c.data?.id === competency);
	return (file?.data?.objectives ?? []).map((o: { id: string }) => o.id);
}

/**
 * The graded checkpoints a lesson page shows, `{ id, kind, phase }` in page order, read from its MDX source:
 * the `first` ones and the "More practice" ones, without the hidden `review` alternates.
 */
export function lessonCheckpoints(lesson: string): { id: string; kind: string; phase: string }[] {
	return pageCheckpoints(CONTENT_DIR, lesson);
}

/** The ids of a lesson page's hidden `review` alternates, in page order, read from its MDX source. */
export function lessonAlternates(lesson: string): string[] {
	return pageAlternates(CONTENT_DIR, lesson);
}

/**
 * The ungraded examples a lesson page shows, `{ id, run }` in page order, read from its MDX source: every
 * `<Predict>` without an `objective`, with the fixture CI verifies it from.
 */
export function lessonExamples(lesson: string): { id: string; run: string | undefined }[] {
	return pageExamples(CONTENT_DIR, lesson);
}

/** A partial progress record to seed before the first navigation. */
export interface Seed {
	comfort?: 'less' | 'more';
	lessons?: Record<string, { state: 'read' | 'finished' | 'skipped'; at: string }>;
	checkpoints?: Record<string, { state: 'passed' | 'skipped' | 'attempted'; attempts: number }>;
	reviews?: Record<
		string,
		{
			stage: number | 'done';
			due: string;
			last: null | 'pass' | 'fail';
			history: { at: string; result: 'pass' | 'fail'; served?: string }[];
			revision?: number;
		}
	>;
	habits?: Record<
		string,
		{ since: string; next: string | null; history: { at: string; result: 'done' | 'skipped' }[] }
	>;
}

export const test = base.extend<{
	errors: string[];
	seed: (seed: Seed) => Promise<void>;
	seedRaw: (version: number, record: object) => Promise<void>;
}>({
	// `auto: true` runs this for every test, so no spec has to ask for it.
	errors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			await page.route('**/*', (route) => {
				const url = route.request().url();
				if (url.startsWith('http://localhost:')) return route.continue();
				return route.fulfill({ status: 204, body: '' });
			});
			page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
			page.on('console', (m) => {
				if (m.type() === 'error') errors.push(`console: ${m.text()}`);
			});
			await use(errors);
			expect(errors, 'no page or console errors').toEqual([]);
		},
		{ auto: true },
	],
	/** Store a record as it is, under the key for `version`, for tests of the migration path. */
	seedRaw: async ({ page }, use) => {
		await use(async (version, record) => {
			await page.addInitScript(
				([key, value]) => {
					if (!localStorage.getItem(key)) localStorage.setItem(key, value);
				},
				[storageKeyFor(version), JSON.stringify(record)] as const,
			);
		});
	},
	seed: async ({ seedRaw }, use) => {
		await use(async (seed) => {
			await seedRaw(VERSION, {
				version: VERSION,
				goals: [],
				lessons: {},
				checkpoints: {},
				reviews: {},
				practice: {},
				quizzes: {},
				habits: {},
				...seed,
			});
		});
	},
});

export { expect };

/** The stored progress record as the page sees it, under this version's key unless another is given. */
export async function storedRecord(page: Page, key = STORAGE_KEY): Promise<Record<string, Record<string, unknown>>> {
	return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), key);
}

/** Move each row of an `order` checkpoint up with its button until the rows are in `data-pos` order. */
export async function orderByButtons(cp: Locator) {
	const items = cp.locator('ol li');
	const count = await items.count();
	for (let pos = 1; pos <= count; pos++) {
		for (let k = 0; k < count; k++) {
			const idx = await items.evaluateAll(
				(lis, p) => lis.findIndex((l) => Number((l as HTMLElement).dataset.pos) === p),
				pos,
			);
			if (idx > pos - 1) await items.nth(idx).locator('button[data-move=up]').click();
		}
	}
}

/**
 * Pass every checkpoint of the page that is not passed yet, each on its first
 * try, in page order, with `solveCheckpoint`. A kind it has no solver for
 * throws, so a lesson that gains one says so instead of failing on a later
 * assertion.
 */
export async function passRemaining(page: Page) {
	// Wait for hydration: a checkpoint has no `data-state` until the script binds it, and a seeded pass
	// would look open before that.
	await expect(page.locator('[data-checkpoint]:not([data-state])')).toHaveCount(0);
	// Ids first: a locator over the unpassed checkpoints would shift as each one passes. A skills-check
	// clone keeps `data-checkpoint` but has no id, so those are left out.
	const ids = (
		await page.locator('[data-checkpoint]:not([data-state="passed"])').evaluateAll((els) => els.map((el) => el.id))
	).filter((id) => id !== '');
	for (const id of ids) await passCheckpoint(page, id);
}

/**
 * Pass the checkpoint `id` of the page on its first try, with the solver for its kind (see `passRemaining`).
 * Another kind throws.
 */
export async function passCheckpoint(page: Page, id: string) {
	const cp = page.locator(`[data-checkpoint][id="${id}"]`);
	await solveCheckpoint(cp);
	await expect(cp).toHaveAttribute('data-state', 'passed');
}

/**
 * Answer the checkpoint `cp` correctly by its `data-kind` and press Check, once the script has bound it. A
 * `predict` gets the answer the page carries in `data-answer`, a `choice` or `scenario` its correct option, and
 * an `order` is sorted with the buttons. Another kind throws. It takes a locator, so it also solves the item the
 * review page serves, which has no id of its own.
 */
export async function solveCheckpoint(cp: Locator) {
	// Hydrated: the script sets `data-state` when it binds the checkpoint.
	await expect(cp).toHaveAttribute('data-state', /./);
	const kind = await cp.getAttribute('data-kind');
	const name = (await cp.getAttribute('data-progress-id')) ?? (await cp.getAttribute('id'));
	if (kind === 'predict') {
		const answer = await cp.locator('.cp-predict').getAttribute('data-answer');
		if (answer === null) throw new Error(`solveCheckpoint: predict ${name} has no data-answer to type`);
		await cp.locator('textarea').fill(answer);
	} else if (kind === 'choice' || kind === 'scenario') {
		await cp.locator('label[data-correct]').click();
	} else if (kind === 'order') {
		await orderByButtons(cp);
	} else {
		throw new Error(`solveCheckpoint: no solver for the ${kind} checkpoint ${name}`);
	}
	await cp.locator('.cp-check').click();
}

/**
 * A native drag with the mouse. `Locator.dragTo` moves the pointer once, and
 * Chromium then sometimes skips the `drop`, so this moves in steps and nudges
 * once more over the target. `targetY` is the fraction of the target's height
 * to point at: 0.5 is its middle, near 0 its top edge.
 */
/**
 * Solve an `order` checkpoint by dragging alone: each row goes onto the top
 * tenth of the row at its target slot, so it lands before that row. Rows
 * already in place are skipped.
 */
export async function orderByDrag(page: Page, items: Locator) {
	const count = await items.count();
	for (let pos = 1; pos <= count; pos++) {
		const idx = await items.evaluateAll(
			(lis, p) => lis.findIndex((l) => Number((l as HTMLElement).dataset.pos) === p),
			pos,
		);
		if (idx === pos - 1) continue;
		await drag(page, items.nth(idx), items.nth(pos - 1), 0.1);
	}
}

export async function drag(page: Page, source: Locator, target: Locator, targetY = 0.5) {
	// Both must be on screen at once: `page.mouse` works in viewport coordinates and a scroll mid-drag
	// changes which element Chromium picks up. The sort test sets a tall viewport for this reason.
	await target.scrollIntoViewIfNeeded();
	await source.scrollIntoViewIfNeeded();
	const s = await source.boundingBox();
	const t = await target.boundingBox();
	if (!s || !t) throw new Error('drag: source or target has no box');
	const view = page.viewportSize();
	if (!view || s.y < 0 || t.y < 0 || s.y + s.height > view.height || t.y + t.height > view.height) {
		throw new Error('drag: source and target do not fit the viewport together');
	}
	await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
	await page.mouse.down();
	await page.mouse.move(t.x + t.width / 2, t.y + t.height * targetY, { steps: 5 });
	await page.mouse.move(t.x + t.width / 2 + 1, t.y + t.height * targetY, { steps: 2 });
	await page.mouse.up();
}
