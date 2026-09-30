/**
 * The simulated ranker of the bias-in-patterns widget against `rank.py`.
 * `RUN_1`, `RUN_2` and `TOTALS` are the lines `both_runs.py` prints, which
 * the lesson page shows in a `text` fence, so a change to the ranking or
 * the format that makes the widget and the page disagree fails here.
 */
import {
	assignNames,
	DEFAULT_BONUS,
	fairScore,
	groupOf,
	LIST_A,
	LIST_B,
	MAX_BONUS,
	RECORDS,
	rank,
	rankBoth,
	rankingLines,
	SHORTLIST,
	slantedScore,
	tally,
	totalsLine,
} from '@scripts/bias-in-patterns-ranker-logic';
import { describe, expect, it } from 'vitest';

/** Run 1 as `both_runs.py` prints it. */
const RUN_1 = [
	'Run 1',
	'   1. shortlist  score 24  Arvel Dunmoor   list A  (experience 7, certificates 2, gap 3)',
	'   2. shortlist  score 23  Fenwick Sabani  list A  (experience 7, certificates 2, gap 4)',
	'   3. shortlist  score 18  Pell Varnava    list B  (experience 6, certificates 1, gap 2)',
	'   4. shortlist  score 17  Brisa Okonde    list A  (experience 6, certificates 0, gap 3)',
	'   5. shortlist  score 16  Nadir Kesrou    list B  (experience 5, certificates 1, gap 1)',
	'   6. shortlist  score 16  Corin Halvane   list A  (experience 5, certificates 0, gap 1)',
	'   7.            score 15  Rashon Belka    list B  (experience 4, certificates 2, gap 1)',
	'   8.            score 14  Quilla Tallent  list B  (experience 4, certificates 1, gap 0)',
	'   9.            score 13  Dessa Tesfay    list A  (experience 4, certificates 1, gap 3)',
	'  10.            score 11  Oriel Morrow    list B  (experience 3, certificates 2, gap 2)',
	'  11.            score 10  Marisel Adair   list B  (experience 4, certificates 1, gap 4)',
	'  12.            score  9  Elior Vance     list A  (experience 2, certificates 2, gap 3)',
	'  shortlisted: list A 4, list B 2',
];

/** Run 2 as `both_runs.py` prints it. */
const RUN_2 = [
	'Run 2: the same records, names swapped',
	'   1. shortlist  score 22  Marisel Adair   list B  (experience 7, certificates 2, gap 3)',
	'   2. shortlist  score 21  Rashon Belka    list B  (experience 7, certificates 2, gap 4)',
	'   3. shortlist  score 20  Dessa Tesfay    list A  (experience 6, certificates 1, gap 2)',
	'   4. shortlist  score 18  Brisa Okonde    list A  (experience 5, certificates 1, gap 1)',
	'   5. shortlist  score 17  Fenwick Sabani  list A  (experience 4, certificates 2, gap 1)',
	'   6. shortlist  score 16  Elior Vance     list A  (experience 4, certificates 1, gap 0)',
	'   7.            score 15  Nadir Kesrou    list B  (experience 6, certificates 0, gap 3)',
	'   8.            score 14  Oriel Morrow    list B  (experience 5, certificates 0, gap 1)',
	'   9.            score 13  Corin Halvane   list A  (experience 3, certificates 2, gap 2)',
	'  10.            score 12  Arvel Dunmoor   list A  (experience 4, certificates 1, gap 4)',
	'  11.            score 11  Pell Varnava    list B  (experience 4, certificates 1, gap 3)',
	'  12.            score  7  Quilla Tallent  list B  (experience 2, certificates 2, gap 3)',
	'  shortlisted: list A 4, list B 2',
];

/** The last line `both_runs.py` and `totals.py` print. */
const TOTALS = 'shortlisted over both runs: list A 8, list B 4';

describe('the ranker at the bonus rank.py fixes', () => {
	it('starts at 2 points, the LIST_A_BONUS of rank.py, and offers up to 6', () => {
		expect(DEFAULT_BONUS).toBe(2);
		expect(MAX_BONUS).toBe(6);
	});
	it('prints the lines both_runs.py prints', () => {
		expect(rankBoth()).toEqual({ runs: [RUN_1, RUN_2], totals: TOTALS });
		expect(rankBoth(DEFAULT_BONUS)).toEqual(rankBoth());
	});
});

