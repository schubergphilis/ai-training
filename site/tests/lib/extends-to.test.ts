import {
	checkExtendsToHref,
	checkExternalSourceHref,
	isExternalHref,
	isRootRelative,
	isUnderUrl,
} from '@lib/extends-to';
import { describe, expect, it } from 'vitest';

const sources: [string, string | null | undefined][] = [
	['Academy ai-capabilities-and-limitations', 'https://academy.claude.com/courses/ai-capabilities-and-limitations'],
	['Diátaxis', 'https://diataxis.fr/'],
	['No url', null],
	['Empty url', ''],
];

describe('isExternalHref', () => {
	it('is true for https:// and false for a path or http://', () => {
		expect(isExternalHref('https://academy.claude.com/')).toBe(true);
		expect(isExternalHref('/safety/agent-risk/')).toBe(false);
		expect(isExternalHref('http://academy.claude.com/')).toBe(false);
	});
});

describe('isRootRelative', () => {
	it('is true for one leading slash and false for a protocol-relative URL', () => {
		expect(isRootRelative('/safety/agent-risk/')).toBe(true);
		expect(isRootRelative('//evil.example/x')).toBe(false);
		expect(isRootRelative('safety/')).toBe(false);
	});
});

describe('isUnderUrl', () => {
	it('matches the url itself, with or without a trailing slash', () => {
		expect(isUnderUrl('https://diataxis.fr', 'https://diataxis.fr/')).toBe(true);
		expect(isUnderUrl('https://diataxis.fr/', 'https://diataxis.fr')).toBe(true);
	});
	it('matches a path, query or fragment under the url', () => {
		expect(isUnderUrl('https://diataxis.fr/tutorials/', 'https://diataxis.fr/')).toBe(true);
		expect(isUnderUrl('https://diataxis.fr/?x=1', 'https://diataxis.fr/')).toBe(true);
		expect(isUnderUrl('https://diataxis.fr/#top', 'https://diataxis.fr/')).toBe(true);
		expect(isUnderUrl('https://academy.claude.com/courses/x/lessons/1', 'https://academy.claude.com/courses/x')).toBe(
			true,
		);
	});
	it('rejects a longer host, another scheme, a path that is only a string prefix, and an empty url', () => {
		expect(isUnderUrl('https://diataxis.fr.evil/', 'https://diataxis.fr/')).toBe(false);
		expect(isUnderUrl('http://diataxis.fr/', 'https://diataxis.fr/')).toBe(false);
		expect(isUnderUrl('https://academy.claude.com/courses/x-y', 'https://academy.claude.com/courses/x')).toBe(false);
		expect(isUnderUrl('https://diataxis.fr/', '')).toBe(false);
	});
	it('resolves ../ segments before comparing, so they cannot leave the prefix', () => {
		expect(isUnderUrl('https://academy.claude.com/courses/x/../y', 'https://academy.claude.com/courses/x')).toBe(false);
		expect(isUnderUrl('https://academy.claude.com/courses/x/a/../b', 'https://academy.claude.com/courses/x')).toBe(
			true,
		);
	});
});

