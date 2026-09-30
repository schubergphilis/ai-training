/**
 * The simulated ranker of the bias-in-patterns ranker widget
 * (`widgets/BiasInPatternsRanker.astro`), a port of
 * `site/examples/safety/bias-in-patterns/rank.py`, which stays in CI as the
 * lesson's proof. Twelve made-up records are scored from their fields, a
 * name on list A gets a bonus, and the six best are shortlisted. The same
 * records are ranked twice, with the name lists swapped in the second run,
 * and the report counts the shortlist places per list.
 *
 * The widget prints the lines `rank.py` prints, in the same format, and
 * lets the learner set the bonus that `LIST_A_BONUS` fixes at 2 in the
 * Python program. No DOM access, so it runs under Node in the unit tests.
 */

/** `SHORTLIST` in `rank.py`: how many records make the shortlist. */
export const SHORTLIST = 6;

/** One candidate record: years of experience, certificates, and months since the last role (printed as `gap`). */
export type CandidateRecord = readonly [years: number, certificates: number, gapMonths: number];

/** `RECORDS` in `rank.py`. */
export const RECORDS: readonly CandidateRecord[] = [
	[7, 2, 3],
	[4, 1, 4],
	[6, 0, 3],
	[5, 1, 1],
	[5, 0, 1],
	[3, 2, 2],
	[4, 1, 3],
	[6, 1, 2],
	[2, 2, 3],
	[4, 1, 0],
	[7, 2, 4],
	[4, 2, 1],
];

/** `LIST_A` in `rank.py`. */
export const LIST_A: readonly string[] = [
	'Arvel Dunmoor',
	'Brisa Okonde',
	'Corin Halvane',
	'Dessa Tesfay',
	'Elior Vance',
	'Fenwick Sabani',
];

/** `LIST_B` in `rank.py`. */
export const LIST_B: readonly string[] = [
	'Marisel Adair',
	'Nadir Kesrou',
	'Oriel Morrow',
	'Pell Varnava',
	'Quilla Tallent',
	'Rashon Belka',
];

/** `LIST_A_BONUS` in `rank.py`: the bonus the page shows and the widget starts at. */
export const DEFAULT_BONUS = 2;

/** The highest bonus the widget's slider offers. */
export const MAX_BONUS = 6;

/** `group_of` in `rank.py`: the list a name belongs to. */
export function groupOf(name: string): 'A' | 'B' {
	return LIST_A.includes(name) ? 'A' : 'B';
}

/** `fair_score` in `rank.py`: the score from the record's fields only. */
export function fairScore([years, certificates, gapMonths]: CandidateRecord): number {
	return 3 * years + 2 * certificates - gapMonths;
}

/** `slanted_score` in `rank.py`: the fields plus `bonus` for a list A name. */
export function slantedScore(record: CandidateRecord, name: string, bonus: number): number {
	return fairScore(record) + (groupOf(name) === 'A' ? bonus : 0);
}

/** `assign_names` in `rank.py`: list A on even indexes and list B on odd ones, or the reverse when `swapped`. */
export function assignNames(swapped: boolean): string[] {
	const [first, second] = swapped ? [LIST_B, LIST_A] : [LIST_A, LIST_B];
	return RECORDS.map((_, index) => (index % 2 === 0 ? first : second)[Math.floor(index / 2)] ?? '');
}

/** One place in a ranking: the score, the index of the record in `RECORDS`, and the name it carried. */
export interface Ranked {
	score: number;
	index: number;
	name: string;
}

/** `rank` in `rank.py`: the records under `names`, best first. Ties keep record order. */
export function rank(names: readonly string[], bonus: number): Ranked[] {
	const scored = RECORDS.map((record, index) => {
		const name = names[index] ?? '';
		return { score: slantedScore(record, name, bonus), index, name };
	});
	return scored.sort((a, b) => b.score - a.score || a.index - b.index);
}

/** `tally` in `rank.py`: how many shortlisted names come from each list. */
export function tally(ranking: readonly Ranked[]): { A: number; B: number } {
	const counts = { A: 0, B: 0 };
	for (const { name } of ranking.slice(0, SHORTLIST)) counts[groupOf(name)] += 1;
	return counts;
}

/** A number right-aligned in two characters, as Python's `:2d` prints it. */
function pad2(n: number): string {
	return String(n).padStart(2);
}

/** `print_ranking` in `rank.py`: the title and one line per record, with a marker on the shortlist. */
export function rankingLines(title: string, ranking: readonly Ranked[]): string[] {
	const lines = [title];
	ranking.forEach(({ score, index, name }, i) => {
		const position = i + 1;
		const [years, certificates, gapMonths] = RECORDS[index] ?? [0, 0, 0];
		const marker = position <= SHORTLIST ? 'shortlist' : ' '.repeat(9);
		lines.push(
			`  ${pad2(position)}. ${marker}  score ${pad2(score)}  ${name.padEnd(15)} list ${groupOf(name)}` +
				`  (experience ${years}, certificates ${certificates}, gap ${gapMonths})`,
		);
	});
	return lines;
}

/** `totals_line` in `rank.py`: the shortlist places per list over both runs. */
export function totalsLine(run1: { A: number; B: number }, run2: { A: number; B: number }): string {
	return `shortlisted over both runs: list A ${run1.A + run2.A}, list B ${run1.B + run2.B}`;
}

/** What one press shows: the lines of each run, and the totals line. */
export interface RankerReport {
	runs: string[][];
	totals: string;
}

/** `main` in `rank.py` without `--totals`, at `bonus`: both rankings with their counts, and the totals. */
export function rankBoth(bonus: number = DEFAULT_BONUS): RankerReport {
	const ranking1 = rank(assignNames(false), bonus);
	const ranking2 = rank(assignNames(true), bonus);
	const run1 = tally(ranking1);
	const run2 = tally(ranking2);
	return {
		runs: [
			[...rankingLines('Run 1', ranking1), `  shortlisted: list A ${run1.A}, list B ${run1.B}`],
			[
				...rankingLines('Run 2: the same records, names swapped', ranking2),
				`  shortlisted: list A ${run2.A}, list B ${run2.B}`,
			],
		],
		totals: totalsLine(run1, run2),
	};
}
