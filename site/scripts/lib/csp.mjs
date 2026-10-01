/**
 * The Content Security Policy of the site (issue #608) and its check.
 *
 * `astro.config.mjs` passes `CSP` to `security.csp`
 * (https://docs.astro.build/en/reference/configuration-reference/#securitycsp).
 * Astro then writes a `<meta http-equiv="content-security-policy">` into the
 * `<head>` of every page, with a `script-src` and a `style-src` that hold the
 * hashes of the scripts and styles Astro processes, next to the directives
 * listed here.
 *
 * Astro does not hash an `is:inline` script, and Starlight 0.42 renders five
 * of them on its pages (the theme provider, the theme picker update, the
 * search dialog opener, and the two sidebar scripts). Their hashes are listed
 * in `INLINE_SCRIPT_HASHES` and passed as `scriptDirective.hashes`
 * (https://docs.astro.build/en/reference/configuration-reference/#securitycspscriptdirectivehashes).
 * When a Starlight upgrade changes one of those scripts, `checkCsp` fails
 * and prints the new hash with the start of the script.
 *
 * Starlight's icons and Expressive Code's code blocks set inline `style`
 * attributes, so `style-src-attr` allows `'unsafe-inline'` (the
 * `kind: 'attribute'` form of
 * https://docs.astro.build/en/reference/configuration-reference/#securitycspstyledirectiveresources).
 * An attribute can only style its own element. Scripts get no
 * `'unsafe-inline'` and no `'unsafe-eval'`. The build prints two warnings
 * about this: one that Shiki needs inline styles, which the `style-src-attr`
 * source covers, and one that `'self'` in `style-src` does not reach
 * `style-src-attr`, which is intended.
 *
 * Search needs no `'wasm-unsafe-eval'`: Pagefind compiles its WebAssembly in
 * a worker it loads from the site (`pagefind-worker.js`), and a worker
 * loaded from a URL is not governed by the policy of the page that created it
 * (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy).
 * `e2e/csp.spec.ts` runs a search under the policy.
 *
 * `checkCsp` reads every built `.html` page under `site/dist` and reports a
 * problem when a page
 *
 * - has no CSP `<meta>` in its `<head>`, or more than one;
 * - has a policy without one of the `DIRECTIVES`, with `'unsafe-inline'`
 *   or `'unsafe-eval'` in `script-src`, or with `'unsafe-inline'` in
 *   `style-src`;
 * - has an inline `<script>` whose SHA-256 hash is not in its `script-src`,
 *   or an inline `<style>` whose hash is not in its `style-src`. A script
 *   with a `src` is skipped, and so is an `application/json` or
 *   `application/ld+json` data block, which the browser does not run. An
 *   import map or speculation rules script is checked, because the browser
 *   applies the policy to both;
 * - has an inline event handler attribute (`onclick=` and the like) on a
 *   tag outside a script or style, which no hash in `script-src` allows;
 * - has a `<script src>` or a `<link rel="stylesheet">` whose URL names a
 *   scheme or a host, anywhere in the page.
 *
 * A policy in a `<meta>` applies only to the content after it, and Astro
 * writes the meta at the end of `<head>`, after Starlight's head tags and its
 * theme script. Neither the Astro configuration reference nor Starlight's
 * `head` option can move it. So this check covers the start of `<head>`:
 * every inline script there must still be hashed, and no file there may come
 * from another site. The site's own URLs are root-relative (`/ai-training/...`).
 *
 * `scripts/check-bundles.mjs` runs it after the build, and
 * `tests/scripts/csp.test.ts` covers it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walk } from './data.mjs';

/**
 * The directives beyond `script-src` and `style-src`: the policy issue #608 starts from, plus `base-uri` and
 * `form-action`, which do not fall back to `default-src`. A `<base>` tag injected into a page could otherwise
 * point the page's relative script URLs at another site.
 * @type {(`default-src ${string}` | `connect-src ${string}` | `img-src ${string}` | `base-uri ${string}` | `form-action ${string}`)[]}
 */
export const DIRECTIVES = [
	"default-src 'self'",
	"connect-src 'self'",
	"img-src 'self' data:",
	"base-uri 'self'",
	"form-action 'self'",
];

/**
 * The SHA-256 hashes of Starlight's `is:inline` scripts, which Astro does not hash itself.
 * `checkCsp` prints the hash of a script that is missing here.
 */
export const INLINE_SCRIPT_HASHES = [
	// window.StarlightThemeProvider = ... (ThemeProvider.astro)
	'sha256-VWo5Wp4aqSj6nSgMpeAp9cKieaoIfwFUAunAVugI5gA=',
	// StarlightThemeProvider.updatePickers(); (ThemeSelect.astro)
	'sha256-GkZBRnvSuhtx/cvzvukVkX2JJZW+DdPlVr7BX8Tefqo=',
	// The search dialog opener (Search.astro)
	'sha256-f/zAUE74ucc3JYp4r4QQvkJofoQdkOIhHYK+jeZ6eko=',
	// The sidebar state restore and scroll position (SidebarPersister.astro)
	'sha256-wX2yOADeV+NMngflD5uYi3vl50SHC4sfM1EmylVjlX4=',
	'sha256-7eCV4jtsr4t4knb3c4FCRPeu7GGZeOUGE3XvWix0XOQ=',
];

