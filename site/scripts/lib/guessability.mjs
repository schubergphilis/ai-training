/**
 * The surface-cue check (spec S03 "Checkpoints", "Writing distractors"): a
 * `choice`, `scenario` or `multi-choice` item must not be answerable from
 * the look of its options alone. Pure functions over the export items
 * (`{lesson, id, kind, stem, options, answer, guessable}`), called from
 * checkpoints.mjs and covered by tests/scripts/guessability.test.ts.
 *
 * Four heuristics, each a failure:
 *
 * - `longest`: the correct option is more than 40 percent and at least
 *   `LONGEST_MIN_GAP` characters longer than the longest wrong option (for
 *   `multi-choice`, the mean length of the correct options against the mean
 *   of the wrong ones). Lengths are counted with Markdown marks stripped.
 * - `hedge`: a correct option has a hedge word from `HEDGES` (`usually`,
 *   `may`, `depends`, ...) and no wrong option has one.
 * - `echo`: a correct option shares a content word (four or more letters,
 *   not in `STOPWORDS`) with the stem and no wrong option does. The stem
 *   is the one the learner reads, so the caller passes it without its
 *   citations (`stemOf` of `checkGuessability`): the export's stem spells
 *   a citation out as its source, and the page shows a number there.
 * - `fixed-position`: within one lesson with `FIXED_POSITION_MIN_ITEMS` or
 *   more `choice`/`scenario` items, one index holds the correct option in
 *   more than `FIXED_POSITION_MAX_SHARE` of them (three quarters). Four
 *   items with the same key index fail, and three of four pass. Every
 *   item in the lesson counts toward the minimum and the denominator; an
 *   exempt item is never a hit.
 *
 * An item with `guessable="<cue>[, <cue>]: reason"` names the cues it is
 * exempt from, in the repo's noqa form (the rule and the reason together).
 * The item is listed in `exemptions` so the opt-out stays visible in the
 * check output. A named cue that does not trip is an error (a stale
 * exemption), and so is a cue that trips and is not named. An exemption
 * for `fixed-position` means that item never counts as a hit, while the
 * lesson's item count still includes it.
 */

/** Kinds the heuristics apply to. */
export const GUESSABLE_KINDS = new Set(['choice', 'scenario', 'multi-choice']);

/** The correct option is longer than the longest wrong one by more than this ratio ... */
export const LONGEST_RATIO = 1.4;
/** ... and by at least this many characters, so `Yes` against `No` is not a cue. */
export const LONGEST_MIN_GAP = 12;

/** `fixed-position` looks only at lessons with at least this many `choice`/`scenario` items ... */
export const FIXED_POSITION_MIN_ITEMS = 4;
/** ... and fails one when a single index holds the key in more than this share of them. */
export const FIXED_POSITION_MAX_SHARE = 0.75;

/** The cue names, in the order the messages use. */
export const CUES = ['longest', 'hedge', 'echo', 'fixed-position'];

/** Hedge words and phrases; the key must not be the only option that hedges. */
export const HEDGES = [
	'usually',
	'often',
	'may',
	'might',
	'depends',
	'in most cases',
	'typically',
	'generally',
	'sometimes',
	'not always',
];

/** Common words that don't count as a content word shared between stem and option. */
export const STOPWORDS = new Set([
	'that',
	'this',
	'with',
	'from',
	'what',
	'which',
	'when',
	'where',
	'will',
	'would',
	'should',
	'could',
	'have',
	'has',
	'does',
	'into',
	'than',
	'then',
	'them',
	'they',
	'their',
	'there',
	'these',
	'those',
	'your',
	'yours',
	'about',
	'because',
	'while',
	'only',
	'also',
	'each',
	'every',
	'here',
	'more',
	'most',
	'some',
	'such',
	'over',
	'same',
	'other',
	'been',
	'being',
	'were',
	'make',
	'makes',
	'made',
	'want',
	'wants',
	'like',
	'just',
	'still',
	'both',
	'after',
	'before',
	'again',
	'says',
	'said',
	'asks',
	'asked',
	'tell',
	'tells',
	'told',
	'know',
	'knows',
	'need',
	'needs',
	'give',
	'gives',
	'take',
	'takes',
	'gets',
	'goes',
	'going',
	'right',
	'wrong',
	'true',
	'false',
	'best',
	'next',
	'first',
	'last',
	'much',
	'many',
	'very',
	'well',
	'thing',
	'things',
	'something',
	'anything',
	'nothing',
	'someone',
	'colleague',
	'option',
	'options',
	'answer',
	'question',
	'statement',
	'following',
	'correct',
	'describes',
	'below',
	'above',
]);

