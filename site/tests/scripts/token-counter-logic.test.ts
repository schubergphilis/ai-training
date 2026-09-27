/**
 * The token counter's rules against what `count_tokens.py` and
 * `pages_per_window.py` print. Every expected report here is the Python
 * scripts' own output for the same input, run on python3 when the port was
 * written, so a change that makes the two disagree fails here. The lesson
 * sample is read from `site/examples/` itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countReport, countWords, estimateTokens, grouped, pagesReport } from '@scripts/token-counter-logic';
import { describe, expect, it } from 'vitest';

const SAMPLE = join(import.meta.dirname, '../../examples/concepts/context-window/sample/notes.txt');

describe('countReport', () => {
	it('prints the three lines count_tokens.py prints for the lesson sample', () => {
		expect(countReport(readFileSync(SAMPLE, 'utf8'))).toEqual([
			'characters: 460',
			'words: 80',
			'tokens (estimate): 115',
		]);
	});
	it('counts an empty text as zero of each', () => {
		expect(countReport('')).toEqual(['characters: 0', 'words: 0', 'tokens (estimate): 0']);
	});
	it('counts each punctuation mark as a token of its own', () => {
		expect(countReport('Hello, world!')).toEqual(['characters: 13', 'words: 2', 'tokens (estimate): 4']);
	});
	it('counts characters as code points, and long words, underscores and non-ASCII letters as Python does', () => {
		expect(countReport('internationalization _underscored_name ünïcödéwörd 12345678 😀 x')).toEqual([
			'characters: 63',
			'words: 6',
			'tokens (estimate): 13',
		]);
	});
	it('splits words on any run of whitespace, as str.split() does', () => {
		expect(countReport('  two\twords\n')).toEqual(['characters: 12', 'words: 2', 'tokens (estimate): 2']);
	});
});

describe('estimateTokens', () => {
	it('counts a word of up to six characters as one token and a longer one per four characters', () => {
		expect(estimateTokens('window')).toBe(1);
		expect(estimateTokens('windows')).toBe(2);
		expect(estimateTokens('delivery')).toBe(2);
		expect(estimateTokens('deliveries')).toBe(3);
	});
	it('counts a piece that starts with an underscore as one token, whatever its length', () => {
		expect(estimateTokens('_a_very_long_name')).toBe(1);
	});
});

describe('countWords', () => {
	it('is zero for whitespace only', () => {
		expect(countWords(' \n\t ')).toBe(0);
	});
});

describe('grouped', () => {
	it('writes the thousands the way Python f"{n:,}" does', () => {
		expect(grouped(0)).toBe('0');
		expect(grouped(999)).toBe('999');
		expect(grouped(1739)).toBe('1,739');
		expect(grouped(1_000_000)).toBe('1,000,000');
	});
});

describe('pagesReport', () => {
	it('prints the lines pages_per_window.py prints for the sample count', () => {
		expect(pagesReport(115)).toEqual([
			'one page: 115 tokens',
			'8,000-token window: 69 pages',
			'32,000-token window: 278 pages',
			'200,000-token window: 1,739 pages',
			'1,000,000-token window: 8,695 pages',
		]);
	});
	it('prints the numbers of the exercise example, a page of 750 tokens', () => {
		expect(pagesReport(750)).toEqual([
			'one page: 750 tokens',
			'8,000-token window: 10 pages',
			'32,000-token window: 42 pages',
			'200,000-token window: 266 pages',
			'1,000,000-token window: 1,333 pages',
		]);
	});
	it('writes the page count without grouping and a window too small as zero pages', () => {
		expect(pagesReport(1_000_001)).toEqual([
			'one page: 1000001 tokens',
			'8,000-token window: 0 pages',
			'32,000-token window: 0 pages',
			'200,000-token window: 0 pages',
			'1,000,000-token window: 0 pages',
		]);
	});
	it('prints the page line alone for an empty page, where the Python script divides by zero', () => {
		expect(pagesReport(0)).toEqual(['one page: 0 tokens']);
	});
});
