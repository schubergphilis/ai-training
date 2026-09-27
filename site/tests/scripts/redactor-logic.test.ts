/**
 * The redaction widget's rules against what `redaction.py`, `redact.py`,
 * `check_partial.py` and `restore.py` print. The lesson samples are read
 * from `site/examples/` itself, and every expected text here is the Python
 * scripts' own output for the same files, so a change that makes the port
 * and the fixtures disagree fails here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leakLine, parseMap, redact, restore, runPass, stillIdentifying } from '@scripts/redactor-logic';
import { describe, expect, it } from 'vitest';

const SAMPLES = join(import.meta.dirname, '../../examples/safety/redact-before-you-paste/sample');
const sample = (name: string) => readFileSync(join(SAMPLES, name), 'utf8');

/** What `redact.py` prints. */
const REDACTED = `From: Person 1 <[email]>
To: support@norrbeck-appliances.example
Subject: Dishwasher still leaking after repair (account [account number])

Hello,

Your technician Person 2 came by on Tuesday to fix the leak in our
dishwasher, a Norrbeck D410. It worked for two days and now the water is
back under the sink. I leave for work at 7:30, so please call me on
[phone] before that, or write back. My account number is
[account number].

Kind regards,
Person 1
[address]
`;

/** What `restore.py` prints. */
const RESTORED = `Dear Renske Adelhof,

Thank you for letting us know, and I am sorry the leak came back so soon
after Tijmen Boskoorn's visit. We would like to send a technician again this
week, and we pay for the visit. Could you give us two time windows that
suit you, outside your morning departure? Until then, please keep the
water supply to the dishwasher closed.

Kind regards,
Norrbeck Appliances customer support
`;

function rows(text: string) {
	const parsed = parseMap(text);
	if (parsed.error !== null) throw new Error(parsed.error);
	return parsed.rows;
}

describe('parseMap', () => {
	it('reads one value => placeholder per line and skips blank lines', () => {
		expect(parseMap('Renske Adelhof => Person 1\n\n  Zwolle => [city]  \r\nNB-1 => [account]')).toEqual({
			rows: [
				{ value: 'Renske Adelhof', placeholder: 'Person 1' },
				{ value: 'Zwolle', placeholder: '[city]' },
				{ value: 'NB-1', placeholder: '[account]' },
			],
			error: null,
		});
	});
	it('splits at the first separator, as str.partition does', () => {
		expect(rows('a => b => c')).toEqual([{ value: 'a', placeholder: 'b => c' }]);
	});
	it('reports a line without a separator, as read_map does', () => {
		expect(parseMap('Zwolle => [city]\nZwolle -> [city]')).toEqual({
			rows: [],
			error: "map line without ' => ': Zwolle -> [city]",
		});
		expect(parseMap('Zwolle =>').error).toBe("map line without ' => ': Zwolle =>");
	});
	it('reads an empty map as no rows', () => {
		expect(parseMap('')).toEqual({ rows: [], error: null });
	});
});

describe('the lesson samples', () => {
	it('redacts the email with its map as redact.py prints it', () => {
		expect(redact(sample('email.txt'), rows(sample('email-map.txt')))).toBe(REDACTED);
	});
	it('finds the four details check_partial.py prints in the colleague version', () => {
		const labels = stillIdentifying(sample('partial.txt'), rows(sample('watch.txt')));
		expect(labels).toEqual(['initials', 'account number', 'city', 'technician']);
		expect(leakLine(labels)).toBe('still identifying: initials, account number, city, technician');
	});
	it('restores the reply as restore.py prints it', () => {
		expect(restore(sample('reply.txt'), rows(sample('email-map.txt')))).toBe(RESTORED);
	});
	it('leaves nothing of the ticket map on the ticket', () => {
		const map = rows(sample('map.txt'));
		const out = redact(sample('ticket.txt'), map);
		for (const { value } of map) expect(out).not.toContain(value);
		expect(out).toContain('Ticket [ticket number], Norrbeck Appliances customer support');
	});
});