/** Lower-case words of four or more letters in `text`, minus stopwords. Markdown and code marks are dropped. */
export function contentWords(text) {
	const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
	return new Set(words.map((w) => w.replace(/^'+|['-]+$/g, '')).filter((w) => w.length >= 4 && !STOPWORDS.has(w)));
}

/** `text` without Markdown marks: backticks, emphasis marks, and link targets (`[text](url)` keeps `text`). */
export function plainLength(text) {
	return text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[`*_]/g, '')
		.trim().length;
}

/**
 * Whether `text` contains a hedge from `HEDGES` as a whole word or phrase.
 * `may` counts only in lower case, so the month does not.
 */
export function hasHedge(text) {
	const words = ` ${text.replace(/[^A-Za-z]+/g, ' ')} `;
	const lower = words.toLowerCase();
	return HEDGES.some((h) => (h === 'may' ? words.includes(' may ') : lower.includes(` ${h} `)));
}

/**
 * Problems with the option data itself: a duplicate option text, or an
 * answer that is not one of the options. `shapeOf` in the build derives
 * the answer from the options, so these only appear in a hand-edited export.
 */
export function optionErrors(item) {
	if (!GUESSABLE_KINDS.has(item?.kind) || !Array.isArray(item.options)) return [];
	const errors = [];
	const seen = new Set();
	for (const o of item.options) {
		if (seen.has(o)) errors.push(`option text appears twice: ${JSON.stringify(o)}`);
		seen.add(o);
	}
	for (const a of Array.isArray(item.answer) ? item.answer : [item.answer]) {
		if (!seen.has(a)) errors.push(`answer is not one of the options: ${JSON.stringify(a)}`);
	}
	return errors;
}

/** The correct and wrong option texts of one item, or null when the kind is out of scope or the data is not usable. */
export function splitOptions(item) {
	if (!GUESSABLE_KINDS.has(item?.kind) || !Array.isArray(item.options)) return null;
	const answers = new Set(Array.isArray(item.answer) ? item.answer : [item.answer]);
	const correct = item.options.filter((o) => answers.has(o));
	const wrong = item.options.filter((o) => !answers.has(o));
	if (correct.length === 0 || wrong.length === 0) return null;
	return { correct, wrong };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The per-item cue names (`longest`, `hedge`, `echo`) an item trips.
 * `stem` is the text `echo` compares the options with, the item's own
 * `stem` unless the caller passes another. `fixed-position` needs the
 * whole lesson; see `fixedPositionLessons`.
 */
export function itemCues(item, stem = item?.stem ?? '') {
	const split = splitOptions(item);
	if (!split) return [];
	const { correct, wrong } = split;
	const cues = [];
	const correctLength = mean(correct.map(plainLength));
	const wrongLength = item.kind === 'multi-choice' ? mean(wrong.map(plainLength)) : Math.max(...wrong.map(plainLength));
	if (correctLength > wrongLength * LONGEST_RATIO && correctLength - wrongLength >= LONGEST_MIN_GAP)
		cues.push('longest');
	if (correct.some(hasHedge) && !wrong.some(hasHedge)) cues.push('hedge');
	const stemWords = contentWords(stem);
	const echoes = (o) => [...contentWords(o)].some((w) => stemWords.has(w));
	if (stemWords.size > 0 && correct.some(echoes) && !wrong.some(echoes)) cues.push('echo');
	return cues;
}

/**
 * The cues named in a `guessable` reason (`"longest, fixed-position: why"`),
 * and the reason after the colon. `cues` is null when the text has no
 * `<cue>: ` prefix or names something that is not a cue.
 */
export function parseGuessable(text) {
	const m = /^([a-z, -]+):\s*(.*)$/s.exec(text.trim());
	if (!m) return { cues: null, reason: text.trim() };
	const cues = m[1].split(',').map((c) => c.trim());
	if (cues.some((c) => !CUES.includes(c))) return { cues: null, reason: text.trim() };
	return { cues, reason: m[2].trim() };
}

/**
 * The lessons in which one index holds the correct option in more than
 * `FIXED_POSITION_MAX_SHARE` of the `choice`/`scenario` items, among lessons
 * with at least `FIXED_POSITION_MIN_ITEMS` such items. Each entry has that
 * index, how many items (`hits`) have the key there, and the lesson's item
 * count. Every item counts toward the minimum and toward `count`, the
 * denominator of the share. An item for which `exempt(item)` is true is
 * never a hit, so an exemption can only make a lesson pass.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {(item: Record<string, unknown>) => boolean} [exempt]
 */
export function fixedPositionLessons(items, exempt = () => false) {
	const byLesson = new Map();
	for (const item of items) {
		if (item.kind !== 'choice' && item.kind !== 'scenario') continue;
		if (!Array.isArray(item.options)) continue;
		const index = item.options.indexOf(item.answer);
		if (index === -1) continue;
		if (!byLesson.has(item.lesson)) byLesson.set(item.lesson, { hitsByIndex: new Map(), count: 0 });
		const entry = byLesson.get(item.lesson);
		entry.count++;
		if (!exempt(item)) entry.hitsByIndex.set(index, (entry.hitsByIndex.get(index) ?? 0) + 1);
	}
	const out = [];
	for (const [lesson, { hitsByIndex, count }] of byLesson) {
		if (count < FIXED_POSITION_MIN_ITEMS) continue;
		for (const [index, hits] of hitsByIndex) {
			if (hits > count * FIXED_POSITION_MAX_SHARE) out.push({ lesson, index, hits, count });
		}
	}
	return out;
}

/**
 * Check every item. Returns `{ errors, exemptions }`: `errors` are the
 * messages for items that trip a cue, for bad option data and for
 * exemptions that name a cue that does not trip or miss one that does, and
 * `exemptions` one line per `guessable` item with its cues and reason.
 * `stemOf(item)` is the stem the `echo` cue reads, the item's own `stem`
 * by default; checkpoints.mjs passes the page's stem without citations.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {(item: Record<string, unknown>) => string} [stemOf]
 */
export function checkGuessability(items, stemOf = (item) => (typeof item.stem === 'string' ? item.stem : '')) {
	const errors = [];
	const exemptions = [];
	const positionAll = new Set(fixedPositionLessons(items).map((p) => p.lesson));
	const exemptFromPosition = (item) =>
		typeof item.guessable === 'string' && (parseGuessable(item.guessable).cues ?? []).includes('fixed-position');
	for (const item of items) {
		const where = `${item.lesson}#${item.id}`;
		for (const e of optionErrors(item)) errors.push(`${where}: ${e}`);
		const guessable = item.guessable;
		if (guessable === undefined || guessable === null) {
			for (const cue of itemCues(item, stemOf(item))) errors.push(`${where}: ${describe(cue)}`);
			continue;
		}
		if (typeof guessable !== 'string') {
			errors.push(`${where}: guessable must be a string in the form "<cue>: reason"`);
			continue;
		}
		const { cues: named, reason } = parseGuessable(guessable);
		if (!named || reason === '') {
			errors.push(
				`${where}: guessable must name its cue and a reason, as "<cue>[, <cue>]: reason" (cues: ${CUES.join(', ')})`,
			);
			continue;
		}
		const inPositionRun = (item.kind === 'choice' || item.kind === 'scenario') && positionAll.has(item.lesson);
		const tripped = [...itemCues(item, stemOf(item)), ...(inPositionRun ? ['fixed-position'] : [])];
		for (const cue of named)
			if (!tripped.includes(cue)) errors.push(`${where}: guessable names ${cue}, which does not trip; remove it`);
		for (const cue of tripped)
			if (!named.includes(cue)) errors.push(`${where}: ${describe(cue)} (guessable does not name it)`);
		exemptions.push(`${where}: guessable (${named.join(', ')}): ${reason}`);
	}
	for (const { lesson, index, hits, count } of fixedPositionLessons(items, exemptFromPosition)) {
		errors.push(
			`${lesson}: fixed-position: the correct option is option ${index + 1} in ${hits} of the ${count} choice/scenario checkpoints (more than three quarters); move some`,
		);
	}
	return { errors, exemptions };
}

function describe(cue) {
	switch (cue) {
		case 'longest':
			return 'longest: the correct option is more than 40 percent longer than the longest wrong one; tighten it or lengthen the distractors';
		case 'hedge':
			return `hedge: only a correct option hedges (${HEDGES.join(', ')}); drop the hedge or give a distractor one`;
		case 'echo':
			return 'echo: only a correct option repeats a content word from the stem; reword it or let a distractor share the word';
		case 'fixed-position':
			return 'fixed-position: one index holds the choice/scenario key in more than three quarters of this lesson';
		default:
			return cue;
	}
}
