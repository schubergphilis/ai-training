/**
 * Renders the checkpoint components to HTML with Astro's Container API and
 * checks the markup `scripts/checkpoints.ts` binds to. The lesson id comes
 * from Starlight's route locals, so each render passes a fake route.
 */
import Choice from '@components/lesson/Choice.astro';
import Match from '@components/lesson/Match.astro';
import MorePractice from '@components/lesson/MorePractice.astro';
import MultiChoice from '@components/lesson/MultiChoice.astro';
import Order from '@components/lesson/Order.astro';
import Predict from '@components/lesson/Predict.astro';
import Repair from '@components/lesson/Repair.astro';
import Scenario from '@components/lesson/Scenario.astro';
import Sort from '@components/lesson/Sort.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// The shell checks `concepts` against the topics collection, which the fixtures in tests/lib/content.ts supply.
// One extra lesson file lists `proofs`, so the Predict notice test doesn't depend on which real lessons have them.
vi.mock('astro:content', async () => {
	const content = await import('../lib/content');
	const proved: (typeof content.lessonPlans)[number] = {
		id: 'safety/lessons/proved',
		data: {
			id: 'safety/proved',
			title: 'Proved',
			mode: 'tutorial',
			covers: 'safety/risk',
			serves: [],
			introduces: [],
			assumes: [],
			'extends-to': [],
			after: [],
			shorts: [],
			exercise: { kind: 'judge', brief: 'Judge it.' },
			sources: [],
			minutes: 15,
			proofs: ['safety/proved/show.py'],
		},
	};
	return content.mockContent({ lessonPlans: [...content.lessonPlans, proved] });
});

// Only `entry.id` is read (lib/lesson-context.ts); the rest of Starlight's route data is not needed here.
const routeTo = (id: string) => ({ starlightRoute: { entry: { id } } }) as unknown as App.Locals;
const locals = routeTo('concepts/how-models-work');
const base = { id: 'cp', objective: 'o1', title: 'Title', hint: 'A hint', concepts: ['token'] };

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

async function render(
	// biome-ignore lint/suspicious/noExplicitAny: the Container API takes any Astro component
	component: any,
	props: Record<string, unknown>,
	slots?: Record<string, string>,
	on: App.Locals = locals,
) {
	return container.renderToString(component, { props, locals: on, ...(slots ? { slots } : {}) });
}

describe('phase (spec S03 "Checkpoints")', () => {
	const options = [{ text: 'a', correct: true }, { text: 'b' }];
	it('first is the default: data-checkpoint, data-phase and a Skip button, not hidden', async () => {
		const html = await render(Choice, { ...base, options });
		expect(html).toMatch(/<section class="checkpoint not-content" id="cp" data-checkpoint(="")? data-phase="first"/);
		expect(html).toContain('class="cp-skip"');
		expect(html).not.toContain('data-alternate');
		expect(html).not.toMatch(/<section[^>]* hidden/);
	});
	it('a review alternate is hidden and marked data-alternate instead of data-checkpoint', async () => {
		const html = await render(MultiChoice, {
			...base,
			phase: 'review',
			options: [...options, { text: 'c', correct: true }],
		});
		expect(html).toMatch(
			/<section class="checkpoint not-content" id="cp" hidden data-alternate(="")? data-phase="review"/,
		);
		expect(html).not.toContain('data-checkpoint');
		expect(html).toContain('data-progress-id="concepts/how-models-work#cp"');
		expect(html).toContain('data-reviewable="true"');
	});
	it('a practice checkpoint is shown, never reviewable, and has no Skip button', async () => {
		const html = await render(Choice, { ...base, phase: 'practice', options });
		expect(html).toMatch(/data-checkpoint(="")? data-phase="practice"/);
		expect(html).toContain('data-reviewable="false"');
		expect(html).not.toContain('cp-skip');
		expect(html).toContain('class="cp-check"');
	});
	it('every kind passes the phase through, and an unknown phase fails the build', async () => {
		const kinds: [unknown, Record<string, unknown>][] = [
			[
				Match,
				{
					options: ['x', 'y'],
					rows: [
						{ statement: 's', option: 0 },
						{ statement: 't', option: 1 },
					],
					rationale: 'r',
				},
			],
			[
				Sort,
				{
					buckets: ['b', 'c'],
					items: [
						{ text: 't', bucket: 0 },
						{ text: 'u', bucket: 1 },
					],
				},
			],
			[Order, { steps: ['one', 'two'] }],
			[Predict, { answer: '1' }],
			[Repair, { broken: 'x', model: 'y' }],
			[
				Scenario,
				{
					options: [
						{ text: 'a', correct: true, consequence: 'c' },
						{ text: 'b', consequence: 'd' },
					],
				},
			],
		];
		for (const [component, props] of kinds) {
			expect(await render(component, { ...base, ...props, phase: 'review' })).toContain('data-phase="review"');
		}
		await expect(render(Choice, { ...base, phase: 'later', options })).rejects.toThrow(
			/Checkpoint "cp": phase must be one of first, review, practice, got "later"/,
		);
	});
	it('More practice is an H2 section around its checkpoints', async () => {
		const html = await render(MorePractice, {}, { default: '<p>inside</p>' });
		expect(html).toMatch(/<section class="more-practice" id="more-practice"><h2>More practice<\/h2>/);
		expect(html).toContain('<p>inside</p>');
	});
});

