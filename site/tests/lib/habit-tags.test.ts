import { assertHabitId, HABIT_ID, habitTagsOfSource, MAX_HABITS } from '@lib/habit-tags';
import { RESERVED_IDS } from '@lib/page-ids';
import { describe, expect, it } from 'vitest';

const page = (habits: string, before = '') =>
	`## Blast radius\n\nText.\n\n## Putting it together\n\n${before}<Recap>\n1. One.\n</Recap>\n\n${habits}`;

describe('habitTagsOfSource (spec S07 "Authoring")', () => {
	it('reads the id and the text of each habit after the recap, in source order', () => {
		const habits = habitTagsOfSource(
			page(
				'<Habit id="name-the-blast-radius">\nThe next time you hand an agent a task, say what it can reach.\n</Habit>\n\n<Habit id="check-the-diff-first">\nRead the diff.\n</Habit>\n',
			),
			'x/y',
		);
		expect(habits).toEqual([
			{ id: 'name-the-blast-radius', text: 'The next time you hand an agent a task, say what it can reach.' },
			{ id: 'check-the-diff-first', text: 'Read the diff.' },
		]);
	});
	it('a page without habits has none', () => {
		expect(habitTagsOfSource(page(''), 'x/y')).toEqual([]);
		expect(habitTagsOfSource('', 'x/y')).toEqual([]);
	});
	it('allows at most two', () => {
		expect(MAX_HABITS).toBe(2);
		const three = ['a', 'b', 'c'].map((id) => `<Habit id="${id}">\nT.\n</Habit>`).join('\n');
		expect(() => habitTagsOfSource(page(three), 'x/y')).toThrow(/3 <Habit> tags; a lesson has at most 2/);
	});
	it('requires a kebab-case id, unique in the lesson', () => {
		expect(() => habitTagsOfSource(page('<Habit>\nT.\n</Habit>'), 'x/y')).toThrow(/x\/y: <Habit> without an id/);
		expect(() => habitTagsOfSource(page('<Habit id="Name It">\nT.\n</Habit>'), 'x/y')).toThrow(
			/"Name It" is not a lowercase kebab-case slug/,
		);
		expect(() => habitTagsOfSource(page('<Habit id={1}>\nT.\n</Habit>'), 'x/y')).toThrow(/id must be a string/);
		const twice = '<Habit id="a">\nT.\n</Habit>\n<Habit id="a">\nU.\n</Habit>';
		expect(() => habitTagsOfSource(page(twice), 'x/y')).toThrow(/habit id "a" is used twice/);
		expect(HABIT_ID.test('name-the-blast-radius')).toBe(true);
		expect(HABIT_ID.test('-leading')).toBe(false);
		expect(assertHabitId('x/y', 'ok-id')).toBe('ok-id');
	});
	it('rejects an id that is also a heading slug or a checkpoint id, because each is a DOM id on the page', () => {
		expect(() => habitTagsOfSource(page('<Habit id="blast-radius">\nT.\n</Habit>'), 'x/y')).toThrow(
			/habit id "blast-radius" is also a heading slug/,
		);
		const withH3 = `### Deeper still\n\n${page('<Habit id="deeper-still">\nT.\n</Habit>')}`;
		expect(() => habitTagsOfSource(withH3, 'x/y')).toThrow(/habit id "deeper-still" is also a heading slug/);
		const repeated = `## Review\n\n### Review\n\n${page('<Habit id="review-1">\nT.\n</Habit>')}`;
		expect(() => habitTagsOfSource(repeated, 'x/y')).toThrow(/habit id "review-1" is also a heading slug/);
		const withCheckpoint = page('<Habit id="pick-one">\nT.\n</Habit>', '<Choice id="pick-one" />\n\n');
		expect(() => habitTagsOfSource(withCheckpoint, 'x/y')).toThrow(/habit id "pick-one" is also a checkpoint id/);
	});
	it('rejects an id the build adds to a lesson page, because the lesson source never shows it (issue #458)', () => {
		const fixed = [
			'references',
			'lesson-toc-checkpoints',
			'lesson-toc-examples',
			'lesson-toc-mobile-checkpoints',
			'lesson-toc-mobile-examples',
			'recap',
			'exercise',
			'more-practice',
			'theme-icons',
		];
		expect([...RESERVED_IDS].sort()).toEqual([...fixed].sort());
		for (const id of [...fixed, 'ref-1', 'ref-12']) {
			expect(() => habitTagsOfSource(page(`<Habit id="${id}">\nT.\n</Habit>`), 'x/y')).toThrow(
				new RegExp(`habit id "${id}" is also an id the build adds to the lesson page`),
			);
		}
		expect(habitTagsOfSource(page('<Habit id="ref-check">\nT.\n</Habit>'), 'x/y')).toHaveLength(1);
	});
	it('rejects the slug the appended References heading gets after a source heading took `references`', () => {
		const one = page('<Habit id="references-1">\nT.\n</Habit>', '## References\n\nText.\n\n');
		expect(() => habitTagsOfSource(one, 'x/y')).toThrow(
			/habit id "references-1" is also an id the build adds to the lesson page/,
		);
		const two = page('<Habit id="references-2">\nT.\n</Habit>', '## References\n\nText.\n\n## References\n\nText.\n\n');
		expect(() => habitTagsOfSource(two, 'x/y')).toThrow(
			/habit id "references-2" is also an id the build adds to the lesson page/,
		);
		expect(habitTagsOfSource(page('<Habit id="references-1">\nT.\n</Habit>'), 'x/y')).toHaveLength(1);
	});
	it("rejects the ids Starlight's <Tabs> gives its tabs and panels", () => {
		for (const id of ['tab-0-0', 'tab-2-11', 'tab-panel-0-0', 'tab-panel-3-1']) {
			expect(() => habitTagsOfSource(page(`<Habit id="${id}">\nT.\n</Habit>`), 'x/y')).toThrow(
				new RegExp(`habit id "${id}" is also an id the build adds to the lesson page`),
			);
		}
		for (const id of ['tab-order', 'tab-0', 'tab-panel-0']) {
			expect(habitTagsOfSource(page(`<Habit id="${id}">\nT.\n</Habit>`), 'x/y')).toHaveLength(1);
		}
	});
	it("rejects Starlight's fixed ids through the slug rule", () => {
		for (const id of [
			'_top',
			'starlight__sidebar',
			'starlight__search',
			'starlight__on-this-page',
			'starlight__mobile-toc',
			'starlight__on-this-page--mobile',
		]) {
			expect(() => habitTagsOfSource(page(`<Habit id="${id}">\nT.\n</Habit>`), 'x/y')).toThrow(
				/is not a lowercase kebab-case slug/,
			);
		}
	});
	it('rejects the id of a row of a <Match> on the page, and allows the same form without that Match', () => {
		const withMatch = (id: string) => page(`<Habit id="${id}">\nT.\n</Habit>`, '<Match id="pair-up" />\n\n');
		for (const id of ['pair-up-row-0', 'pair-up-row-3-fb']) {
			expect(() => habitTagsOfSource(withMatch(id), 'x/y')).toThrow(
				new RegExp(`habit id "${id}" is also the id of a row of <Match id="pair-up">`),
			);
		}
		expect(habitTagsOfSource(withMatch('other-row-0'), 'x/y')).toHaveLength(1);
		const withChoice = page('<Habit id="pair-up-row-0">\nT.\n</Habit>', '<Choice id="pair-up" />\n\n');
		expect(habitTagsOfSource(withChoice, 'x/y')).toHaveLength(1);
	});
	it('rejects a habit before the recap, or without a recap, and one without text', () => {
		expect(() => habitTagsOfSource(page('', '<Habit id="a">\nT.\n</Habit>\n\n'), 'x/y')).toThrow(
			/x\/y#a: <Habit> must come after the <Recap>/,
		);
		expect(() => habitTagsOfSource('<Habit id="a">\nT.\n</Habit>', 'x/y')).toThrow(/must come after the <Recap>/);
		expect(() => habitTagsOfSource(page('<Habit id="a" />'), 'x/y')).toThrow(/x\/y#a: <Habit> has no text/);
	});
	it('names the lesson on a parse error', () => {
		expect(() => habitTagsOfSource('<Habit id="a">', 'x/y')).toThrow(/^x\/y: /);
	});
});
