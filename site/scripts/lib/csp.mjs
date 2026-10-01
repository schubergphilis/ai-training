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
 * - has a `<script src>`, a `<base href>`, or a `<link>` whose `rel` makes
 *   the browser contact a server (`FETCHING_RELS`) with an `href` or an
 *   `imagesrcset` URL, whose URL does not resolve to the site's origin,
 *   anywhere in the page (`offSite`).
 *
 * A policy in a `<meta>` applies only to the content after it, and Astro
 * writes the meta at the end of `<head>`, after Starlight's head tags and its
 * theme script. Neither the Astro configuration reference nor Starlight's
 * `head` option can move it. So this check covers the start of `<head>`:
 * every inline script there must still be hashed, and no file there may come
 * from another site. The site's own URLs are root-relative (`/ai-training/...`).
 *
 * `offSite` resolves a URL the way the browser does before it loads one. It
 * decodes character references with the rule for attribute values in the
 * HTML Standard (https://html.spec.whatwg.org/multipage/parsing.html#named-character-reference-state).
 * A numeric reference counts without its `;` (`&#58`), and so does one of
 * the legacy named ones such as `&amp`, except before `=` or a letter or
 * digit. `decodeHTMLAttribute` of the `entities` package implements that.
 * The check then parses the decoded value with `new URL` against
 * `SITE_ROOT`. Node's `URL` follows the WHATWG URL Standard (https://url.spec.whatwg.org/#concept-basic-url-parser),
 * as browsers do: it strips leading and trailing C0 controls and spaces,
 * removes every tab and newline, and reads a `\` as a `/` in an `http:` or
 * `https:` URL. So `/\evil.example/a.js`, `https&#58;//evil.example` and
 * `ht<tab>tps://evil.example` all resolve to another site.
 *
 * `scripts/check-bundles.mjs` runs it after the build, and
 * `tests/scripts/csp.test.ts` covers it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { decodeHTMLAttribute } from 'entities';
import { walk } from './data.mjs';
import { SITE_ROOT } from './site-address.mjs';

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
/**
 * The `rel` tokens of a `<link>` that makes a browser contact the server its URL names, which the site
 * promises not to do (`SECURITY.md`). They are the external resource link types of the HTML Standard
 * (https://html.spec.whatwg.org/multipage/links.html#linkTypes), and five that browsers add. Chromium
 * fetches `prerender` as a NoState Prefetch (https://developer.chrome.com/docs/web-platform/prerender-pages)
 * and `compression-dictionary` as a shared compression dictionary
 * (https://developer.chrome.com/blog/shared-dictionary-compression). Safari fetches `apple-touch-icon` and `apple-touch-icon-precomposed`, which Safari fetches for
 * the home screen (https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
 * and `mask-icon`, its pinned tab icon (https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/pinnedTabs/pinnedTabs.html).
 * `dns-prefetch` and `preconnect` fetch no file, but they still contact the server.
 */
export const FETCHING_RELS = [
	'stylesheet',
	'icon',
	'apple-touch-icon',
	'apple-touch-icon-precomposed',
	'mask-icon',
	'manifest',
	'preload',
	'modulepreload',
	'prefetch',
	'dns-prefetch',
	'preconnect',
	'prerender',
	'compression-dictionary',
];

const SITE_URL = new URL(SITE_ROOT);

/**
 * Where the browser loads `raw`, an attribute value as it stands in the HTML, from, when that is not the site:
 * the resolved URL, or `undefined` when it is a site URL. A `data:` or `blob:` URL counts as off-site, because
 * it is no file of the site. A value `new URL` cannot parse, such as `https://[::1`, passes: the browser
 * fails to parse it too and loads nothing.
 * @param {string} raw
 * @returns {string | undefined}
 */
export function offSite(raw) {
	return offSiteDecoded(decodeHTMLAttribute(raw));
}

/**
 * `offSite` for a value whose character references are already decoded. Decoding happens once, as in the
 * browser, so `https&amp;#58;//` stays the text `https&#58;//`.
 * @param {string} value
 * @returns {string | undefined}
 */
function offSiteDecoded(value) {
	let url;
	try {
		url = new URL(value, SITE_ROOT);
	} catch {
		return undefined;
	}
	// A `blob:` URL has the origin of the URL inside it, so the scheme is compared too.
	return url.protocol === SITE_URL.protocol && url.origin === SITE_URL.origin ? undefined : url.href;
}

/**
 * The URLs of the image candidates in a decoded `srcset` or `imagesrcset` value, following "parse a srcset
 * attribute" in the HTML Standard (https://html.spec.whatwg.org/multipage/images.html#parse-a-srcset-attribute).
 * A URL is a run of characters without whitespace, so it may hold a comma (`data:a,b`); only commas at its
 * end are dropped. The descriptors after it run to the next comma outside parentheses. A candidate the
 * browser drops for a bad descriptor is still returned, which only makes the check stricter.
 * @param {string} value
 * @returns {string[]}
 */
export function srcsetUrls(value) {
	const urls = [];
	let pos = 0;
	const space = /[\t\n\f\r ]/;
	while (pos < value.length) {
		while (pos < value.length && (space.test(value[pos]) || value[pos] === ',')) pos += 1;
		if (pos >= value.length) break;
		const start = pos;
		while (pos < value.length && !space.test(value[pos])) pos += 1;
		let url = value.slice(start, pos);
		if (url.endsWith(',')) {
			url = url.replace(/,+$/, '');
		} else {
			let inParens = false;
			while (pos < value.length && (inParens || value[pos] !== ',')) {
				if (value[pos] === '(') inParens = true;
				else if (value[pos] === ')') inParens = false;
				pos += 1;
			}
		}
		urls.push(url);
	}
	return urls;
}

/**
 * The problem of a URL that `offSite` places on another site, naming the resolved URL when it differs.
 * @param {string} what what loads it, such as `<script>`
 * @param {string} shown the URL as the problem names it
 * @param {string | undefined} resolved what `offSite` gave
 * @param {string} verb
 * @returns {string | undefined}
 */
function offSiteProblem(what, shown, resolved, verb = 'loads an off-site file') {
	if (resolved === undefined) return undefined;
	return `${what} ${verb}: ${resolved === shown ? shown : `${shown} (resolves to ${resolved})`}`;
}

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
		const found = [];
		const src = attrs.get('src');
		if (name === 'script' && src !== undefined) found.push(offSiteProblem('<script>', src, offSite(src)));
		const href = attrs.get('href');
		// A `<base>` before the meta would send every relative URL after it to another site.
		if (name === 'base' && href !== undefined)
			found.push(offSiteProblem('<base>', href, offSite(href), 'points off the site'));
		// `rel` is a set of space-separated tokens, compared ASCII case-insensitively
		// (https://html.spec.whatwg.org/multipage/links.html#linkTypes).
		const rel = decodeHTMLAttribute(attrs.get('rel') ?? '')
			.toLowerCase()
			.split(/[\t\n\f\r ]+/);
		const fetching = rel.filter((token) => FETCHING_RELS.includes(token));
		if (name === 'link' && fetching.length > 0) {
			const what = `<link rel="${fetching.join(' ')}">`;
			if (href !== undefined) found.push(offSiteProblem(what, href, offSite(href)));
			// `imagesrcset` gives a preload its image candidates, each fetched like `href`.
			for (const url of srcsetUrls(decodeHTMLAttribute(attrs.get('imagesrcset') ?? '')))
				found.push(offSiteProblem(`${what} imagesrcset`, url, offSiteDecoded(url)));
		}
		for (const problem of found) if (problem !== undefined) problems.push(problem);
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