describe('redact and restore', () => {
	it('replaces the longer value first, so a full name is replaced whole', () => {
		const map = [
			{ value: 'Renske', placeholder: '[first name]' },
			{ value: 'Renske Adelhof', placeholder: 'Person 1' },
		];
		expect(redact('Renske Adelhof, or Renske', map)).toBe('Person 1, or [first name]');
	});
	it('counts code points for the order, as len() does', () => {
		// '😀😀' is 4 UTF-16 units but 2 code points, so the three-letter value goes first.
		const map = [
			{ value: '😀😀', placeholder: 'X' },
			{ value: 'a😀😀', placeholder: 'Y' },
		];
		expect(redact('a😀😀 😀😀', map)).toBe('Y X');
	});
	it('keeps the map order for values of one length, as a stable sort does', () => {
		const ab = { value: 'ab', placeholder: 'X' };
		const bc = { value: 'bc', placeholder: 'Y' };
		expect(redact('abc', [ab, bc])).toBe('Xc');
		expect(redact('abc', [bc, ab])).toBe('aY');
	});
	it('restores the longer placeholder first, so Person 10 is not Person 1 and a 0', () => {
		const map = [
			{ value: 'Ana', placeholder: 'Person 1' },
			{ value: 'Bo', placeholder: 'Person 10' },
		];
		expect(restore('Person 10 and Person 1', map)).toBe('Bo and Ana');
	});
	it('replaces every occurrence', () => {
		expect(redact('x x x', [{ value: 'x', placeholder: 'y' }])).toBe('y y y');
	});
});

describe('stillIdentifying and leakLine', () => {
	it('lists the labels in watch-list order', () => {
		const watch = [
			{ value: 'Zwolle', placeholder: 'city' },
			{ value: 'R. A.', placeholder: 'initials' },
		];
		expect(stillIdentifying('R. A., Zwolle', watch)).toEqual(['city', 'initials']);
		expect(stillIdentifying('nothing', watch)).toEqual([]);
	});
	it('says so when no listed detail is left', () => {
		expect(leakLine([])).toBe('still identifying: none of the listed details');
	});
});

describe('runPass', () => {
	it('redacts, and checks the result against the watch list', () => {
		expect(runPass('redact', 'R. A. in Zwolle', 'Zwolle => [city]', 'R. A. => initials\nZwolle => city')).toEqual({
			text: 'R. A. in [city]',
			leaks: 'still identifying: initials',
			error: null,
		});
	});
	it('restores, and has no leak line without a watch list', () => {
		expect(runPass('restore', 'Dear Person 1', 'Ana => Person 1', null)).toEqual({
			text: 'Dear Ana',
			leaks: null,
			error: null,
		});
	});
	it('stops on a map line it cannot read', () => {
		expect(runPass('redact', 'text', 'Zwolle', null)).toEqual({
			text: null,
			leaks: null,
			error: "map line without ' => ': Zwolle",
		});
	});
	it('shows the text but no leak line when the watch list has a line it cannot read', () => {
		expect(runPass('redact', 'text', '', 'Zwolle')).toEqual({
			text: 'text',
			leaks: null,
			error: "watch list: line without ' => ': Zwolle",
		});
	});
});

describe('the map the lesson page shows in its exercise', () => {
	const PAGE = join(import.meta.dirname, '../../src/content/docs/safety/redact-before-you-paste.mdx');

	/** The body of every `text` fence in `src` whose lines are all map rows. */
	function mapFences(src: string): string[] {
		const fences = [...src.matchAll(/^```text\n([\s\S]*?)^```$/gm)].map((m) => m[1] ?? '');
		return fences.filter(
			(body) =>
				body.trim() !== '' &&
				body
					.trimEnd()
					.split('\n')
					.every((l) => l.includes(' => ')),
		);
	}

	it('is sample/map.txt, the map the ticket test above redacts with', () => {
		expect(mapFences(readFileSync(PAGE, 'utf8'))).toEqual([sample('map.txt')]);
	});
	it('fails when the page and the file drift apart', () => {
		const drifted = readFileSync(PAGE, 'utf8').replace('Zwolle => [city]\n', '');
		expect(drifted).not.toBe(readFileSync(PAGE, 'utf8'));
		expect(mapFences(drifted)).not.toEqual([sample('map.txt')]);
	});
});
