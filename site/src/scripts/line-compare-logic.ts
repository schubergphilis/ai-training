/**
 * The rules of the line comparer widget (`widgets/LineCompare.astro`), a
 * port of `report` in `site/examples/safety/saying-ai-helped/compare.py`,
 * which stays in CI as the lesson's proof through `compare.py` and
 * `compare_rewrite.py`. The widget prints the lines the Python script
 * prints for the same two texts, so the lesson's `text` fences hold both.
 *
 * A line of the pasted text counts as shared when, with the spaces around
 * it removed, it is also a line of the source. Blank lines are skipped.
 * The report is the count, then every line of the pasted text that is not
 * in the source, indented by two spaces.
 *
 * Where JavaScript can't see what Python sees, the result can differ.
 * Python's `str.strip()` and JavaScript's `trim()` remove nearly the same
 * whitespace: `trim()` also removes U+FEFF, and `strip()` also removes the
 * separators U+001C to U+001F. Pasted code rarely holds either.
 */

/** The report for one comparison: the count line, and the heading and lines that follow it. */
export interface Comparison {
	shared: number;
	total: number;
	/** The lines of the pasted text that the source doesn't have, stripped, in order. */
	onlyHere: string[];
	/** The lines the widget prints, as `compare.py` prints them. */
	lines: string[];
}

/** The non-blank lines of `text`, each stripped of the whitespace around it. */
export function codeLines(text: string): string[] {
	return text
		.split(/\r\n|\r|\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

/** Compares `candidate` with `source`, a file called `sourceName` in the report. */
export function compare(candidate: string, source: string, sourceName: string): Comparison {
	const sourceLines = new Set(codeLines(source));
	const candidateLines = codeLines(candidate);
	const onlyHere = candidateLines.filter((line) => !sourceLines.has(line));
	const shared = candidateLines.length - onlyHere.length;
	return {
		shared,
		total: candidateLines.length,
		onlyHere,
		lines: [
			`${shared} of ${candidateLines.length} lines also appear in ${sourceName}`,
			`lines not in ${sourceName}:`,
			...onlyHere.map((line) => `  ${line}`),
		],
	};
}