describe('CheckpointShell (through Choice)', () => {
	it('carries the progress id, kind, reviewability and revision, and the control buttons', async () => {
		const html = await render(Choice, { ...base, revision: 3, options: [{ text: 'a', correct: true }, { text: 'b' }] });
		expect(html).toContain('data-progress-id="concepts/how-models-work#cp"');
		expect(html).toContain('data-kind="choice"');
		expect(html).toContain('data-reviewable="true"');
		expect(html).toContain('data-revision="3"');
		expect(html).toContain('class="checkpoint not-content"');
		for (const cls of ['cp-check', 'cp-hint-btn', 'cp-skip', 'cp-giveup', 'cp-feedback', 'cp-stage-label']) {
			expect(html).toContain(cls);
		}
		expect(html).toContain('href="/ai-training/concepts/how-models-work/#cp"');
	});
	it('renders the title in a heading wrapper with a permalink to the section id and an accessible name', async () => {
		const html = await render(Choice, { ...base, options: [{ text: 'a', correct: true }] });
		expect(html).toMatch(
			/<section\s+class="checkpoint not-content"\s+id="cp"[\s\S]*<div class="sl-heading-wrapper cp-title-wrap"><h3 class="cp-title">Title<\/h3><a class="sl-anchor-link" href="#cp"><span aria-hidden="true" class="sl-anchor-icon"><svg[\s\S]*<\/svg><\/span><span class="sr-only">Section titled “Title”<\/span><\/a><\/div>/,
		);
		expect(html.match(/ id="cp"/g)).toHaveLength(1);
	});
	it('carries the concept ids, and an unknown or empty concepts list fails the build', async () => {
		const options = [{ text: 'a', correct: true }];
		const html = await render(Choice, { ...base, concepts: ['token', 'context-window'], options });
		expect(html).toContain('data-concepts="token context-window"');
		await expect(render(Choice, { ...base, concepts: ['token', 'nope'], options })).rejects.toThrow(
			/concepts\/how-models-work#cp: unknown concept id "nope"/,
		);
		await expect(render(Choice, { ...base, concepts: [], options })).rejects.toThrow(
			/concepts\/how-models-work#cp: concepts needs at least one concept id/,
		);
		await expect(render(Choice, { ...base, concepts: undefined, options })).rejects.toThrow(
			/concepts\/how-models-work#cp: concepts=\{\['concept-id', \.\.\.\]\} is required/,
		);
	});
	it('renders the context paragraph hidden above the stem, and nothing without one', async () => {
		const options = [{ text: 'a', correct: true }];
		const html = await render(
			Choice,
			{ ...base, context: 'The lesson shows a widget.', options },
			{ default: 'Stem.' },
		);
		expect(html).toMatch(/<p class="cp-context" hidden>The lesson shows a widget\.<\/p>\s*<div class="cp-stem">Stem\./);
		expect(await render(Choice, { ...base, options })).not.toContain('cp-context');
	});
	it('review={false} opts out, and a bad revision fails the build', async () => {
		const html = await render(Choice, { ...base, review: false, options: [{ text: 'a', correct: true }] });
		expect(html).toContain('data-reviewable="false"');
		await expect(render(Choice, { ...base, revision: 0, options: [{ text: 'a', correct: true }] })).rejects.toThrow(
			/revision must be a positive integer/,
		);
	});
});

