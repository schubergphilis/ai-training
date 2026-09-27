/**
 * The rules of the token counter widget (`widgets/TokenCounter.astro`), a
 * port of `site/examples/concepts/context-window/count_tokens.py` and
 * `pages_per_window.py`, which stay in CI as the lesson's proofs. The widget
 * prints the lines the two Python scripts print, so the lesson's `text`
 * fences hold both.
 *
 * The Python rules are copied as they are: a piece is a run of word
 * characters or one mark that is neither a word character nor whitespace
 * (`\w+|[^\w\s]`), a piece that starts with a letter or a digit and has more
 * than six characters counts one token per four characters rounded up, and
 * every other piece counts one. Lengths count code points, as Python's
 * `len()` on a `str` does.
 *
 * Where JavaScript can't see what Python sees, the result can differ. Each
 * case is about text no one pastes as a page of prose:
 *
 * - Python's `\w` takes the characters `str.isalnum()` accepts and `_`; the
 *   port uses the Unicode classes `\p{L}`, `\p{N}` and `_`. The two sets are
 *   the same for letters and digits, and may differ for a few rare
 *   characters that Unicode gives a numeric value.
 * - Python's `\s` and `str.split()` treat the control characters U+001C to
 *   U+001F as whitespace, and JavaScript's `\s` doesn't. JavaScript's `\s`
 *   takes U+FEFF, and Python's doesn't.
 */

/** `CHARS_PER_TOKEN` in `count_tokens.py`: the rule of thumb for English. */
export const CHARS_PER_TOKEN = 4;

/** `ONE_TOKEN_WORD` in `count_tokens.py`: a word of up to this many characters is one token. */
export const ONE_TOKEN_WORD = 6;

/** `WINDOWS` in `pages_per_window.py`: round window sizes that stand for the sizes on the market in 2026. */
export const WINDOWS: readonly number[] = [8_000, 32_000, 200_000, 1_000_000];

/** `PIECE` in `count_tokens.py`. */
const PIECE = /[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu;

/** A letter or a digit, the test `str.isalnum()` makes on the first character of a piece. */
const ALNUM = /^[\p{L}\p{N}]/u;

/** The length of `text` in code points, as Python's `len()` counts it. */
function codePoints(text: string): number {
	return [...text].length;
}

/** `estimate_tokens` in `count_tokens.py`: the estimated number of tokens in `text`. */
export function estimateTokens(text: string): number {
	let total = 0;
	for (const piece of text.match(PIECE) ?? []) {
		const length = codePoints(piece);
		if (!ALNUM.test(piece) || length <= ONE_TOKEN_WORD) total += 1;
		else total += Math.ceil(length / CHARS_PER_TOKEN);
	}
	return total;
}

/** The number of words in `text`, as `len(text.split())` counts them. */
export function countWords(text: string): number {
	const trimmed = text.trim();
	return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** A whole number with a comma between each group of three digits, as Python's `f"{n:,}"` writes it. */
export function grouped(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `report` in `count_tokens.py`: the three lines about `text`. */
export function countReport(text: string): string[] {
	return [
		`characters: ${codePoints(text)}`,
		`words: ${countWords(text)}`,
		`tokens (estimate): ${estimateTokens(text)}`,
	];
}

/**
 * `report` in `pages_per_window.py`: one line for the page, then one line per
 * window with the whole pages that fit. A page of zero tokens has no count
 * of pages (the Python script divides by zero), so the result is the first
 * line alone.
 */
export function pagesReport(tokensPerPage: number): string[] {
	const lines = [`one page: ${tokensPerPage} tokens`];
	if (tokensPerPage <= 0) return lines;
	for (const window of WINDOWS)
		lines.push(`${grouped(window)}-token window: ${grouped(Math.floor(window / tokensPerPage))} pages`);
	return lines;
}
