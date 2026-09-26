/**
 * The format checker's rules against what `check_items.py` prints. Every
 * expected report here is the Python checker's own output for the same
 * text, run on python3 and python3.9 when the port was written, so a
 * change that makes the two disagree fails here. The three lesson samples
 * are read from `site/examples/` itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	type CheckerConfig,
	check,
	DEFAULT_CONFIG,
	isDate,
	parse,
	problems,
	pySplitLines,
	pyStr,
	pyStrip,
} from '@scripts/format-checker-logic';
import { describe, expect, it } from 'vitest';

const SAMPLES = join(import.meta.dirname, '../../examples/concepts/structured-output/sample');

/** The report as the lines the Python checker prints. */
function printed(text: string, config?: CheckerConfig): string[] {
	const report = check(text, config);
	return [...report.lines.map((l) => l.text), ...(report.summary === null ? [] : [report.summary])];
}

const PASSING = [
	'ok 1: Jonas, fix the password reset email address, 2026-10-03, high',
	'ok 2: Sam, get two quotes for a new search box, 2026-10-17, low',
	'ok 3: Maria, replace the old system name in the help texts, 2026-10-10, low',
	'ok 4: Dana, book the accessibility check with the agency, 2026-10-08, medium',
	'4 of 4 items pass',
];

describe('the lesson samples', () => {
	it('passes the one-line sample', () => {
		expect(printed(readFileSync(join(SAMPLES, 'lines.txt'), 'utf8'))).toEqual(PASSING);
	});
	it('passes the JSON sample with the same report', () => {
		expect(printed(readFileSync(join(SAMPLES, 'items.json'), 'utf8'))).toEqual(PASSING);
	});
	it('fails every item of the bare JSON sample, inside its code fence', () => {
		const report = check(readFileSync(join(SAMPLES, 'bare.json'), 'utf8'));
		expect(printed(readFileSync(join(SAMPLES, 'bare.json'), 'utf8'))).toEqual([
			'FAIL 1: missing owner, task, due (found assignee, action, deadline)',
			'FAIL 1: priority "urgent" is not one of high, low, medium',
			'FAIL 2: missing owner, task, due (found assignee, action, deadline)',
			'FAIL 2: priority "normal" is not one of high, low, medium',
			'FAIL 3: missing owner, task, due (found assignee, action, deadline)',
			'FAIL 3: priority "normal" is not one of high, low, medium',
			'FAIL 4: missing owner, task, due (found assignee, action, deadline)',
			'0 of 4 items pass',
		]);
		expect(report.lines.every((l) => !l.ok)).toBe(true);
		expect([report.passed, report.total]).toEqual([0, 4]);
	});
});

describe('the line format', () => {
	it('reads each non-empty line as an item and reports missing fields, bad dates and bad priorities', () => {
		const text =
			'owner: A | task: B | due: 2026-10-03 | priority: high\n\nowner: C | task | due: 2026-02-30 | priority: urgent';
		expect(printed(text)).toEqual([
			'ok 1: A, B, 2026-10-03, high',
			'FAIL 2: unnamed part "task" (every part needs a name: before its value)',
			'FAIL 2: missing task',
			'FAIL 2: due "2026-02-30" is not a date written as YYYY-MM-DD',
			'FAIL 2: priority "urgent" is not one of high, low, medium',
			'1 of 2 items pass',
		]);
	});
	it('reports an extra field and an empty one', () => {
		expect(printed('owner: A | task:  | due: 2026-10- 1 | priority: low | extra: x')).toEqual([
			'FAIL 1: unexpected extra',
			'FAIL 1: task is empty',
			'0 of 1 items pass',
		]);
	});
	it('splits a field at its first colon and takes a priority only in lower case', () => {
		expect(
			printed(
				'owner: A | task: t | due: 2026-1-012 | priority: low\nowner: A | task: t | due: 2026-10-1  | priority: Low\nowner: A:B | task: t | due: 20261003 | priority: low',
			),
		).toEqual([
			'FAIL 1: due "2026-1-012" is not a date written as YYYY-MM-DD',
			'FAIL 2: due "2026-10-1" is not a date written as YYYY-MM-DD',
			'FAIL 2: priority "Low" is not one of high, low, medium',
			'FAIL 3: due "20261003" is not a date written as YYYY-MM-DD',
			'0 of 3 items pass',
		]);
	});
	it('names the text in front of the first field', () => {
		expect(printed('- owner: A | task: t | due: 2026-10-03 | priority: high')).toEqual([
			'FAIL 1: missing owner (found - owner)',
			'0 of 1 items pass',
		]);
	});
	it("splits lines where Python's splitlines does", () => {
		expect(printed('owner: A\r\ntask: B\x1cdue: x\u2028priority: y')).toEqual([
			'FAIL 1: missing task, due, priority',
			'FAIL 2: missing owner, due, priority',
			'FAIL 3: missing owner, task, priority',
			'FAIL 3: due "x" is not a date written as YYYY-MM-DD',
			'FAIL 4: missing owner, task, due',
			'FAIL 4: priority "y" is not one of high, low, medium',
			'0 of 4 items pass',
		]);
	});
	it('strips the whitespace Python strips, such as an ideographic space', () => {
		expect(printed('\u3000owner: A | task: t | due: 2026-12-31 | priority: medium\u3000')).toEqual([
			'ok 1: A, t, 2026-12-31, medium',
			'1 of 1 items pass',
		]);
	});
});