/**
 * The `security.csp` value for `astro.config.mjs`.
 * @type {Exclude<NonNullable<NonNullable<import('astro').AstroUserConfig['security']>['csp']>, boolean>}
 */
export const CSP = {
	directives: DIRECTIVES,
	scriptDirective: { resources: ["'self'"], hashes: INLINE_SCRIPT_HASHES },
	styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
};

const META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;
const INLINE = /<(script|style)\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/\1\s*>/gi;
/** A start tag: its name and its attribute text, where a quoted value may hold a `>`. */
const TAG = /<([a-z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
/** One attribute of a start tag's attribute text: its name and its value, quoted or bare, if any. */
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
/** The script types a browser does not run, and so the policy does not apply to: JSON data blocks. */
const DATA_TYPE = /^application\/(ld\+)?json$/i;
/** A URL that names a scheme or a host (`https:`, `data:`, `//host`), so it can point off the site. */
const OFF_SITE = /^\s*([a-z][a-z0-9+.-]*:|\/\/|\\\\)/i;

/**
 * The attributes of a start tag's attribute text, name (lower case) to value (`''` when it has none).
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function attributes(text) {
	const found = new Map();
	for (const [, name, double, single, bare] of text.matchAll(ATTR)) {
		const key = name.toLowerCase();
		if (!found.has(key)) found.set(key, double ?? single ?? bare ?? '');
	}
	return found;
}

/** The `sha256-` source of `text`, as a CSP hash names it. */
export function sha256(text) {
	return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

/**
 * The directives of a policy string: name to its list of sources.
 * @param {string} policy
 * @returns {Map<string, string[]>}
 */
export function parsePolicy(policy) {
	const directives = new Map();
	for (const part of policy.split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/);
		if (name) directives.set(name.toLowerCase(), sources);
	}
	return directives;
}

/**
 * The problems of one built page.
 * @param {string} html
 * @returns {string[]}
 */
export function pageProblems(html) {
	const problems = [];
	const headEnd = html.search(/<\/head\s*>/i);
	const metas = [...html.matchAll(META)];
	if (metas.length === 0) return ['no Content Security Policy <meta>'];
	if (metas.length > 1) problems.push(`${metas.length} Content Security Policy <meta> tags, expected one`);
	if (headEnd === -1 || (metas[0].index ?? 0) > headEnd)
		problems.push('the Content Security Policy <meta> is not in <head>');
	const policy = parsePolicy(metas[0][1].replaceAll('&#39;', "'").replaceAll('&quot;', '"'));
	for (const directive of DIRECTIVES) {
		const [name, ...sources] = directive.split(' ');
		const have = policy.get(name) ?? [];
		if (!sources.every((s) => have.includes(s))) problems.push(`policy lacks "${directive}"`);
	}
	const scriptSrc = policy.get('script-src') ?? [];
	for (const bad of ["'unsafe-inline'", "'unsafe-eval'"]) {
		if (scriptSrc.includes(bad)) problems.push(`script-src allows ${bad}`);
	}
	const styleSrc = policy.get('style-src') ?? [];
	if (styleSrc.includes("'unsafe-inline'")) problems.push("style-src allows 'unsafe-inline'");
	for (const [, tag, attrText, body] of html.matchAll(INLINE)) {
		const kind = tag.toLowerCase();
		const attrs = attributes(attrText);
		if (kind === 'script' && (attrs.has('src') || DATA_TYPE.test((attrs.get('type') ?? '').trim()))) continue;
		const hash = sha256(body);
		const allowed = kind === 'script' ? scriptSrc : styleSrc;
		if (!allowed.includes(`'${hash}'`)) {
			const start = body.trim().replace(/\s+/g, ' ').slice(0, 60);
			problems.push(`inline <${kind}> not in ${kind}-src: '${hash}' "${start}"`);
		}
	}
	// The text of a script or style may hold markup in a string, which is no tag.
	const markup = html.replace(INLINE, '<$1$2>');
	for (const [, tag, attrText] of markup.matchAll(TAG)) {
		const name = tag.toLowerCase();
		const attrs = attributes(attrText);
		for (const attr of attrs.keys()) {
			if (/^on[a-z]+$/.test(attr)) problems.push(`inline event handler attribute ${attr}= on <${name}>`);
		}
		// Content before the meta is outside the policy, so an off-site file is rejected wherever it is.
		const src = name === 'script' ? attrs.get('src') : undefined;
		if (src !== undefined && OFF_SITE.test(src)) problems.push(`<script> loads an off-site file: ${src}`);
		const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
		const href = name === 'link' && rel.includes('stylesheet') ? attrs.get('href') : undefined;
		if (href !== undefined && OFF_SITE.test(href))
			problems.push(`<link rel="stylesheet"> loads an off-site file: ${href}`);
	}
	return problems;
}

/**
 * One problem per violation on every `.html` page under `distDir`.
 * @param {string} distDir
 * @returns {{ errors: string[], pages: number }}
 */
export function checkCsp(distDir) {
	const errors = [];
	let pages = 0;
	for (const file of [...walk(distDir)].filter((p) => p.endsWith('.html')).sort()) {
		pages += 1;
		for (const problem of pageProblems(readFileSync(file, 'utf8')))
			errors.push(`${relative(distDir, file)}: ${problem}`);
	}
	return { errors, pages };
}
