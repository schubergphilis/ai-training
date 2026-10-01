import { describe, expect, it } from 'vitest';
import {
	answerWords,
	checkPredictAnswers,
	isGradedPredict,
	missingAnswerWords,
} from '../../scripts/lib/predict-answers.mjs';

const predict = (over: Record<string, unknown> = {}) => ({
	id: 'p',
	lesson: 'a/x',
	kind: 'predict',
	context: 'The tool returns a fixed string per city.',
	stem: 'What does this print?\n\n```python\nprint(lookup("Lisbon"))\n```',
	answer: 'Lisbon: sun',
	reviewable: true,
	...over,
});

describe('answerWords', () => {
	it('splits on everything but letters, digits, _, -, . and /, and keeps only runs with a letter', () => {
		expect(answerWords("call_1 get_weather(city='Oslo') -> 6°C, snow 42 1.0.0 --no-verify")).toEqual([
			'call_1',
			'get_weather',
			'city',
			'Oslo',
			'C',
			'snow',
			'--no-verify',
		]);
	});
	it('drops leading and trailing dots and slashes, so a sentence end and a URL host match', () => {
		expect(answerWords('Done. See ./run.sh and https://collect.example/?c=1')).toEqual([
			'Done',
			'See',
			'run.sh',
			'and',
			'https',
			'collect.example',
			'c',
		]);
	});
});

describe('missingAnswerWords', () => {
	it('finds the answer words that neither the stem nor the context has', () => {
		expect(missingAnswerWords('Lisbon: 27°C, sun', 'print(lookup("Lisbon"))', 'A fixed string per city.')).toEqual([
			'C',
			'sun',
		]);
	});
	it('reads words from the code blocks of the stem and from the context', () => {
		expect(missingAnswerWords('error_max_turns in Oslo', '```\nerror_max_turns\n```', 'in Oslo')).toEqual([]);
	});
	it('compares case-sensitively, because the match is exact', () => {
		expect(missingAnswerWords('isError: False', 'print isError', 'it prints false')).toEqual(['False']);
	});
	it('skips an answer of numbers only', () => {
		expect(missingAnswerWords('3\n1133 0.004323 2.0', 'How many calls?', '')).toEqual([]);
	});
});

describe('isGradedPredict', () => {
	it('is true only for a reviewable predict with a string answer', () => {
		expect(isGradedPredict(predict())).toBe(true);
		expect(isGradedPredict(predict({ answer: null }))).toBe(false);
		expect(isGradedPredict(predict({ reviewable: false }))).toBe(false);
		expect(isGradedPredict(predict({ kind: 'repair' }))).toBe(false);
	});
});

describe('checkPredictAnswers', () => {
	it('warns with the file, the checkpoint id and the missing words', () => {
		expect(checkPredictAnswers([predict()])).toEqual([
			'a/x#p: the graded Predict\'s answer has words that are in neither its stem nor its context: "sun"',
		]);
	});
	it('passes an answer whose words are all in the stem or the context, and a numbers-only answer', () => {
		expect(checkPredictAnswers([predict({ answer: 'Lisbon: a fixed string' }), predict({ answer: '27' })])).toEqual([]);
	});
	it('skips an honor-system predict, review={false} and another kind', () => {
		const items = [
			predict({ answer: null }),
			predict({ reviewable: false }),
			predict({ kind: 'choice', answer: 'sun' }),
		];
		expect(checkPredictAnswers(items)).toEqual([]);
	});
	it('compares with the stem the caller passes', () => {
		expect(checkPredictAnswers([predict()], () => 'It prints Lisbon: sun')).toEqual([]);
	});
});
