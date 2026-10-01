/**
 * The answer-words check (`docs/agents/writing-a-lesson.md` "Checkpoints"):
 * a graded `Predict` is marked by exact match, and the review page shows
 * only its `context` and its stem, so every word of its `answer` must be in
 * one of the two. Pure functions over the export items, called from
 * checkpoints.mjs and covered by tests/scripts/predict-answers.test.ts.
 *
 * - A graded `Predict` is an item of kind `predict` with a string `answer`
 *   (an honor-system Predict has none) that is `reviewable`, which the
 *   export sets false for `review={false}` and for a `phase="practice"`
 *   alternate. A practice alternate is skipped on purpose, because the
 *   review page never shows it.
 * - A word is a run of Unicode letters, combining marks and digits, `_`,
 *   `-`, `.` and `/` with at least one letter (so `café` and `東京` are
 *   words, and so is a `café` written with a combining accent). A run of
 *   digits and punctuation alone is skipped, because the learner may work
 *   a number out from the code.
 * - Leading and trailing dots and slashes are dropped from every word on
 *   both sides, so `ok.` at the end of a sentence matches `ok`, and the
 *   host in `https://collect.example/?c=1` matches `collect.example`.
 * - The comparison is case-sensitive, because the match is exact.
 */

const WORD = /[\p{L}\p{M}\p{N}_./-]+/gu;
const LETTER = /\p{L}/u;

/** The words of `text` that have a letter, without leading and trailing dots and slashes, in order of first appearance. */
export function answerWords(text) {
	const out = [];
	for (const raw of text.match(WORD) ?? []) {
		const word = raw.replace(/^[./]+|[./]+$/g, '');
		if (LETTER.test(word) && !out.includes(word)) out.push(word);
	}
	return out;
}

/** The words of `answer` that are in neither `stem` nor `context`, in order. */
export function missingAnswerWords(answer, stem, context = '') {
	const known = new Set([...answerWords(stem), ...answerWords(context ?? '')]);
	return answerWords(answer).filter((w) => !known.has(w));
}

/** Whether an export item is a graded, reviewable `Predict`. */
export function isGradedPredict(item) {
	return item?.kind === 'predict' && typeof item.answer === 'string' && item.reviewable === true;
}

/**
 * One warning per graded `Predict` whose answer has a word its stem and
 * `context` lack, as `<lesson>#<id>: ...` with the missing words.
 * `stemOf(item)` is the stem to compare with, the item's own `stem` by
 * default; checkpoints.mjs passes the page's stem, the source the learner
 * reads, because the export spells citations out as their source.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {(item: Record<string, unknown>) => string} [stemOf]
 * @returns {string[]}
 */
export function checkPredictAnswers(items, stemOf = (item) => (typeof item.stem === 'string' ? item.stem : '')) {
	const warnings = [];
	for (const item of items) {
		if (!isGradedPredict(item)) continue;
		const context = typeof item.context === 'string' ? item.context : '';
		const missing = missingAnswerWords(item.answer, stemOf(item), context);
		if (missing.length)
			warnings.push(
				`${item.lesson}#${item.id}: the graded Predict's answer has words that are in neither its stem nor its context: ${missing.map((w) => JSON.stringify(w)).join(', ')}`,
			);
	}
	return warnings;
}
