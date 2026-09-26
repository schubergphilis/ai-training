/** Finishing a lesson, and where that progress shows up and persists (spec S04). */
import { progressPercent } from '../src/scripts/overview';
import { emptyRecord } from '../src/scripts/progress-model';
import {
	competencyObjectives,
	expect,
	lessonCheckpoints,
	liveCourseLessons,
	liveObjectiveLessons,
	liveTopicLessons,
	passCheckpoint,
	storageKeyFor,
	storedRecord,
	test,
} from './fixtures';

// The site compares due dates against the local calendar day (progress-model.ts `today()`), so the
// seed is built the same way. `toISOString()` is UTC, which is already tomorrow in the evening west of UTC.
const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const LESSON = 'concepts/how-models-work';
// The `first` checkpoints of the lesson, which finishing needs and schedules for review (spec S04, S05). The seed
// and the counts below come from the page source, so a new checkpoint in the lesson changes no spec.
const FIRST = lessonCheckpoints(LESSON)
	.filter((c) => c.phase === 'first')
	.map((c) => c.id);
const finished = {
	lessons: { [LESSON]: { state: 'finished' as const, at: TODAY } },
	checkpoints: Object.fromEntries(FIRST.map((id) => [`${LESSON}#${id}`, { state: 'passed' as const, attempts: 1 }])),
	reviews: Object.fromEntries(
		FIRST.map((id) => [`${LESSON}#${id}`, { stage: 1, due: TODAY, last: null, history: [], revision: 1 }]),
	),
};

test('finish is enabled once every checkpoint is passed, and persists across a reload', async ({ page }) => {
	await page.goto(`${LESSON}/`);
	const finish = page.locator('[data-finish]');
	expect(FIRST.length).toBeGreaterThan(0);
	for (const id of FIRST) {
		await expect(finish).toBeDisabled();
		await passCheckpoint(page, id);
	}
	await expect(finish).toBeEnabled();
	await finish.click();
	await expect(finish).toHaveText(/^Finished ✓ \(\d{4}-\d{2}-\d{2}\)$/);
	await page.reload();
	await expect(finish).toHaveText(/^Finished ✓/);
	await expect(finish).toBeDisabled();
	const record = await storedRecord(page);
	expect(Object.keys(record.reviews ?? {}).sort()).toEqual(FIRST.map((id) => `${LESSON}#${id}`).sort());
});

test('the finish note counts the open checkpoints', async ({ page }) => {
	await page.goto('building-agents/agent-loop/');
	// Only the `first` checkpoints are needed to finish (spec S04 "Lesson states").
	// The lesson has more than one, so the note uses the plural.
	const open = lessonCheckpoints('building-agents/agent-loop').filter((c) => c.phase === 'first').length;
	expect(open).toBeGreaterThan(1);
	await expect(page.locator('[data-finish-note]')).toHaveText(
		`Pass or skip ${open} more checkpoints to finish this lesson.`,
	);
	await expect(page.locator('.recap-sources')).toHaveCount(0);
	await expect(page.locator('.recap-next')).toHaveCount(0);
});

test('the course page shows the finished node, the ring and the review card', async ({ page, seed }) => {
	await seed(finished);
	await page.goto('concepts/');
	// `a[data-node]`: a coming (planned) lesson renders as `span[data-node]` and has no progress state.
	await expect(page.locator('a[data-node="concepts/how-models-work"]')).toHaveAttribute('data-state', 'finished');
	// The seed finishes one of the live Concepts lessons, and the ring shows the same formula the page uses
	// (overview.ts `progressPercent`) over the lessons that have a page.
	const live = liveCourseLessons('concepts');
	expect(live).toContain(LESSON);
	const { percent } = progressPercent(live, { ...emptyRecord(), ...finished });
	await expect(page.locator('[data-ring-label]')).toHaveText(`${percent}%`);
	// Every seeded review is due today, and there is more than one, so the card uses the plural.
	expect(FIRST.length).toBeGreaterThan(1);
	await expect(page.locator('[data-review-card]')).toHaveText(`Review due: ${FIRST.length} items`);
});

