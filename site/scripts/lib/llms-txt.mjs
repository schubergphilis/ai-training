/**
 * The `llms.txt` check (spec S12 "`llms.txt`"), after `site-build`:
 * `dist/llms.txt` and `dist/llms-full.txt` exist and start with an H1, every
 * link in `llms.txt` is an absolute URL under `root` that points at a file in
 * `dist`, so an agent that follows one reaches a file the build wrote, except
 * the license links in `EXTERNAL_LINKS`, and every page's `index.html` and
 * `404.html` carry one `<link rel="describedby">` to `<root>llms.txt`
 * (S12 "Place").
 * `scripts/check-bundles.mjs` runs this; tests import it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { walk } from './data.mjs';

const LINK = /<link\b[^>]*>/gi;
const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;

/** The links `llms.txt` holds off the site: the two licenses of its license line (S12 "Layout"). */
export const EXTERNAL_LINKS = [
	'https://creativecommons.org/licenses/by-sa/4.0/',
	'https://www.apache.org/licenses/LICENSE-2.0',
];

/** An attribute of one `<link>` tag's source, or undefined. Astro writes attributes in double quotes. */
function attr(tag, name) {
	return new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];
}

/**
 * The `href` of every `<link rel="describedby">` in `html`, in order.
 * @param {string} html
 * @returns {string[]}
 */
export function describedByLinks(html) {
	return [...html.matchAll(LINK)]
		.map((m) => m[0])
		.filter((tag) => attr(tag, 'rel') === 'describedby')
		.map((tag) => attr(tag, 'href') ?? '');
}

/**
 * Every problem with `llms.txt`, `llms-full.txt` and the `describedby` links under `distDir`.
 * @param {string} distDir
 * @param {string} root the site root, such as `https://schubergphilis.github.io/ai-training/`
 * @returns {{ errors: string[], links: number }}
 */
export function checkLlmsTxt(distDir, root) {
	/** @type {string[]} */
	const errors = [];
	const base = `${root.replace(/\/$/, '')}/`;
	const index = join(distDir, 'llms.txt');
	let links = 0;
	if (!existsSync(index)) errors.push('llms.txt: not in dist');
	else {
		const text = readFileSync(index, 'utf8');
		if (!text.startsWith('# ')) errors.push('llms.txt: does not start with an H1 title');
		for (const [, url = ''] of text.matchAll(MARKDOWN_LINK)) {
			if (EXTERNAL_LINKS.includes(url)) continue;
			if (!url.startsWith(base)) {
				errors.push(`llms.txt: the link ${url} is not an absolute URL under the site root ${base}`);
				continue;
			}
			links += 1;
			const target = join(distDir, ...url.slice(base.length).split('/'));
			if (!existsSync(target)) errors.push(`llms.txt: the link ${url} points at no file in dist`);
		}
		if (links === 0) errors.push(`llms.txt: no link under the site root ${base}`);
	}
	const full = join(distDir, 'llms-full.txt');
	if (!existsSync(full)) errors.push('llms-full.txt: not in dist');
	else if (!readFileSync(full, 'utf8').startsWith('# ')) errors.push('llms-full.txt: does not start with an H1 title');
	const want = `${base}llms.txt`;
	if (!existsSync(join(distDir, '404.html'))) errors.push('404.html: not in dist');
	const pages = [...walk(distDir)].filter((p) => p.endsWith(`${sep}index.html`) || relative(distDir, p) === '404.html');
	for (const file of pages.sort()) {
		const hrefs = describedByLinks(readFileSync(file, 'utf8'));
		const rel = relative(distDir, file);
		if (hrefs.length !== 1 || hrefs[0] !== want)
			errors.push(`${rel}: expected one <link rel="describedby" href="${want}">, got ${JSON.stringify(hrefs)}`);
	}
	return { errors, links };
}
