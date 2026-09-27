/**
 * The claim checker's rules against what `check_claims.py` prints. The
 * lesson's summaries and sources are read from `site/examples/` itself, and
 * every expected report and claim list here is the Python checker's own
 * output for the same text, run on python3 and python3.9 when the port was
 * written, so a change that makes the two disagree fails here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, findClaims, lookUp, matcher, source, squash } from '@scripts/claim-checker-logic';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '../../examples/safety/spotting-hallucination');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');
// Given in reverse name order, so the test also sees the checker search in name order.
const SOURCES = [source('report.txt', read('sources/report.txt')), source('minutes.txt', read('sources/minutes.txt'))];

/** What `check_claims.py sample/summary_1.txt` prints (the proof `all_claims.py`). */
const SUMMARY_1 = [
	'found      2025 review',
	'           minutes.txt:1  Council meeting, 12 June 2025, item 4: station cycle parking.',
	'found      890 bicycles',
	'           report.txt:3  On a weekday morning in March the team counted 890 bicycles parked at the station against 640 racks.',
	'found      640 racks',
	'           report.txt:3  On a weekday morning in March the team counted 890 bicycles parked at the station against 640 racks.',
	'found      Article 7(3)',
	'           report.txt:5  Article 7(3) of the Cycle Parking Ordinance sets a minimum of one rack per 100 boarding passengers.',
	'NO SOURCE  50 passengers',
	'NO SOURCE  38 percent',
	'found      2022',
	'           report.txt:7  Reported bicycle theft at the station fell by roughly a third between 2022 and 2024, after the covered section was locked at night.',
	'found      2024',
	'           report.txt:7  Reported bicycle theft at the station fell by roughly a third between 2022 and 2024, after the covered section was locked at night.',
	'found      300 racks',
	'           report.txt:8  The team recommends adding 300 racks, of which 120 covered, on the eastern forecourt.',
	'found      120 covered',
	'           report.txt:8  The team recommends adding 300 racks, of which 120 covered, on the eastern forecourt.',
	'NO SOURCE  9,000 passengers',
	'NO SOURCE  "Racks before car parks, every time."',
	'4 of 12 claims have no source',
];

describe('the lesson samples', () => {
	it('prints the report check_claims.py prints for the first summary', () => {
		const report = check(read('sample/summary_1.txt'), SOURCES);
		expect(report.lines).toEqual(SUMMARY_1);
		expect(report.missing).toBe(4);
		expect(report.entries.filter((e) => e.hit === null).map((e) => e.claim.label)).toEqual([
			'50 passengers',
			'38 percent',
			'9,000 passengers',
			'"Racks before car parks, every time."',
		]);
	});
	it('finds all but two claims of the second summary, the quote among them', () => {
		const report = check(read('sample/summary_2.txt'), SOURCES);
		expect(report.lines.filter((l) => l.startsWith('NO SOURCE'))).toEqual([
			'NO SOURCE  139 percent',
			'NO SOURCE  410,000',
		]);
		expect(report.lines).toContain('found      "We need racks before we need another car park."');
		expect(report.lines).toContain('found      7,200 boarding');
		expect(report.lines.at(-1)).toBe('2 of 12 claims have no source');
	});
});

describe('findClaims', () => {
	it('finds references, figures and quotes in order, and skips a figure inside a quote or a reference', () => {
		expect(findClaims('Section 12 says 1,500 cars. "hi 3 there" and article  7(3) in "x".')).toEqual([
			{ kind: 'reference', label: 'Section 12', needle: 'Section 12' },
			{ kind: 'figure', label: '1,500 cars', needle: '1,500' },
			{ kind: 'quote', label: '"hi 3 there"', needle: 'hi 3 there' },
			{ kind: 'reference', label: 'article  7(3)', needle: 'article  7(3)' },
			{ kind: 'quote', label: '"x"', needle: 'x' },
		]);
	});
	it('shows a figure without the next word when that word is a stop word or not a word', () => {
		expect(findClaims('About 40 of them and 12 the most and 3.5 percent at 2025.').map((c) => c.label)).toEqual([
			'40',
			'12',
			'3.5 percent',
			'2025',
		]);
	});
	it('finds nothing in a summary without specifics', () => {
		expect(findClaims('Nothing specific here.')).toEqual([]);
		expect(check('Nothing specific here.', SOURCES)).toEqual({
			entries: [],
			missing: 0,
			lines: ['no quotes, references or figures found in the summary'],
		});
	});
});

describe('matcher', () => {
	const figure = (needle: string) => matcher({ kind: 'figure', label: needle, needle });
	it('matches a figure with or without a thousands comma, as a whole number', () => {
		expect(figure('1500')('we saw 1,500 cars')).toBe(true);
		expect(figure('50')('1.50')).toBe(false);
		expect(figure('50')('50.5')).toBe(false);
		expect(figure('50')('end at 50.')).toBe(true);
	});
	it('copies the Python lookahead, which lets 1,500 match the start of 15000', () => {
		expect(figure('1,500')('15000')).toBe(true);
	});
	it('matches a reference with any case and any amount of whitespace', () => {
		expect(matcher({ kind: 'reference', label: '', needle: 'article  7(3)' })('Article 7(3) of')).toBe(true);
		expect(matcher({ kind: 'reference', label: '', needle: 'article 7(3)' })('Article 7(4) of')).toBe(false);
	});
	it('matches a quote ignoring case and whitespace', () => {
		expect(matcher({ kind: 'quote', label: '', needle: 'We  NEED racks' })('said "we need\tracks before')).toBe(true);
		expect(squash('  A \n b  ')).toBe('a b');
	});
});

describe('source and lookUp', () => {
	it('splits a source into lines without an empty last one', () => {
		expect(source('a.txt', 'one\r\ntwo\n')).toEqual({ name: 'a.txt', lines: ['one', 'two'] });
		expect(source('a.txt', '')).toEqual({ name: 'a.txt', lines: [] });
	});
	it('returns the first line in the first file by name, or null', () => {
		const sources = [source('b.txt', 'x 7 y'), source('a.txt', 'no\nhas 7 here')];
		const claim = { kind: 'figure' as const, label: '7', needle: '7' };
		expect(lookUp(claim, sources)).toEqual({ name: 'a.txt', number: 2, line: 'has 7 here' });
		expect(lookUp({ ...claim, needle: '8' }, sources)).toBeNull();
	});
});