test('nothing due shows a linked review card', async ({ page }) => {
	await page.goto('concepts/');
	await expect(page.locator('[data-review-card]')).toHaveText('Review: nothing due yet');
	await expect(page.locator('[data-review-card] a')).toHaveAttribute('href', '/ai-training/concepts/review/');
});

test('the topic map colors covered topics by lesson state', async ({ page, seed }) => {
	await seed(finished);
	await page.goto('map/');
	expect(await page.locator('.topic-node').count()).toBeGreaterThan(0);
	// The seed finishes one lesson of the topic. With another live lesson in the topic the map colors it
	// `in-progress`, and were it the only one, `finished` (TopicMap.astro). A topic without a lesson in the seed
	// stays `untouched`.
	const topicLessons = liveTopicLessons('concepts/how-models-work');
	expect(topicLessons).toContain(LESSON);
	await expect(page.locator('.topic-node[data-topic="concepts/how-models-work"]')).toHaveAttribute(
		'data-state',
		topicLessons.length > 1 ? 'in-progress' : 'finished',
	);
	await expect(page.locator('.topic-node[data-topic="concepts/prompting"]')).toHaveAttribute('data-state', 'untouched');
});

test('the competency map colors the objectives a finished lesson serves and their competency', async ({
	page,
	seed,
}) => {
	await seed(finished);
	await page.goto('competencies/');
	// The same rule as the topic map (topicState): finished once every serving lesson is finished, in progress
	// once any has an entry. The seed finishes only LESSON, so the expected states come from the data tree.
	const COMPETENCY = 'concepts/explains-models';
	const objectives = competencyObjectives(COMPETENCY).map((id) => ({ id, lessons: liveObjectiveLessons(id) }));
	const served = objectives.filter((o) => o.lessons.includes(LESSON));
	expect(served.length).toBeGreaterThan(0);
	const stateOf = (lessons: string[]) =>
		lessons.every((l) => l === LESSON) ? 'finished' : lessons.includes(LESSON) ? 'in-progress' : 'untouched';
	for (const o of objectives)
		await expect(page.locator(`.competency-objective[data-objective="${o.id}"]`)).toHaveAttribute(
			'data-state',
			stateOf(o.lessons),
		);
	const all = [...new Set(objectives.flatMap((o) => o.lessons))];
	await expect(page.locator(`.competency-node[data-competency="${COMPETENCY}"]`)).toHaveAttribute(
		'data-state',
		stateOf(all),
	);
	// A competency of another area that the lesson doesn't serve stays untouched.
	await expect(page.locator('.competency-node[data-competency="building-agents/builds-agent-loop"]')).toHaveAttribute(
		'data-state',
		'untouched',
	);
});

test('the progress page exports, resets and imports the record', async ({ page, seed, seedRaw }) => {
	await seed(finished);
	// A leftover version 1 record: reset must remove it too, or the next load would migrate it back.
	await seedRaw(1, { version: 1, lessons: { [LESSON]: { state: 'read', at: TODAY } } });
	await page.goto('progress/');
	expect(await page.locator('.progress-course').count()).toBeGreaterThan(0);
	expect(await page.locator('.progress-lesson').count()).toBeGreaterThan(0);
	expect(FIRST.length).toBeGreaterThan(1);
	await expect(page.locator('[data-progress-review=concepts]')).toHaveText(`Review due: ${FIRST.length} items`);
	const before = await page.locator('[data-dump]').textContent();

	const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export]').click()]);
	const file = await download.path();

	page.once('dialog', (d) => d.accept());
	await page.locator('[data-reset]').click();
	await expect(page.locator('[data-message]')).toHaveText('Progress reset.');
	expect(JSON.parse((await page.locator('[data-dump]').textContent()) ?? '{}').lessons).toEqual({});
	// Both keys are gone. (No reload here: the seed init script would write them again on the next navigation.)
	expect(await storedRecord(page, storageKeyFor(1))).toEqual({});
	expect(await storedRecord(page)).toEqual({});

	page.once('dialog', (d) => d.accept());
	await page.locator('[data-import]').setInputFiles(file);
	await expect(page.locator('[data-message]')).toHaveText('Imported.');
	await expect(page.locator('[data-dump]')).toHaveText(before ?? '');
});
