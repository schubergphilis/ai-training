import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkLlmsTxt, describedByLinks } from '../../scripts/lib/llms-txt.mjs';
import { SITE_ROOT } from '../../scripts/lib/site-address.mjs';

const ROOT = 'https://schubergphilis.github.io/ai-training';
const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const page = (...hrefs: string[]) =>
	`<!doctype html><html><head>${hrefs.map((h) => `<link rel="describedby" href="${h}"/>`).join('')}</head></html>`;

/** A temp dist tree with the given files, path to content. */
function dist(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), 'llms-txt-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

const good = {
	'llms.txt': `# AI Training\n\n> S.\n\n[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)\n\n## Safety\n\n- [Safety](${ROOT}/safety/index.md): Safety.\n`,
	'llms-full.txt': '# Safety\n',
	'safety/index.md': '# Safety\n',
	'index.html': page(`${ROOT}/llms.txt`),
	'404.html': page(`${ROOT}/llms.txt`),
	'safety/index.html': page(`${ROOT}/llms.txt`),
};

describe('describedByLinks', () => {
	it('reads the href of each describedby link only', () => {
		expect(describedByLinks(page('a', 'b'))).toEqual(['a', 'b']);
		expect(describedByLinks('<link rel="alternate" href="x">')).toEqual([]);
	});
});

describe('checkLlmsTxt', () => {
	it('passes a dist whose llms.txt links resolve and whose pages each link to it', () => {
		expect(checkLlmsTxt(dist(good), ROOT)).toEqual({ errors: [], links: 1 });
		expect(checkLlmsTxt(dist(good), SITE_ROOT)).toEqual({ errors: [], links: 1 });
	});
	it('rejects a link that points at no file in dist', () => {
		const root = dist({ ...good, 'llms.txt': `${good['llms.txt']}- [Gone](${ROOT}/gone/index.md): x\n` });
		expect(checkLlmsTxt(root, ROOT).errors).toEqual([
			`llms.txt: the link ${ROOT}/gone/index.md points at no file in dist`,
		]);
	});
	it('rejects a dist without llms.txt or llms-full.txt', () => {
		const { 'llms.txt': _a, 'llms-full.txt': _b, ...rest } = good;
		expect(checkLlmsTxt(dist(rest), ROOT).errors).toEqual(['llms.txt: not in dist', 'llms-full.txt: not in dist']);
	});
	it('rejects an llms.txt with no link under the site root', () => {
		const root = dist({ ...good, 'llms.txt': '# AI Training\n' });
		expect(checkLlmsTxt(root, ROOT).errors).toEqual([`llms.txt: no link under the site root ${ROOT}/`]);
	});
	it('rejects a page without the describedby link, with two, or with a wrong one', () => {
		const root = dist({
			...good,
			'a/index.html': page(),
			'b/index.html': page(`${ROOT}/llms.txt`, `${ROOT}/llms.txt`),
			'c/index.html': page(`${ROOT}/other.txt`),
		});
		const want = `${ROOT}/llms.txt`;
		expect(checkLlmsTxt(root, ROOT).errors).toEqual([
			`a/index.html: expected one <link rel="describedby" href="${want}">, got []`,
			`b/index.html: expected one <link rel="describedby" href="${want}">, got ["${want}","${want}"]`,
			`c/index.html: expected one <link rel="describedby" href="${want}">, got ["${ROOT}/other.txt"]`,
		]);
	});
	it('rejects an llms.txt or llms-full.txt that does not start with an H1 title', () => {
		expect(checkLlmsTxt(dist({ ...good, 'llms.txt': `Intro\n${good['llms.txt']}` }), ROOT).errors).toEqual([
			'llms.txt: does not start with an H1 title',
		]);
		expect(checkLlmsTxt(dist({ ...good, 'llms-full.txt': 'Safety\n' }), ROOT).errors).toEqual([
			'llms-full.txt: does not start with an H1 title',
		]);
	});
	it('rejects a root-relative link and a link on another origin, and allows the two license links', () => {
		const extra =
			'- [Rel](/ai-training/safety/index.md): x\n- [Other](https://example.com/ai-training/safety/index.md): x\n';
		const root = dist({ ...good, 'llms.txt': `${good['llms.txt']}${extra}` });
		expect(checkLlmsTxt(root, ROOT).errors).toEqual([
			`llms.txt: the link /ai-training/safety/index.md is not an absolute URL under the site root ${ROOT}/`,
			`llms.txt: the link https://example.com/ai-training/safety/index.md is not an absolute URL under the site root ${ROOT}/`,
		]);
	});
	it('rejects a 404 page without the describedby link, and a dist without a 404 page', () => {
		expect(checkLlmsTxt(dist({ ...good, '404.html': page() }), ROOT).errors).toEqual([
			`404.html: expected one <link rel="describedby" href="${ROOT}/llms.txt">, got []`,
		]);
		const { '404.html': _gone, ...rest } = good;
		expect(checkLlmsTxt(dist(rest), ROOT).errors).toEqual(['404.html: not in dist']);
	});
});
