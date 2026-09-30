import { describe, expect, it } from 'vitest';
import {
	checkGuessability,
	contentWords,
	fixedPositionLessons,
	hasHedge,
	itemCues,
	optionErrors,
	parseGuessable,
	plainLength,
	splitOptions,
} from '../../scripts/lib/guessability.mjs';

const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
	id: 'q',
	lesson: 'a/x',
	kind: 'choice',
	stem: 'Which access keeps the send step for you?',
	options: ['Reading only', 'A scratch copy of it', 'Drafts in the outbox'],
	answer: 'Drafts in the outbox',
	guessable: null,
	...over,
});

describe('contentWords, plainLength and hasHedge', () => {
	it('keeps lower-cased words of four letters or more and drops stopwords and marks', () => {
		expect([...contentWords('Which `token` does the model pick, and why?')].sort()).toEqual(['model', 'pick', 'token']);
		expect(contentWords('is it so')).toEqual(new Set());
	});
	it('counts length without backticks, emphasis marks or link targets', () => {
		expect(plainLength('`todo list`')).toBe(9);
		expect(plainLength('a *b* _c_ [d](https://example.com/very/long)')).toBe(7);
	});
	it('finds a hedge word or phrase as a whole word only, and may only in lower case', () => {
		expect(hasHedge('It usually works.')).toBe(true);
		expect(hasHedge('In most cases, yes')).toBe(true);
		expect(hasHedge('The mayor depends on it')).toBe(true);
		expect(hasHedge('Mayonnaise')).toBe(false);
		expect(hasHedge('Always')).toBe(false);
		expect(hasHedge('It may fail')).toBe(true);
		expect(hasHedge('Released in May 2024')).toBe(false);
	});
});

describe('splitOptions and optionErrors', () => {
	it('splits correct from wrong for choice, scenario and multi-choice, and returns null otherwise', () => {
		expect(splitOptions(item())).toEqual({
			correct: ['Drafts in the outbox'],
			wrong: ['Reading only', 'A scratch copy of it'],
		});
		expect(splitOptions(item({ kind: 'multi-choice', answer: ['Reading only', 'A scratch copy of it'] }))).toEqual({
			correct: ['Reading only', 'A scratch copy of it'],
			wrong: ['Drafts in the outbox'],
		});
		expect(splitOptions(item({ kind: 'sort' }))).toBeNull();
		expect(splitOptions(item({ options: null }))).toBeNull();
		expect(splitOptions(item({ answer: 'nope' }))).toBeNull();
	});
	it('reports a duplicate option text and an answer that is not an option', () => {
		expect(optionErrors(item())).toEqual([]);
		expect(optionErrors(item({ kind: 'order' }))).toEqual([]);
		expect(optionErrors(item({ options: ['a', 'a', 'b'], answer: 'c' }))).toEqual([
			'option text appears twice: "a"',
			'answer is not one of the options: "c"',
		]);
		expect(optionErrors(item({ kind: 'multi-choice', answer: ['Reading only', 'zz'] }))).toEqual([
			'answer is not one of the options: "zz"',
		]);
	});
});

