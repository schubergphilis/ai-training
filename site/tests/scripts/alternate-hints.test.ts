import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { alternateHints, checkAlternateHints } from '../../scripts/lib/alternate-hints.mjs';

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
		expect(checkAlternateHints(root)).toEqual({ errors: [], hints: 1 });
	});
	it('rejects a hint that points at a file that does not exist', () => {
		const root = dist({ 'safety/index.html': page(`${ROOT}/safety/index.md`) });
		expect(checkAlternateHints(root).errors).toEqual([
			`safety/index.html: the Markdown alternate hint ${ROOT}/safety/index.md points at no file in dist`,
		]);
	});
	it("rejects a hint that points at another page's alternate", () => {
		const root = dist({
			'safety/index.html': page(`${ROOT}/concepts/index.md`),
			'concepts/index.md': '# C\n',
		});
		expect(checkAlternateHints(root).errors).toEqual([
			`safety/index.html: the Markdown alternate hint ${ROOT}/concepts/index.md is not this page's alternate, /safety/index.md`,
			'concepts/index.md: a Markdown alternate whose page has no head hint for it',
		]);
	});
	it('rejects a relative hint, two hints on a page, two site roots and an alternate without an H1', () => {
		const root = dist({
			'a/index.html': page('/ai-training/a/index.md'),
			'b/index.html': page(`${ROOT}/b/index.md`).replace(
				'</head>',
				`<link rel="alternate" type="text/markdown" href="${ROOT}/b/index.md"/></head>`,
			),
			'b/index.md': 'No title\n',
			'c/index.html': page('https://example.org/c/index.md'),
			'c/index.md': '# C\n',
		});
		expect(checkAlternateHints(root).errors).toEqual([
			'a/index.html: the Markdown alternate hint "/ai-training/a/index.md" is not an absolute URL',
			'b/index.html: 2 Markdown alternate hints, expected one',
			'b/index.md: a Markdown alternate starts with its H1 title',
			`Markdown alternate hints use 2 site roots: ${ROOT}, https://example.org`,
		]);
	});
});
