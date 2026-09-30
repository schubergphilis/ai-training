import { DEFAULT_REVISION, isPhase, isReviewable, KIND_OF_TAG, reviewAlternatesOf } from '@lib/checkpoint-rules';
import { jsonForScript } from '@lib/json';
import { absoluteUrl, href, siteRoot } from '@lib/url';
import { describe, expect, it } from 'vitest';

describe('checkpoint rules', () => {
	it('maps every component tag to its kind and knows the default revision', () => {
		expect(Object.keys(KIND_OF_TAG)).toHaveLength(8);
		expect(KIND_OF_TAG.MultiChoice).toBe('multi-choice');
		expect(KIND_OF_TAG.Match).toBe('match');
		expect(DEFAULT_REVISION).toBe(1);
	});
	it('repair and honor predicts are never reviewed; review={false} opts out; the rest are reviewed', () => {
		expect(isReviewable({ kind: 'repair' })).toBe(false);
		expect(isReviewable({ kind: 'predict', honor: true })).toBe(false);
		expect(isReviewable({ kind: 'predict' })).toBe(true);
		expect(isReviewable({ kind: 'choice', review: false })).toBe(false);
		expect(isReviewable({ kind: 'sort', review: true })).toBe(true);
		expect(isReviewable({ kind: 'order' })).toBe(true);
		expect(isReviewable({ kind: 'multi-choice' })).toBe(true);
		expect(isReviewable({ kind: 'match' })).toBe(true);
	});
	it('a practice checkpoint is never reviewed, and a review alternate follows the kind rule', () => {
		expect(isReviewable({ kind: 'choice', phase: 'practice' })).toBe(false);
		expect(isReviewable({ kind: 'choice', phase: 'review' })).toBe(true);
		expect(isReviewable({ kind: 'repair', phase: 'review' })).toBe(false);
		expect(isPhase('first')).toBe(true);
		expect(isPhase('later')).toBe(false);
	});
	it('lists the gradable review alternates with the same objective, in page order', () => {
		const cp = (id: string, objective: string, phase: 'first' | 'review' | 'practice', reviewable = true) => ({
			id,
			objective,
			phase,
			reviewable,
		});
		const all = [
			cp('own', 'o', 'first'),
			cp('alt-b', 'o', 'review'),
			cp('other', 'p', 'review'),
			cp('self-graded', 'o', 'review', false),
			cp('extra', 'o', 'practice', false),
			cp('alt-a', 'o', 'review'),
			cp('second', 'o', 'first'),
		];
		expect(reviewAlternatesOf(cp('own', 'o', 'first'), all)).toEqual(['alt-b', 'alt-a']);
		expect(reviewAlternatesOf(cp('x', 'q', 'first'), all)).toEqual([]);
	});
});

describe('jsonForScript', () => {
	it('escapes < so a value cannot close the script element', () => {
		const out = jsonForScript({ a: '</script><b>' });
		expect(out).not.toContain('</script>');
		expect(JSON.parse(out)).toEqual({ a: '</script><b>' });
	});
});

describe('href', () => {
	it('prefixes the deploy base and refuses relative paths', () => {
		expect(href('/progress/')).toBe('/ai-training/progress/');
		expect(() => href('progress/')).toThrow(/root-relative/);
		expect(absoluteUrl('/guides/tutor/', 'https://schubergphilis.github.io')).toBe(
			'https://schubergphilis.github.io/ai-training/guides/tutor/',
		);
		expect(absoluteUrl('/ai-training/guides/', 'https://schubergphilis.github.io/')).toBe(
			'https://schubergphilis.github.io/ai-training/guides/',
		);
		expect(absoluteUrl('/ai-training', 'https://schubergphilis.github.io')).toBe(
			'https://schubergphilis.github.io/ai-training',
		);
		expect(absoluteUrl('https://example.com/x', 'https://schubergphilis.github.io')).toBe('https://example.com/x');
		expect(absoluteUrl('mailto:a@b.c', 'https://schubergphilis.github.io')).toBe('mailto:a@b.c');
		expect(siteRoot('https://schubergphilis.github.io')).toBe('https://schubergphilis.github.io/ai-training');
		expect(siteRoot('https://schubergphilis.github.io/')).toBe('https://schubergphilis.github.io/ai-training');
		expect(() => absoluteUrl('guides/', 'https://schubergphilis.github.io')).toThrow(/root-relative/);
	});
});
