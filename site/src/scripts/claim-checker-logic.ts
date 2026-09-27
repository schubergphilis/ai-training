/**
 * The rules of the claim checker widget (`widgets/ClaimChecker.astro`), a
 * port of `site/examples/safety/spotting-hallucination/check_claims.py`,
 * which stays in CI as the lesson's proof through `all_claims.py` and
 * `missing_claims.py`. The widget prints the lines the Python checker prints
 * for the same summary and sources, so the lesson's `text` fences hold both.
 *
 * The checker pulls every quoted passage, every `article 7(3)` or
 * `section 12` reference and every figure out of a summary, and looks each
 * one up in the sources, one sentence per line. It checks presence, and
 * nothing more: a found figure may stand for a different thing in the
 * source, so the report shows the sentence for a person to read.
 *
 * Where JavaScript can't see what Python sees, the result can differ. Each
 * case is text a summary of an English report rarely holds:
 *
 * - Python's `\d` and `\b` also match non-ASCII digits and letters, and
 *   JavaScript's match ASCII only, so a figure written in other digits is
 *   not a claim here.
 * - `toLowerCase` and Python's `lower()` differ for a few characters
 *   outside ASCII, which only matters for a quote.
 * - The sources are split into lines at `\r\n`, `\r` and `\n`, where
 *   Python's `str.splitlines()` also splits at a few control characters.
 */

/** One source file: its name, as the report shows it, and its lines. */
export interface Source {
	name: string;
	lines: string[];
}

/** One claim the checker pulled out of a summary. */
export interface Claim {
	kind: 'quote' | 'reference' | 'figure';
	/** What the report shows. */
	label: string;
	/** What is looked up in the sources. */
	needle: string;
}

/** Where a claim was found: the file, the 1-based line number and the line. */
export interface Hit {
	name: string;
	number: number;
	line: string;
}

/** One entry of the report. */
export interface Entry {
	claim: Claim;
	hit: Hit | null;
}

/** The whole report. */
export interface Report {
	entries: Entry[];
	missing: number;
	/** The lines `check_claims.py` prints without `--missing`. */
	lines: string[];
}

const QUOTE = /"([^"]+)"/g;
const REFERENCE = /\b(?:article|section)\s+\d+(?:\(\d+\))?/gi;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const NEXT_WORD = /\s+([A-Za-z]+)/y;

/** A figure is shown with the word after it ("38 percent"), unless that word says nothing about what the number counts. */
const STOP_WORDS = new Set(['a', 'an', 'and', 'in', 'of', 'on', 'or', 'the', 'to']);

/** `squash`: lower-case the text and collapse every run of whitespace to one space. */
export function squash(text: string): string {
	return text.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/** Escape `text` for use inside a regular expression, as Python's `re.escape` does for the pattern. */
function reEscape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `find_claims`: every quote, reference and figure in `text`, in order of appearance. */
export function findClaims(text: string): Claim[] {
	const found: { start: number; claim: Claim }[] = [];
	const taken: [number, number][] = [];
	for (const m of text.matchAll(QUOTE)) {
		const quoted = m[1] ?? '';
		found.push({ start: m.index, claim: { kind: 'quote', label: `"${quoted}"`, needle: quoted } });
		taken.push([m.index, m.index + m[0].length]);
	}
	for (const m of text.matchAll(REFERENCE)) {
		found.push({ start: m.index, claim: { kind: 'reference', label: m[0], needle: m[0] } });
		taken.push([m.index, m.index + m[0].length]);
	}
	for (const m of text.matchAll(NUMBER)) {
		if (taken.some(([start, end]) => start <= m.index && m.index < end)) continue;
		let label = m[0];
		NEXT_WORD.lastIndex = m.index + m[0].length;
		const after = NEXT_WORD.exec(text);
		const word = after?.[1];
		if (word !== undefined && !STOP_WORDS.has(word.toLowerCase())) label += ` ${word}`;
		found.push({ start: m.index, claim: { kind: 'figure', label, needle: m[0] } });
	}
	// Two claims never start at one position: a quote starts with ", a reference with a letter and a figure with a digit.
	found.sort((a, b) => a.start - b.start);
	return found.map((f) => f.claim);
}

/** `matcher`: a test that says whether one source line supports the claim. */
export function matcher(claim: Claim): (line: string) => boolean {
	if (claim.kind === 'quote') {
		const wanted = squash(claim.needle);
		return (line) => squash(line).includes(wanted);
	}
	if (claim.kind === 'reference') {
		const pattern = new RegExp(claim.needle.split(/\s+/).filter(Boolean).map(reEscape).join('\\s+'), 'i');
		return (line) => pattern.test(line);
	}
	const digits = claim.needle.replaceAll(',', '');
	const pattern = new RegExp(`(?<![\\d,.])${[...digits].map(reEscape).join(',?')}(?![\\d,.]\\d)`);
	return (line) => pattern.test(line);
}

/** One source from a file's text, split into lines the way `str.splitlines()` splits them for this text. */
export function source(name: string, text: string): Source {
	const lines = text.split(/\r\n|\r|\n/);
	if (lines[lines.length - 1] === '') lines.pop();
	return { name, lines };
}

/** `look_up`: the first file, line number and line that supports the claim, or null. Sources are searched in name order. */
export function lookUp(claim: Claim, sources: readonly Source[]): Hit | null {
	const supports = matcher(claim);
	const ordered = [...sources].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	for (const { name, lines } of ordered) {
		const index = lines.findIndex(supports);
		if (index >= 0) return { name, number: index + 1, line: lines[index] ?? '' };
	}
	return null;
}

/** `report`: every claim in `summary` with where it was found, and the lines the Python checker prints. */
export function check(summary: string, sources: readonly Source[]): Report {
	const claims = findClaims(summary);
	if (claims.length === 0)
		return { entries: [], missing: 0, lines: ['no quotes, references or figures found in the summary'] };
	const entries = claims.map((claim) => ({ claim, hit: lookUp(claim, sources) }));
	const lines: string[] = [];
	let missing = 0;
	for (const { claim, hit } of entries) {
		if (hit === null) {
			missing += 1;
			lines.push(`NO SOURCE  ${claim.label}`);
		} else {
			lines.push(`found      ${claim.label}`);
			lines.push(`           ${hit.name}:${hit.number}  ${hit.line}`);
		}
	}
	lines.push(`${missing} of ${claims.length} claims have no source`);
	return { entries, missing, lines };
}
