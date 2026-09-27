/**
 * The rules of the redaction widget (`widgets/Redactor.astro`), a port of
 * `site/examples/safety/redact-before-you-paste/redaction.py` and
 * `check_partial.py`, which stay in CI as the lesson's proofs. The widget
 * prints what the Python scripts print for the same text, so the lesson's
 * `text` fences hold both.
 *
 * Where JavaScript and Python can differ, the case is input a learner
 * rarely types into a map:
 *
 * - `String.prototype.trim` removes a slightly different set of whitespace
 *   than Python's `str.strip()` (Python also strips U+001C to U+001F).
 * - A map is split into lines at `\r\n`, `\r` and `\n`, where `parse_map`
 *   splits only at `\n` (Python's universal newlines already turned a file's
 *   `\r\n` and lone `\r` into `\n`). A browser text box turns every line
 *   break into `\n`, so the widget never meets a lone `\r`.
 * - A value's length for the longest-first order counts code points, as
 *   `len()` does, through `[...value].length`.
 * - The widget reports "none of the listed details" where
 *   `check_partial.py` would print an empty list after the colon, because
 *   an empty line reads like a result that failed to load.
 */

/** One map row: the text as it appears in the document, and what replaces it. */
export interface MapRow {
	value: string;
	placeholder: string;
}

/** A parsed map, or the message that says which line could not be read. */
export type ParsedMap = { rows: MapRow[]; error: null } | { rows: []; error: string };

/** `parse_map`: one `value => placeholder` per line, blank lines skipped. */
export function parseMap(text: string): ParsedMap {
	const rows: MapRow[] = [];
	for (const raw of text.split(/\r\n|\r|\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const at = line.indexOf(' => ');
		if (at < 0) return { rows: [], error: `map line without ' => ': ${line}` };
		rows.push({ value: line.slice(0, at), placeholder: line.slice(at + ' => '.length) });
	}
	return { rows, error: null };
}

/** The length Python's `len()` gives a string: its code points. */
function codePoints(text: string): number {
	return [...text].length;
}

/** `str.replace(old, new)`: every occurrence, left to right, without overlaps. */
function replaceAll(text: string, from: string, to: string): string {
	return text.split(from).join(to);
}

/**
 * `redact`: replace every value with its placeholder. Longer values go
 * first, so a full name that contains a shorter value is replaced whole.
 * Rows of the same length keep their map order, as Python's stable sort does.
 */
export function redact(text: string, rows: readonly MapRow[]): string {
	const ordered = [...rows].sort((a, b) => codePoints(b.value) - codePoints(a.value));
	return ordered.reduce((out, row) => replaceAll(out, row.value, row.placeholder), text);
}

/**
 * `restore`: put the real value back for every placeholder. Longer
 * placeholders go first, so `Person 10` is restored whole and not as
 * `Person 1` followed by a `0`.
 */
export function restore(text: string, rows: readonly MapRow[]): string {
	const ordered = [...rows].sort((a, b) => codePoints(b.placeholder) - codePoints(a.placeholder));
	return ordered.reduce((out, row) => replaceAll(out, row.placeholder, row.value), text);
}

/**
 * `still_identifying`: the labels of the watched details still in `text`,
 * in watch-list order. A watch row is `value => label`, the format of a map
 * row, so `row.placeholder` holds the label.
 */
export function stillIdentifying(text: string, watch: readonly MapRow[]): string[] {
	return watch.filter((row) => text.includes(row.value)).map((row) => row.placeholder);
}

/** The line `check_partial.py` prints for these labels. */
export function leakLine(labels: readonly string[]): string {
	return `still identifying: ${labels.length ? labels.join(', ') : 'none of the listed details'}`;
}

/** What the widget shows after a press: the new text and the leak line, or the error that stopped it. */
export interface PassResult {
	text: string | null;
	leaks: string | null;
	error: string | null;
}

/**
 * One press of the widget's button. `action` is `redact` or `restore`,
 * `map` is the map box and `watch` the watch box, or `null` when the widget
 * has none. The leak line checks the text after the pass.
 */
export function runPass(action: 'redact' | 'restore', text: string, map: string, watch: string | null): PassResult {
	const parsedMap = parseMap(map);
	if (parsedMap.error !== null) return { text: null, leaks: null, error: parsedMap.error };
	const out = action === 'redact' ? redact(text, parsedMap.rows) : restore(text, parsedMap.rows);
	if (watch === null) return { text: out, leaks: null, error: null };
	const parsedWatch = parseMap(watch);
	if (parsedWatch.error !== null)
		return { text: out, leaks: null, error: `watch list: ${parsedWatch.error.replace('map line', 'line')}` };
	return { text: out, leaks: leakLine(stillIdentifying(out, parsedWatch.rows)), error: null };
}