describe('Choice', () => {
	it('marks the correct option and carries why on the others', async () => {
		const html = await render(Choice, {
			...base,
			options: [
				{ text: 'wrong', why: 'Because.' },
				{ text: 'right', correct: true },
			],
		});
		expect(html).toMatch(/<label data-why="Because\."[^>]*>/);
		expect(html).toMatch(/<label data-correct="true"[^>]*>/);
		expect(html).toContain('name="cp-choice"');
	});
	it('needs exactly one correct option', async () => {
		await expect(render(Choice, { ...base, options: [{ text: 'a' }] })).rejects.toThrow(/exactly one correct option/);
		await expect(
			render(Choice, {
				...base,
				options: [
					{ text: 'a', correct: true },
					{ text: 'b', correct: true },
				],
			}),
		).rejects.toThrow(/has 2/);
	});
});

describe('Predict', () => {
	it('graded: hidden answer, CI note when run is set', async () => {
		const html = await render(Predict, { ...base, answer: '27°C, sun', run: 'x/tool.sh' });
		expect(html).toContain('data-answer="27°C, sun"');
		expect(html).toMatch(/<pre class="cp-reveal" hidden>27°C, sun<\/pre>/);
		expect(html).toContain('Output verified in CI from');
		expect(html).toContain('data-reviewable="true"');
	});
	it('graded without run says the output was checked by hand', async () => {
		const html = await render(Predict, { ...base, answer: 'x' });
		expect(html).toContain('not run in CI');
	});
	it('graded without run on a lesson whose file lists proofs shows no notice (#311)', async () => {
		const html = await render(Predict, { ...base, answer: 'x' }, undefined, routeTo('safety/proved'));
		expect(html).toContain('data-answer="x"');
		expect(html).not.toContain('not run in CI');
		expect(html).not.toContain('class="cp-verified"');
	});
	it('ungraded example (no objective): output shown, CI note, and no checkpoint markup', async () => {
		const html = await render(
			Predict,
			{ id: 'run-list', title: 'Show the list', answer: '1. [ ] Buy milk', run: 'x/list.py' },
			{ default: 'Run this.' },
		);
		expect(html).toContain('<section class="example not-content" id="run-list" data-example data-run="x/list.py">');
		expect(html).toMatch(/<pre class="example-output">1\. \[ \] Buy milk<\/pre>/);
		expect(html).toMatch(
			/<div class="sl-heading-wrapper cp-title-wrap"><h3 class="cp-title">Show the list<\/h3><a class="sl-anchor-link" href="#run-list">/,
		);
		expect(html).toContain('<span class="sr-only">Section titled “Show the list”</span>');
		expect(html).toContain('Output verified in CI from');
		expect(html).toContain('Run this.');
		for (const s of [
			'data-checkpoint',
			'data-progress-id',
			'data-reviewable',
			'class="checkpoint',
			'cp-check',
			'textarea',
		]) {
			expect(html).not.toContain(s);
		}
	});
	it('ungraded example needs answer and run, and takes no hint, concepts or context', async () => {
		const example = { id: 'e', title: 'T', answer: '1', run: 'x.py' };
		await expect(render(Predict, { id: 'e', title: 'T', answer: '1' })).rejects.toThrow(/needs answer and run/);
		await expect(render(Predict, { id: 'e', title: 'T', run: 'x.py' })).rejects.toThrow(/needs answer and run/);
		await expect(render(Predict, { ...example, hint: 'h' })).rejects.toThrow(
			/takes no hint, concepts, context or phase/,
		);
		await expect(render(Predict, { ...example, concepts: ['token'] })).rejects.toThrow(/takes no hint/);
		await expect(render(Predict, { ...example, context: 'c' })).rejects.toThrow(/takes no hint/);
	});
	it('honor system: self-grade radios, Record label, never reviewed', async () => {
		const html = await render(Predict, base);
		expect(html).toContain('name="cp-selfgrade"');
		expect(html).toContain('>Record</button>');
		expect(html).toContain('data-reviewable="false"');
		expect(html).not.toContain('data-answer');
	});
});