describe('the ranker at other bonuses', () => {
	it('gives equal totals with no bonus, because both runs shortlist the same records', () => {
		const report = rankBoth(0);
		expect(report.totals).toBe('shortlisted over both runs: list A 6, list B 6');
		const shortlisted = (lines: string[]) =>
			lines.filter((line) => line.includes('shortlist  score')).map((line) => line.slice(line.indexOf('(')));
		expect(shortlisted(report.runs[0] ?? []).sort()).toEqual(shortlisted(report.runs[1] ?? []).sort());
	});
	it('has a tie at the shortlist line at 1 point in both runs and at 5 points in run 1 only', () => {
		const ties = [];
		for (let bonus = 0; bonus <= MAX_BONUS; bonus++) {
			for (const swapped of [false, true]) {
				const ranking = rank(assignNames(swapped), bonus);
				if (ranking[SHORTLIST - 1]?.score === ranking[SHORTLIST]?.score) ties.push([bonus, swapped ? 2 : 1]);
			}
		}
		expect(ties).toEqual([
			[1, 1],
			[1, 2],
			[5, 1],
		]);
	});
	it('shows one point in the totals, and a larger slant at 6 points', () => {
		expect(rankBoth(1).totals).toBe('shortlisted over both runs: list A 7, list B 5');
		for (const bonus of [3, 4, 5]) expect(rankBoth(bonus).totals).toBe(TOTALS);
		expect(rankBoth(6).totals).toBe('shortlisted over both runs: list A 9, list B 3');
	});
});

describe('the parts of the ranker', () => {
	it('knows which list a name is on', () => {
		expect(LIST_A.map(groupOf)).toEqual(Array(6).fill('A'));
		expect(LIST_B.map(groupOf)).toEqual(Array(6).fill('B'));
		expect(groupOf('Nobody')).toBe('B');
	});
	it('scores the fields, and adds the bonus to a list A name only', () => {
		expect(fairScore([7, 2, 3])).toBe(22);
		expect(slantedScore([7, 2, 3], 'Arvel Dunmoor', 2)).toBe(24);
		expect(slantedScore([7, 2, 3], 'Marisel Adair', 2)).toBe(22);
	});
	it('alternates the lists over the records, and swaps them', () => {
		expect(assignNames(false).slice(0, 4)).toEqual(['Arvel Dunmoor', 'Marisel Adair', 'Brisa Okonde', 'Nadir Kesrou']);
		expect(assignNames(true).slice(0, 4)).toEqual(['Marisel Adair', 'Arvel Dunmoor', 'Nadir Kesrou', 'Brisa Okonde']);
		expect(assignNames(false)).toHaveLength(RECORDS.length);
	});
	it('keeps record order on a tie', () => {
		const names = Array(RECORDS.length).fill('Marisel Adair');
		const ranking = rank(names, 0);
		// On the fields alone records 2 and 11 both score 15, and so do records 4 and 9 with 14.
		expect(ranking.filter((r) => r.score === 15).map((r) => r.index)).toEqual([2, 11]);
		expect(ranking.filter((r) => r.score === 14).map((r) => r.index)).toEqual([4, 9]);
	});
	it('counts only the shortlist', () => {
		const ranking = rank(assignNames(false), DEFAULT_BONUS);
		expect(tally(ranking)).toEqual({ A: 4, B: 2 });
		// The records below the line carry the other names: 4 of list B and 2 of list A.
		expect(tally(ranking.slice(SHORTLIST))).toEqual({ A: 2, B: 4 });
	});
	it('pads the position and the score as rank.py does', () => {
		const lines = rankingLines('T', [{ score: 7, index: 8, name: 'Quilla Tallent' }]);
		expect(lines).toEqual([
			'T',
			'   1. shortlist  score  7  Quilla Tallent  list B  (experience 2, certificates 2, gap 3)',
		]);
		expect(totalsLine({ A: 1, B: 2 }, { A: 3, B: 4 })).toBe('shortlisted over both runs: list A 4, list B 6');
	});
});