describe('isUnderUrl with a query in the url', () => {
	const video = 'https://www.youtube.com/watch?v=abc';
	it('rejects a YouTube href with another v', () => {
		expect(isUnderUrl('https://www.youtube.com/watch?v=xyz', video)).toBe(false);
	});
	it('accepts a YouTube href with the same v and an extra t, in either order', () => {
		expect(isUnderUrl('https://www.youtube.com/watch?v=abc&t=30', video)).toBe(true);
		expect(isUnderUrl('https://www.youtube.com/watch?t=30&v=abc', video)).toBe(true);
	});
	it('rejects an href without the query, or with the parameter but no value', () => {
		expect(isUnderUrl('https://www.youtube.com/watch', video)).toBe(false);
		expect(isUnderUrl('https://www.youtube.com/watch?v=', video)).toBe(false);
		expect(isUnderUrl('https://www.youtube.com/watch?V=abc', video)).toBe(false);
	});
	it('rejects a parameter repeated with another value on either side', () => {
		expect(isUnderUrl('https://www.youtube.com/watch?v=abc&v=xyz', video)).toBe(false);
		expect(isUnderUrl('https://www.youtube.com/watch?v=abc', 'https://www.youtube.com/watch?v=abc&v=xyz')).toBe(false);
		expect(isUnderUrl('https://www.youtube.com/watch?v=xyz&v=abc', 'https://www.youtube.com/watch?v=abc&v=xyz')).toBe(
			true,
		);
	});
	it('compares values after percent-decoding', () => {
		expect(isUnderUrl('https://www.youtube.com/watch?v=%61bc', video)).toBe(true);
		expect(isUnderUrl('https://example.com/s?q=a+b', 'https://example.com/s?q=a%20b')).toBe(true);
	});
	it('ignores the fragment and still applies the path rule', () => {
		expect(isUnderUrl('https://www.youtube.com/watch?v=abc#t=30', video)).toBe(true);
		expect(isUnderUrl('https://www.youtube.com/watch#v=abc', video)).toBe(false);
		expect(isUnderUrl('https://www.youtube.com/watchlater?v=abc', video)).toBe(false);
	});
});

describe('checkExtendsToHref', () => {
	it('accepts a root-relative path without looking at the bibliography', () => {
		expect(checkExtendsToHref('/safety/agent-risk/', [])).toEqual({ kind: 'internal' });
	});
	it('accepts an https:// href under a bibliography url and names the source', () => {
		expect(checkExtendsToHref('https://academy.claude.com/courses/ai-capabilities-and-limitations', sources)).toEqual({
			kind: 'external',
			source: 'Academy ai-capabilities-and-limitations',
		});
	});
	it('rejects an https:// href no bibliography entry covers', () => {
		const result = checkExtendsToHref('https://academy.claude.com/courses/other', sources);
		expect(result.kind).toBe('invalid');
		expect(result).toMatchObject({ reason: expect.stringContaining('bibliography.yaml') });
	});
	it('rejects a protocol-relative URL, a relative path, an http:// URL and another scheme', () => {
		for (const href of ['//diataxis.fr/', 'safety/agent-risk/', 'http://diataxis.fr/', 'mailto:a@b.example']) {
			const result = checkExtendsToHref(href, sources);
			expect(result.kind).toBe('invalid');
			expect(result).toMatchObject({ reason: expect.stringContaining('https://') });
		}
	});
	it('names the field in the error, extends-to by default', () => {
		expect(checkExtendsToHref('nope', sources)).toMatchObject({ reason: expect.stringMatching(/^extends-to href/) });
		expect(checkExtendsToHref('nope', sources, 'covered-by')).toMatchObject({
			reason: expect.stringMatching(/^covered-by href/),
		});
	});
	it('skips a source without a url', () => {
		expect(checkExtendsToHref('https://nowhere.example/', sources).kind).toBe('invalid');
	});
});

describe('checkExternalSourceHref', () => {
	it('accepts an https:// href under a bibliography url and names the source', () => {
		expect(checkExternalSourceHref('https://diataxis.fr/tutorials/', sources, 'covered-by')).toEqual({
			kind: 'external',
			source: 'Diátaxis',
		});
	});
	it('rejects a root-relative path, since the field wants an external course', () => {
		expect(checkExternalSourceHref('/safety/agent-risk/', sources, 'covered-by')).toEqual({
			kind: 'invalid',
			reason: 'covered-by href must be an https:// URL, got /safety/agent-risk/',
		});
	});
	it('rejects a protocol-relative URL and an http:// URL', () => {
		for (const href of ['//diataxis.fr/', 'http://diataxis.fr/']) {
			expect(checkExternalSourceHref(href, sources, 'covered-by')).toEqual({
				kind: 'invalid',
				reason: `covered-by href must be an https:// URL, got ${href}`,
			});
		}
	});
	it('rejects an https:// href no bibliography entry covers, naming the field', () => {
		expect(checkExternalSourceHref('https://nowhere.example/', sources, 'covered-by')).toMatchObject({
			kind: 'invalid',
			reason: expect.stringMatching(/^covered-by href .* bibliography\.yaml$/),
		});
	});
});
