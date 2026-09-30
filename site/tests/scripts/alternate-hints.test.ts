import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { alternateHints, checkAlternateHints, hasNoAlternate } from '../../scripts/lib/alternate-hints.mjs';
import { SITE_ROOT } from '../../scripts/lib/site-address.mjs';

const ROOT = 'https://schubergphilis.github.io/ai-training';
const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const page = (href?: string) =>
	`<!doctype html><html><head><link rel="icon" href="/x.svg"/>${
		href ? `<link rel="alternate" type="text/markdown" href="${href}"/>` : ''
	}</head><body></body></html>`;

/** A temp dist tree with the given files, path to content. */
function dist(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), 'alternate-hints-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

describe('alternateHints', () => {
	it('reads the href of a text/markdown alternate link only', () => {
		expect(alternateHints(page(`${ROOT}/a/index.md`))).toEqual([`${ROOT}/a/index.md`]);
		expect(alternateHints(page())).toEqual([]);
		expect(alternateHints('<link rel="alternate" type="application/rss+xml" href="/feed.xml">')).toEqual([]);
	});
});

describe('checkAlternateHints', () => {
	it('passes a page whose hint points at its own alternate, and a page without one', () => {
		const root = dist({
			'safety/agent-risk/index.html': page(`${ROOT}/safety/agent-risk/index.md`),
			'safety/agent-risk/index.md': '# Title\n',
			'progress/index.html': page(),
		});
		expect(checkAlternateHints(root, ROOT)).toEqual({ errors: [], hints: 1 });
		// The site root as `site-address.mjs` exports it, with its trailing slash.
		expect(checkAlternateHints(root, SITE_ROOT)).toEqual({ errors: [], hints: 1 });
	});
	it('rejects a hint that points at a file that does not exist', () => {
		const root = dist({ 'safety/index.html': page(`${ROOT}/safety/index.md`) });
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			`safety/index.html: the Markdown alternate hint ${ROOT}/safety/index.md points at no file in dist`,
		]);
	});
	it("rejects a hint that points at another page's alternate", () => {
		const root = dist({
			'safety/index.html': page(`${ROOT}/concepts/index.md`),
			'concepts/index.md': '# C\n',
		});
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			`safety/index.html: the Markdown alternate hint ${ROOT}/concepts/index.md is not this page's alternate, /safety/index.md`,
			'concepts/index.md: a Markdown alternate whose page has no head hint for it',
		]);
	});
	it('rejects a relative hint, two hints on a page and an alternate without an H1', () => {
		const root = dist({
			'a/index.html': page('/ai-training/a/index.md'),
			'b/index.html': page(`${ROOT}/b/index.md`).replace(
				'</head>',
				`<link rel="alternate" type="text/markdown" href="${ROOT}/b/index.md"/></head>`,
			),
			'b/index.md': 'No title\n',
		});
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			'a/index.html: the Markdown alternate hint "/ai-training/a/index.md" is not an absolute URL',
			'b/index.html: 2 Markdown alternate hints, expected one',
			'b/index.md: a Markdown alternate starts with its H1 title',
		]);
	});
	it('rejects a hint on another origin or under another base, even when all hints agree', () => {
		const root = dist({
			'c/index.html': page('https://example.org/ai-training/c/index.md'),
			'd/index.html': page('https://schubergphilis.github.io/other/d/index.md'),
		});
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			`c/index.html: the Markdown alternate hint https://example.org/ai-training/c/index.md is not under the site root ${ROOT}`,
			`d/index.html: the Markdown alternate hint https://schubergphilis.github.io/other/d/index.md is not under the site root ${ROOT}`,
		]);
	});
	it('rejects a hint with a query or a fragment', () => {
		const root = dist({
			'e/index.html': page(`${ROOT}/e/index.md?v=1`),
			'f/index.html': page(`${ROOT}/f/index.md#top`),
			'e/index.md': '# E\n',
			'f/index.md': '# F\n',
		});
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			`e/index.html: the Markdown alternate hint ${ROOT}/e/index.md?v=1 is not this page's alternate, /e/index.md`,
			`f/index.html: the Markdown alternate hint ${ROOT}/f/index.md#top is not this page's alternate, /f/index.md`,
			'e/index.md: a Markdown alternate whose page has no head hint for it',
			'f/index.md: a Markdown alternate whose page has no head hint for it',
		]);
	});
	it('rejects a hint or an alternate on a page that spec S12 gives none', () => {
		const root = dist({
			'index.html': page(`${ROOT}/index.md`),
			'index.md': '# Home\n',
			'map/index.html': page(`${ROOT}/map/index.md`),
			'safety/review/index.html': page(),
			'safety/review/index.md': '# Review\n',
		});
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			'index.html: a page that spec S12 gives no Markdown alternate has an alternate hint',
			'map/index.html: a page that spec S12 gives no Markdown alternate has an alternate hint',
			'index.md: a page that spec S12 gives no Markdown alternate has one',
			'safety/review/index.md: a page that spec S12 gives no Markdown alternate has one',
		]);
	});
});

describe('checkAlternateHints on a page without a hint', () => {
	it('rejects a page S12 gives an alternate when it has no hint, and passes 404.html and the excluded pages', () => {
		const root = dist({
			'guides/forgotten/index.html': page(),
			'guides/review/index.html': page(),
			'404.html': page(),
			'index.html': page(),
			'map/index.html': page(),
			'safety/review/index.html': page(),
		});
		expect(checkAlternateHints(root, ROOT).errors).toEqual([
			'guides/forgotten/index.html: a page that spec S12 gives a Markdown alternate has no alternate hint',
			'guides/review/index.html: a page that spec S12 gives a Markdown alternate has no alternate hint',
		]);
	});
});

describe('hasNoAlternate', () => {
	it('names the pages S12 gives no alternate, and none that it gives one', () => {
		for (const dir of ['', 'map', 'competencies', 'progress', 'reference', 'settings', 'safety/review'])
			expect(hasNoAlternate(dir)).toBe(true);
		for (const dir of [
			'safety',
			'safety/agent-risk',
			'guides/tutor',
			'glossary',
			'contributing',
			'topics/safety/risk',
			'competencies/safety/judges-output',
			'guides/review',
		])
			expect(hasNoAlternate(dir)).toBe(false);
	});
	it('matches a review page under an area slug only', () => {
		expect(hasNoAlternate('safety/review', new Set(['concepts']))).toBe(false);
		expect(hasNoAlternate('concepts/review', new Set(['concepts']))).toBe(true);
	});
});