describe('the JSON format', () => {
	it('reads a fenced array', () => {
		expect(printed('```json\n[{"owner": "A", "task": "t", "due": "2026-10-03", "priority": "high"}]\n```')).toEqual([
			'ok 1: A, t, 2026-10-03, high',
			'1 of 1 items pass',
		]);
	});
	it('prints non-string values the way Python str() does', () => {
		const text =
			'[{"owner": ["x"], "task": {"a": "b\'"}, "due": 20261003, "priority": null}, {"owner": true, "task": "", "due": "2026-10-03", "priority": "high"}]';
		expect(printed(text)).toEqual([
			'FAIL 1: due "20261003" is not a date written as YYYY-MM-DD',
			'FAIL 1: priority "None" is not one of high, low, medium',
			'FAIL 2: task is empty',
			'0 of 2 items pass',
		]);
	});
	it('keeps the last of two equal keys', () => {
		expect(printed('[{"owner": "A", "task": "t", "due": "2026-10-03", "priority": "high", "owner": "B"}]')).toEqual([
			'ok 1: B, t, 2026-10-03, high',
			'1 of 1 items pass',
		]);
	});
	it('fails a date with a trailing space', () => {
		expect(printed('[{"owner":"it\'s","task":"say \\"hi\\"\\n","due":"2026-12-31 ","priority":"high"}]')).toEqual([
			'FAIL 1: due "2026-12-31 " is not a date written as YYYY-MM-DD',
			'0 of 1 items pass',
		]);
	});
});

describe('file-level errors', () => {
	it.each([
		['', 'the answer is empty'],
		['   \n\n', 'the answer is empty'],
		['```\n```\n', 'the answer is empty'],
		['[]', 'no items found'],
		['{}', 'expected a JSON array of objects, got a JSON object with keys: '],
		['{"a": 1, "b": 2}', 'expected a JSON array of objects, got a JSON object with keys: a, b'],
		['[1, 2]', 'expected a JSON array of objects, one per item'],
		['Here you go:\n[{}]', 'the answer does not start with [ (is there text before the JSON?)'],
	])('reports %j as one FAIL line and no summary', (text, error) => {
		expect(printed(text)).toEqual([`FAIL: ${error}`]);
	});
	it('reports JSON that does not parse, with the browser message', () => {
		const report = check('[{]');
		expect(report.lines).toHaveLength(1);
		expect(report.lines[0]?.text).toMatch(/^FAIL: not valid JSON: ./);
		expect(report.summary).toBeNull();
	});
});

describe('isDate', () => {
	it.each([
		['2024-02-29', true],
		['2023-02-29', false],
		['1900-02-29', false],
		['2000-02-29', true],
		['2026-04-31', false],
		['2026-12-31', true],
		['0000-01-01', false],
		['0001-01-01', true],
		['2026-10- 1', true],
		['2026-13-01', false],
		['2026-00-10', false],
		['26-10-2026', false],
		['2026/10/03', false],
	])('%j is %s', (value, expected) => {
		expect(isDate(value)).toBe(expected);
	});
});

describe('the Python helpers', () => {
	it('pyStrip keeps a byte order mark, as Python does', () => {
		expect(pyStrip('\ufeff x \x1f')).toBe('\ufeff x');
	});
	it('pySplitLines drops the empty last line and returns nothing for ""', () => {
		expect(pySplitLines('')).toEqual([]);
		expect(pySplitLines('a\n')).toEqual(['a']);
		expect(pySplitLines('a\n\nb\u2028c')).toEqual(['a', '', 'b', 'c']);
	});
	it("pyStr quotes like Python's repr", () => {
		expect(pyStr('text')).toBe('text');
		expect(pyStr(['a', 1, 1.5, false, null])).toBe("['a', 1, 1.5, False, None]");
		expect(pyStr({ k: "it's" })).toBe("{'k': \"it's\"}");
		expect(pyStr(['a\'b"c\\\n\r\t\x01\x7f'])).toBe("['a\\'b\"c\\\\\\n\\r\\t\\x01\\x7f']");
	});
});

describe('another configuration', () => {
	const config: CheckerConfig = { fields: ['owner', 'status'], priorities: ['p1'] };
	it('checks the fields and priorities it is given', () => {
		expect(printed('owner: A | status: open', config)).toEqual(['ok 1: A, open', '1 of 1 items pass']);
		expect(printed('owner: A | priority: p2', config)).toEqual([
			'FAIL 1: missing status (found priority)',
			'FAIL 1: priority "p2" is not one of p1',
			'0 of 1 items pass',
		]);
	});
	it('parse and problems take the default configuration', () => {
		const { items } = parse('owner: A | task: t | due: 2026-10-03 | priority: high');
		expect(items).toHaveLength(1);
		expect(problems(items[0] as (typeof items)[number])).toEqual([]);
		expect(DEFAULT_CONFIG.fields).toEqual(['owner', 'task', 'due', 'priority']);
	});
});
