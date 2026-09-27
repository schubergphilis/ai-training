/**
 * The toy model of the repeated-runs widget against `sample.py`. The
 * expected reports are the lines `sampled.py`, `checked.py` and `jitter.py`
 * print, so a change to the format that makes the widget and the lesson's
 * text fences disagree fails here. The draws are driven by fixed random
 * numbers.
 */
import {
	CANDIDATES,
	gauss,
	JITTER,
	passes,
	pick,
	probabilities,
	RUNS,
	report,
	runMany,
} from '@scripts/repeated-runs-logic';
import { describe, expect, it } from 'vitest';

/** The ten answers of the recorded run at temperature 1.0 (seed 51 in `sample.py`). */
const RECORDED = [
	'Canberra',
	'Canberra.',
	'Canberra',
	'The capital of Australia is Canberra.',
	'Canberra',
	'Canberra.',
	"It's Canberra.",
	'Canberra',
	'Sydney',
	'The capital of Australia is Canberra.',
];

/** A random source that returns `values` in turn and then repeats the last one. */
function sequence(...values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

const scores = CANDIDATES.map(([, s]) => s);

describe('probabilities', () => {
	it('puts all of the probability on the top score at temperature 0 and below', () => {
		expect(probabilities(scores, 0)).toEqual([1, 0, 0, 0, 0]);
		expect(probabilities(scores, -1)).toEqual([1, 0, 0, 0, 0]);
	});
	it('sums to 1 and keeps the order of the scores above temperature 0', () => {
		const p = probabilities(scores, 1);
		expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
		expect([...p].sort((a, b) => b - a)).toEqual(p);
		expect(p[4]).toBeGreaterThan(0.02);
	});
	it('gives the lower candidates more of the probability at a higher temperature', () => {
		expect(probabilities(scores, 1.5)[4]).toBeGreaterThan(probabilities(scores, 0.3)[4] ?? 1);
	});
});

describe('gauss', () => {
	it('is zero when the first uniform number is 0, and scales with sd', () => {
		expect(gauss(sequence(0, 0.3), JITTER)).toBe(0);
		const a = gauss(sequence(0.5, 0), 1);
		expect(gauss(sequence(0.5, 0), 2)).toBeCloseTo(2 * a, 12);
		expect(a).toBeCloseTo(Math.sqrt(-2 * Math.log(0.5)), 12);
	});
});

describe('pick', () => {
	it('takes the top candidate at temperature 0, whatever the draw', () => {
		expect(pick(sequence(0.999), 0, false)).toBe('Canberra');
		expect(pick(sequence(0), 0, false)).toBe('Canberra');
	});
	it('walks the candidates in order and takes the first whose running total passes the draw', () => {
		expect(pick(sequence(0), 1, false)).toBe('Canberra');
		expect(pick(sequence(0.9999), 1, false)).toBe('Sydney');
	});
	it('takes the last candidate when rounding leaves the draw above the running total', () => {
		expect(pick(sequence(1), 1, false)).toBe('Sydney');
	});
	it('shakes the scores with jitter, so a near tie can swap at temperature 0', () => {
		// Two uniform numbers per score, then the draw. The second pair shakes "Canberra." up by
		// 1.6 sd (0.64), past the 3.0 of "Canberra", and the other pairs shake by 0.
		const shakes = [0, 0, 1 - Math.exp(-(1.6 ** 2) / 2), 0, 0, 0, 0, 0, 0, 0, 0.5];
		expect(pick(sequence(...shakes), 0, true)).toBe('Canberra.');
		expect(pick(sequence(0, 0), 0, true)).toBe('Canberra');
	});
});

describe('passes', () => {
	it('accepts any wording that names Canberra, in any case, and rejects the rest', () => {
		expect(passes("It's Canberra.")).toBe(true);
		expect(passes('CANBERRA')).toBe(true);
		expect(passes('Sydney')).toBe(false);
	});
});

describe('report', () => {
	it('prints the lines sampled.py prints for the recorded runs', () => {
		const r = report(RECORDED, { temperature: 1, jitter: false, check: false });
		expect([r.heading, ...r.lines.map((l) => l.text), ...r.summary]).toEqual([
			'What is the capital of Australia? (temperature 1.0, 10 runs)',
			' 1  Canberra',
			' 2  Canberra.',
			' 3  Canberra',
			' 4  The capital of Australia is Canberra.',
			' 5  Canberra',
			' 6  Canberra.',
			" 7  It's Canberra.",
			' 8  Canberra',
			' 9  Sydney',
			'10  The capital of Australia is Canberra.',
			'4 of 10 runs give the same answer as run 1',
		]);
		expect(r.lines.every((l) => l.ok)).toBe(true);
	});
	it('prints the lines checked.py prints for the recorded runs, and marks the failed one', () => {
		const r = report(RECORDED, { temperature: 1, jitter: false, check: true });
		expect(r.lines[0]?.text).toBe(' 1  pass  Canberra');
		expect(r.lines[8]).toEqual({ text: ' 9  FAIL  Sydney', ok: false });
		expect(r.lines[9]?.text).toBe('10  pass  The capital of Australia is Canberra.');
		expect(r.summary).toEqual([
			'4 of 10 runs give the same answer as run 1',
			'9 of 10 runs pass the check: the answer names Canberra',
		]);
	});
	it('writes temperature 0 with one decimal, as jitter.py does', () => {
		expect(report(['Canberra'], { temperature: 0, jitter: true, check: false }).heading).toBe(
			'What is the capital of Australia? (temperature 0.0, 1 runs)',
		);
	});
});

describe('runMany', () => {
	it('makes ten runs, all the same at temperature 0 without jitter', () => {
		const r = runMany(Math.random, { temperature: 0, jitter: false, check: false });
		expect(r.lines).toHaveLength(RUNS);
		expect(r.summary).toEqual(['10 of 10 runs give the same answer as run 1']);
	});
	it('takes the number of runs', () => {
		expect(runMany(sequence(0), { temperature: 1, jitter: false, check: true }, 3).summary).toEqual([
			'3 of 3 runs give the same answer as run 1',
			'3 of 3 runs pass the check: the answer names Canberra',
		]);
	});
});