describe('itemCues', () => {
	it('passes an item with options of similar length, no lone hedge and no lone echo', () => {
		expect(itemCues(item())).toEqual([]);
	});
	it('flags longest when the key is more than 40 percent and at least 12 characters longer than the longest distractor', () => {
		expect(itemCues(item({ options: ['Yes', 'No', 'Drafts in the outbox'] }))).toEqual(['longest']);
		expect(itemCues(item({ options: ['Read only, no writes', 'A scratch copy', 'Drafts in the outbox'] }))).toEqual([]);
		expect(itemCues(item({ options: ['No', 'Yes'], answer: 'Yes' }))).toEqual([]);
		expect(itemCues(item({ options: ['Yes', 'No', 'Maybe'], answer: 'Maybe' }))).toEqual([]);
	});
	it('measures length with Markdown marks stripped', () => {
		const key = '`todo add "Pay rent" due 2026-10-01` then `todo list`';
		const wrong = ['Dates work well for the whole team.', 'Dates parse'];
		expect(itemCues(item({ options: [...wrong, key], answer: key }))).toEqual([]);
		const raw = key.replaceAll('`', 'x');
		expect(itemCues(item({ options: [...wrong, raw], answer: raw }))).toEqual(['longest']);
	});
	it('compares mean lengths for multi-choice', () => {
		const keys = ['Every date in the memo appears in the summary.', 'No fact appears that is not in the memo.'];
		const multi = (wrong: string) =>
			item({
				kind: 'multi-choice',
				stem: 'Which lines can you tick?',
				options: [keys[0], wrong, keys[1]],
				answer: keys,
			});
		expect(itemCues(multi('Clear.'))).toEqual(['longest']);
		expect(itemCues(multi('The summary is clear and reads well to the team.'))).toEqual([]);
	});
	it('flags hedge only when a key hedges and no distractor does', () => {
		expect(
			itemCues(
				item({
					options: ['Reading only', 'A scratch copy of the folder', 'It depends on the task'],
					answer: 'It depends on the task',
				}),
			),
		).toEqual(['hedge']);
		expect(
			itemCues(
				item({
					options: ['Usually reading', 'A scratch copy of the folder', 'It depends on the task'],
					answer: 'It depends on the task',
				}),
			),
		).toEqual([]);
	});
	it('flags a single cued key in a multi-choice', () => {
		const hedge = item({
			kind: 'multi-choice',
			stem: 'Pick two.',
			options: ['It usually works', 'Zebra crossing', 'Kitten basket'],
			answer: ['It usually works', 'Zebra crossing'],
		});
		expect(itemCues(hedge)).toEqual(['hedge']);
		const echo = item({
			kind: 'multi-choice',
			stem: 'Which access keeps the send step for you?',
			options: ['Access to send', 'Zebra crossing', 'Kitten basket'],
			answer: ['Access to send', 'Zebra crossing'],
		});
		expect(itemCues(echo)).toEqual(['echo']);
	});
	it('flags echo only when a key repeats a stem word and no distractor does', () => {
		const echo = item({
			stem: 'Which access keeps the send step for you?',
			options: ['Reading only', 'A scratch copy', 'Access to send'],
			answer: 'Access to send',
		});
		expect(itemCues(echo)).toEqual(['echo']);
		expect(itemCues({ ...echo, options: ['Reading access', 'A scratch copy', 'Access to send'] })).toEqual([]);
		expect(itemCues({ ...echo, stem: '' })).toEqual([]);
	});
	it('reads echo from the stem it is given, so words the learner never sees do not count', () => {
		const cited = item({
			stem: 'Where does a subagent run (Create custom subagents, Claude Code documentation)?',
			options: ['In its own context window', 'In the main thread', 'Documentation of the tool'],
			answer: 'Documentation of the tool',
		});
		expect(itemCues(cited)).toEqual(['echo']);
		expect(itemCues(cited, 'Where does a subagent run?')).toEqual([]);
	});
	it('ignores kinds outside the check', () => {
		expect(
			itemCues(item({ kind: 'order', options: ['a', 'bbbbbbbbbbbbbbbbbbbb'], answer: 'bbbbbbbbbbbbbbbbbbbb' })),
		).toEqual([]);
	});
});

describe('parseGuessable', () => {
	it('reads the named cues and the reason, and rejects text without a cue prefix or with an unknown cue', () => {
		expect(parseGuessable('longest: the key is a full sentence')).toEqual({
			cues: ['longest'],
			reason: 'the key is a full sentence',
		});
		expect(parseGuessable(' longest, fixed-position:  two reasons ')).toEqual({
			cues: ['longest', 'fixed-position'],
			reason: 'two reasons',
		});
		expect(parseGuessable('the key is a full sentence')).toEqual({ cues: null, reason: 'the key is a full sentence' });
		expect(parseGuessable('shortest: nope')).toEqual({ cues: null, reason: 'shortest: nope' });
		expect(parseGuessable('longest:')).toEqual({ cues: ['longest'], reason: '' });
	});
});