describe('Order and Sort', () => {
	it('Order numbers the steps in the correct order with move buttons', async () => {
		const html = await render(Order, { ...base, steps: ['first', 'second'] });
		expect(html).toMatch(
			/<li data-pos="1" draggable="true">[\s\S]*first[\s\S]*<li data-pos="2" draggable="true">[\s\S]*second/,
		);
		expect(html).toContain('data-move="up"');
		expect(html).toContain('aria-label="Move &quot;first&quot; up"');
	});
	it('Sort renders chips with their bucket and one target per bucket', async () => {
		const html = await render(Sort, {
			...base,
			buckets: ['Left', 'Right'],
			items: [
				{ text: 'a', bucket: 0 },
				{ text: 'b', bucket: 1 },
			],
		});
		expect(html.match(/class="cp-chip"/g)).toHaveLength(2);
		expect(html.match(/draggable="true"/g)).toHaveLength(2);
		expect(html).toContain('data-bucket="1"');
		expect(html).toContain('Unplaced (drag an item to a bucket, or select it and then click the bucket)');
		expect(html.match(/class="cp-bucket-target"/g)).toHaveLength(2);
	});
	it('Sort rejects an item pointing outside the buckets', async () => {
		await expect(render(Sort, { ...base, buckets: ['Left'], items: [{ text: 'a', bucket: 1 }] })).rejects.toThrow(
			/points at bucket 1/,
		);
	});
});

describe('Repair', () => {
	it('shows the broken text, hides the model answer, and is never reviewed', async () => {
		const html = await render(Repair, { ...base, broken: 'a\nb', model: 'fixed' });
		expect(html).toContain('a\nb</textarea>');
		expect(html).toMatch(/<div class="cp-model" hidden>/);
		expect(html).toContain('fixed</pre>');
		expect(html).toContain('data-reviewable="false"');
		expect(html).toContain('>Record grade</button>');
	});
});

describe('MultiChoice and Match', () => {
	it('MultiChoice renders checkboxes with the count of correct items, and validates its options', async () => {
		const html = await render(MultiChoice, {
			...base,
			options: [
				{ text: 'a', correct: true },
				{ text: 'b', why: 'No.' },
				{ text: 'c', correct: true },
			],
		});
		expect(html).toContain('data-kind="multi-choice"');
		expect(html).toContain('data-count="2"');
		expect(html).toContain('Select exactly 2.');
		expect(html.match(/type="checkbox"/g)).toHaveLength(3);
		expect(html).toContain('data-reviewable="true"');
		await expect(
			render(MultiChoice, { ...base, options: [{ text: 'a', correct: true }, { text: 'b' }] }),
		).rejects.toThrow(/at least two correct options/);
		await expect(
			render(MultiChoice, {
				...base,
				options: [
					{ text: 'a', correct: true },
					{ text: 'b', correct: true },
				],
			}),
		).rejects.toThrow(/at least one wrong option/);
	});
	it('Match renders one select per row with the answer index and the rationale, and validates its rows', async () => {
		const html = await render(Match, {
			...base,
			options: ['Drafts', 'Copy'],
			rows: [
				{ statement: 'Reply', option: 0, why: 'Keep the send step.' },
				{ statement: 'Clean up', option: 1 },
			],
			rationale: 'Smaller is safer.',
		});
		expect(html).toContain('data-kind="match"');
		expect(html).toContain('data-rationale="Smaller is safer."');
		expect(html).toMatch(/<div class="cp-match-row" data-option="0" data-why="Keep the send step\."/);
		expect(html.match(/<select /g)).toHaveLength(2);
		expect(html).toContain('id="cp-row-0-fb"');
		await expect(
			render(Match, { ...base, options: ['a'], rows: [{ statement: 's', option: 0 }], rationale: '' }),
		).rejects.toThrow(/at least two rows/);
		await expect(
			render(Match, {
				...base,
				options: ['a'],
				rows: [
					{ statement: 's', option: 0 },
					{ statement: 't', option: 1 },
				],
				rationale: '',
			}),
		).rejects.toThrow(/points at option 1/);
	});
});