describe('fixedPositionLessons', () => {
	const at = (lesson: string, id: string, index: number, over: Record<string, unknown> = {}) =>
		item({ lesson, id, options: ['one', 'two', 'three'], answer: ['one', 'two', 'three'][index], ...over });
	it('reports a lesson with four or more choice/scenario keys all at one index', () => {
		expect(
			fixedPositionLessons([
				at('a/x', 'p', 1),
				at('a/x', 'q', 1, { kind: 'scenario' }),
				at('a/x', 'r', 1),
				at('a/x', 's', 1),
			]),
		).toEqual([{ lesson: 'a/x', index: 1, hits: 4, count: 4 }]);
	});
	it('reports one index in more than three quarters of five or more items', () => {
		const five = ['p', 'q', 'r', 's', 't'].map((id) => at('a/x', id, 1));
		expect(fixedPositionLessons([...five, at('a/x', 'u', 0)])).toEqual([
			{ lesson: 'a/x', index: 1, hits: 5, count: 6 },
		]);
		expect(fixedPositionLessons([...five, at('a/x', 'u', 0), at('a/x', 'v', 2)])).toEqual([]);
	});
	it('passes three same-index items, three of four, exactly three quarters, and multi-choice items', () => {
		expect(fixedPositionLessons([at('a/x', 'p', 1), at('a/x', 'q', 1), at('a/x', 'r', 1)])).toEqual([]);
		expect(fixedPositionLessons([at('a/x', 'p', 1), at('a/x', 'q', 1), at('a/x', 'r', 1), at('a/x', 's', 0)])).toEqual(
			[],
		);
		const six = ['p', 'q', 'r', 's', 't', 'u'].map((id) => at('a/x', id, 1));
		expect(fixedPositionLessons([...six, at('a/x', 'v', 0), at('a/x', 'w', 2)])).toEqual([]);
		expect(
			fixedPositionLessons([
				at('a/x', 'p', 1),
				at('a/x', 'q', 1),
				at('a/x', 'r', 1),
				at('a/x', 's', 1, { kind: 'multi-choice', answer: ['two'] }),
			]),
		).toEqual([]);
	});
	it('counts every item in the denominator and never counts an exempt item as a hit', () => {
		const items = [
			at('a/x', 'p', 1),
			at('a/x', 'q', 1),
			at('a/x', 'r', 1),
			at('a/x', 's', 1),
			at('a/x', 't', 1, { guessable: 'x' }),
		];
		expect(fixedPositionLessons(items)).toEqual([{ lesson: 'a/x', index: 1, hits: 5, count: 5 }]);
		expect(fixedPositionLessons(items, (i) => i.id === 't')).toEqual([{ lesson: 'a/x', index: 1, hits: 4, count: 5 }]);
		expect(fixedPositionLessons(items, (i) => i.id === 't' || i.id === 's')).toEqual([]);
		// Six items, four at one index, two exempt elsewhere: 4 of 6 is not more than three quarters.
		const six = [...items.slice(0, 4), at('a/x', 'u', 0, { guessable: 'x' }), at('a/x', 'v', 2, { guessable: 'x' })];
		expect(fixedPositionLessons(six)).toEqual([]);
		expect(fixedPositionLessons(six, (i) => i.id === 'u' || i.id === 'v')).toEqual([]);
		// Five items with two exempt: the lesson still has five items, and 3 of 5 passes.
		const five = [...items.slice(0, 3), at('a/x', 'u', 1, { guessable: 'x' }), at('a/x', 'v', 1, { guessable: 'x' })];
		expect(fixedPositionLessons(five)).toEqual([{ lesson: 'a/x', index: 1, hits: 5, count: 5 }]);
		expect(fixedPositionLessons(five, (i) => i.id === 'u' || i.id === 'v')).toEqual([]);
	});
});

describe('checkGuessability stemOf', () => {
	it('passes the stem stemOf returns to the echo cue', () => {
		const cited = item({
			stem: 'Where does a subagent run (Create custom subagents, Claude Code documentation)?',
			options: ['In its own context window', 'In the main thread', 'Documentation of the tool'],
			answer: 'Documentation of the tool',
		});
		expect(checkGuessability([cited]).errors).toEqual([expect.stringMatching(/^a\/x#q: echo: /)]);
		expect(checkGuessability([cited], () => 'Where does a subagent run?').errors).toEqual([]);
	});
});

describe('checkGuessability', () => {
	const four = (over: (id: string) => Record<string, unknown> = () => ({})) =>
		['p', 'q', 'r', 's'].map((id) => item({ id, options: ['one', 'two', 'three'], answer: 'two', ...over(id) }));
	it('passes a clean list with no exemptions', () => {
		expect(checkGuessability([item()])).toEqual({ errors: [], exemptions: [] });
	});
	it('names the item and the cue for each hit, and reports bad option data', () => {
		const { errors } = checkGuessability([item({ options: ['Yes', 'No', 'Drafts in the outbox'] })]);
		expect(errors).toEqual([expect.stringMatching(/^a\/x#q: longest: /)]);
		expect(checkGuessability([item({ options: ['a', 'a'], answer: 'b' })]).errors).toEqual([
			'a/x#q: option text appears twice: "a"',
			'a/x#q: answer is not one of the options: "b"',
		]);
	});
	it('reports a fixed position per lesson with the full item count', () => {
		expect(checkGuessability(four()).errors).toEqual([
			'a/x: fixed-position: the correct option is option 2 in 4 of the 4 choice/scenario checkpoints (more than three quarters); move some',
		]);
	});
	it('skips a named cue, lists the exemption, and rejects a malformed, stale or incomplete one', () => {
		const long = item({
			options: ['Yes', 'No', 'Drafts in the outbox'],
			guessable: 'longest: the key is a full sentence',
		});
		expect(checkGuessability([long])).toEqual({
			errors: [],
			exemptions: ['a/x#q: guessable (longest): the key is a full sentence'],
		});
		const malformed = /guessable must name its cue and a reason/;
		expect(checkGuessability([item({ guessable: '  ' })]).errors).toEqual([expect.stringMatching(malformed)]);
		expect(checkGuessability([item({ guessable: 'no cue named' })]).errors).toEqual([expect.stringMatching(malformed)]);
		expect(checkGuessability([item({ guessable: 'longest:' })]).errors).toEqual([expect.stringMatching(malformed)]);
		expect(checkGuessability([item({ guessable: 3 })]).errors).toEqual([
			'a/x#q: guessable must be a string in the form "<cue>: reason"',
		]);
		expect(checkGuessability([item({ guessable: 'longest: why' })]).errors).toEqual([
			'a/x#q: guessable names longest, which does not trip; remove it',
		]);
		const partial = item({
			options: ['Yes', 'No', 'It depends on the outbox'],
			answer: 'It depends on the outbox',
			guessable: 'longest: full sentence',
		});
		expect(checkGuessability([partial]).errors).toEqual([
			expect.stringMatching(/^a\/x#q: hedge: .*\(guessable does not name it\)$/),
		]);
	});
	it('drops the lesson error only for an exemption that names fixed-position, and keeps the full count', () => {
		const named = four((id) => (id === 'r' ? { guessable: 'fixed-position: the four keys are the same step' } : {}));
		expect(checkGuessability(named)).toEqual({
			errors: [],
			exemptions: ['a/x#r: guessable (fixed-position): the four keys are the same step'],
		});
		const other = four((id) =>
			id === 'r'
				? {
						options: ['No', 'Drafts in the outbox', 'Yes'],
						answer: 'Drafts in the outbox',
						guessable: 'longest: full sentence',
					}
				: {},
		);
		expect(checkGuessability(other).errors).toEqual([
			expect.stringMatching(/^a\/x#r: fixed-position: .*\(guessable does not name it\)$/),
			'a/x: fixed-position: the correct option is option 2 in 4 of the 4 choice/scenario checkpoints (more than three quarters); move some',
		]);
		const five = [
			...four(),
			item({ id: 't', options: ['one', 'two', 'three'], answer: 'two', guessable: 'fixed-position: r' }),
		];
		expect(checkGuessability(five).errors).toEqual([
			'a/x: fixed-position: the correct option is option 2 in 4 of the 5 choice/scenario checkpoints (more than three quarters); move some',
		]);
		const sixWithTwoExemptElsewhere = [
			...four(),
			item({ id: 't', options: ['one', 'two', 'three'], answer: 'one', guessable: 'fixed-position: r' }),
			item({ id: 'u', options: ['one', 'two', 'three'], answer: 'three', guessable: 'fixed-position: r' }),
		];
		expect(checkGuessability(sixWithTwoExemptElsewhere).errors).toEqual([
			'a/x#t: guessable names fixed-position, which does not trip; remove it',
			'a/x#u: guessable names fixed-position, which does not trip; remove it',
		]);
	});
});
