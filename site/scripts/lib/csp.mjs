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
 * The check reads tags the way the HTML tokenizer does (`readTag`, which
 * names the tokenizer states it copies), so a quote inside an unquoted
 * attribute value is a literal character. In
 * `<script src=x' ></script><script src="https://evil.example/a.js">` the
 * first tag ends at its first `>`, and the second script is checked.
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

/** The script types a browser does not run, and so the policy does not apply to: JSON data blocks. */
const DATA_TYPE = /^application\/(ld\+)?json$/i;
/**
 * The `rel` tokens of a `<link>` that makes a browser contact the server its URL names, which the site
 * promises not to do (`SECURITY.md`). They are the external resource link types of the HTML Standard
 * (https://html.spec.whatwg.org/multipage/links.html#linkTypes), and five that browsers add. Chromium
 * fetches `prerender` as a NoState Prefetch (https://developer.chrome.com/docs/web-platform/prerender-pages)
 * and `compression-dictionary` as a shared compression dictionary
 * (https://developer.chrome.com/blog/shared-dictionary-compression). Safari fetches `apple-touch-icon` and
 * `apple-touch-icon-precomposed` for the home screen
 * (https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
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

/** The characters the HTML tokenizer reads as whitespace in a tag. A CR is one too, since the browser turns it into an LF first. */
const SPACE = /[\t\n\f\r ]/;
const ALPHA = /[A-Za-z]/;

/**
 * The elements whose content the browser reads as text up to their end tag, with no tags in it, in HTML
 * content: script data, the RCDATA elements `title` and `textarea`, and the raw text elements, `noscript`
 * among them because the check reads a page with scripting on
 * (https://html.spec.whatwg.org/multipage/parsing.html#parsing-html-fragments lists the tokenizer state of each).
 * Inside `<svg>` or `<math>` the browser reads their content as markup.
 */
const TEXT_ELEMENTS = ['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'];
/** The elements whose text the policy must hash. */
const HASHED = ['script', 'style'];
/** The elements that start foreign content, where no element's content is text. */
const FOREIGN = ['svg', 'math'];

/**
 * `text` with its ASCII capitals in lower case, as the tokenizer lowercases tag and attribute names.
 * @param {string} text
 */
function asciiLower(text) {
	return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/**
 * @typedef {{ name: string, end: boolean, selfClosing: boolean, attrs: Map<string, string>, start: number, close: number }} Tag
 * A tag as the browser reads it: its name and its attributes in lower case, name to raw value (`''` when it
 * has none, character references not decoded, the first of a repeated name), whether it is an end tag,
 * whether it ends in `/>`, the index of its `<` and the index after its `>`.
 */

/**
 * The tag that starts at `html[start]`, read with the tag states of the HTML tokenizer
 * (https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state and the states after it). Each case
 * below names the state it copies. A quote starts a quoted value only in the "before attribute value"
 * state, right after `=` and optional whitespace. Inside an unquoted value or an attribute name a quote is
 * a literal character, and an unquoted value ends at whitespace or `>`. `undefined` when no tag starts there
 * (`<` without a letter or `/` and a letter after it), and `null` when the page ends inside the tag, which
 * the browser then drops with the rest of the page.
 * @param {string} html
 * @param {number} start
 * @returns {Tag | undefined | null}
 */
export function readTag(html, start) {
	let pos = start + 1;
	// Tag open state, and end tag open state after a `/`.
	const end = html[pos] === '/';
	if (end) pos += 1;
	if (!ALPHA.test(html[pos] ?? '')) return undefined;
	/** @type {[string, string][]} */
	const list = [];
	/** The attribute being read. Every state that writes to it comes after one that sets it. */
	/** @type {[string, string]} */
	let attr = ['', ''];
	let name = '';
	let state = 'tag name';
	for (; pos < html.length; pos += 1) {
		const c = html[pos];
		switch (state) {
			case 'tag name':
				if (SPACE.test(c)) state = 'before attribute name';
				else if (c === '/') state = 'self-closing start tag';
				else if (c === '>') return emit();
				else name += c;
				break;
			case 'before attribute name':
				if (SPACE.test(c)) break;
				if (c === '/' || c === '>') {
					state = 'after attribute name';
					pos -= 1;
				} else {
					// A `=` here starts the attribute's name.
					attr = [c === '=' ? '=' : '', ''];
					list.push(attr);
					state = 'attribute name';
					if (c !== '=') pos -= 1;
				}
				break;
			case 'attribute name':
				if (SPACE.test(c) || c === '/' || c === '>') {
					state = 'after attribute name';
					pos -= 1;
				} else if (c === '=') state = 'before attribute value';
				else attr[0] += c;
				break;
			case 'after attribute name':
				if (SPACE.test(c)) break;
				if (c === '/') state = 'self-closing start tag';
				else if (c === '=') state = 'before attribute value';
				else if (c === '>') return emit();
				else {
					attr = ['', ''];
					list.push(attr);
					state = 'attribute name';
					pos -= 1;
				}
				break;
			case 'before attribute value':
				if (SPACE.test(c)) break;
				if (c === '"') state = 'attribute value (double-quoted)';
				else if (c === "'") state = 'attribute value (single-quoted)';
				else if (c === '>') return emit();
				else {
					state = 'attribute value (unquoted)';
					pos -= 1;
				}
				break;
			case 'attribute value (double-quoted)':
				if (c === '"') state = 'after attribute value (quoted)';
				else attr[1] += c;
				break;
			case 'attribute value (single-quoted)':
				if (c === "'") state = 'after attribute value (quoted)';
				else attr[1] += c;
				break;
			case 'attribute value (unquoted)':
				if (SPACE.test(c)) state = 'before attribute name';
				else if (c === '>') return emit();
				else attr[1] += c;
				break;
			case 'after attribute value (quoted)':
				if (SPACE.test(c)) state = 'before attribute name';
				else if (c === '/') state = 'self-closing start tag';
				else if (c === '>') return emit();
				else {
					state = 'before attribute name';
					pos -= 1;
				}
				break;
			case 'self-closing start tag':
				if (c === '>') return emit(true);
				state = 'before attribute name';
				pos -= 1;
				break;
		}
	}
	return null;

	/**
	 * The tag that ends at `html[pos]`, a `>`. The first attribute of a name wins, as in the browser.
	 * @param {boolean} selfClosing
	 */
	function emit(selfClosing = false) {
		const attrs = new Map();
		for (const [key, value] of list) if (!attrs.has(asciiLower(key))) attrs.set(asciiLower(key), value);
		return { name: asciiLower(name), end, selfClosing, attrs, start, close: pos + 1 };
	}
}

/**
 * Where the comment or other markup declaration at `html[start]` ends: the index after it, `undefined` when no
 * comment starts there, and `null` when it runs to the end of the page. It follows the markup declaration
 * open state and the comment states of the HTML tokenizer
 * (https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state). A comment `<!--` ends
 * at `-->` or `--!>`, or right away as `<!-->` or `<!--->`. A CDATA section, only in foreign content, ends at
 * `]]>`. Any other `<!` (a doctype too) or a `</` without a letter after it opens a bogus comment, which ends
 * at the next `>`. A `<?` opens a processing instruction or a bogus comment, and both end at the next `>`.
 * @param {string} html
 * @param {number} start
 * @param {boolean} foreign whether the `<` is inside `<svg>` or `<math>`
 * @returns {number | undefined | null}
 */
export function commentEnd(html, start, foreign) {
	/** The index after the first `marker` from `from`, or `null` at the end of the page. */
	const after = (/** @type {string} */ marker, /** @type {number} */ from) => {
		const at = html.indexOf(marker, from);
		return at === -1 ? null : at + marker.length;
	};
	if (html.startsWith('<!--', start)) {
		const body = start + 4;
		// Comment start state, and comment start dash state.
		if (html[body] === '>') return body + 1;
		if (html.startsWith('->', body)) return body + 2;
		// Comment state up to the comment end state or the comment end bang state.
		const ends = [after('-->', body), after('--!>', body)].filter((end) => end !== null);
		return ends.length === 0 ? null : Math.min(...ends);
	}
	if (foreign && html.startsWith('<![CDATA[', start)) return after(']]>', start + 9);
	const next = html[start + 1];
	const bogus =
		next === '!' || next === '?' || (next === '/' && start + 2 < html.length && !ALPHA.test(html[start + 2]));
	return bogus ? after('>', start + 2) : undefined;
}

/**
 * The tags of a page in order. Comments are skipped (`commentEnd`). The start tag of a `TEXT_ELEMENTS`
 * element in HTML content comes with the `body` text up to its end tag, and the check reads no tags in that
 * text: the browser ends it at the first `</` and its name followed by whitespace, `/` or `>`
 * (https://html.spec.whatwg.org/multipage/parsing.html#rcdata-end-tag-name-state, and the same states for
 * raw text and script data). Inside `<svg>` or `<math>`, a `script` or `style` still comes with its `body`,
 * so that its hash is checked, and the check reads on inside it, as the browser does. A body without an end
 * tag runs to the end of the page. So does the content of `plaintext`, and the rest of a page that ends
 * inside a tag or a comment, which the browser reads as no tag at all.
 *
 * Two simplifications remain. The escape states of script data are left out: in them `<!--<script>` makes
 * the browser read a script on past the next `</script>`, so the check reads part of that script as markup
 * (issue #708). And foreign content is counted by `<svg>` and `<math>` tags only, so an HTML element that
 * closes it early, such as a `<p>` inside `<svg>`, leaves the check reading HTML as foreign content.
 * @param {string} html
 * @returns {Generator<Tag & { body?: string }>}
 */
export function* tags(html) {
	let pos = 0;
	let foreign = 0;
	while (pos < html.length) {
		const start = html.indexOf('<', pos);
		if (start === -1) return;
		const comment = commentEnd(html, start, foreign > 0);
		if (comment === null) return;
		if (comment !== undefined) {
			pos = comment;
			continue;
		}
		const tag = readTag(html, start);
		if (tag === null) return;
		if (tag === undefined) {
			pos = start + 1;
			continue;
		}
		pos = tag.close;
		if (FOREIGN.includes(tag.name)) {
			if (tag.end) foreign = Math.max(0, foreign - 1);
			else if (!tag.selfClosing) foreign += 1;
		}
		const text = foreign > 0 ? HASHED.includes(tag.name) : TEXT_ELEMENTS.includes(tag.name);
		if (tag.end || !text) {
			yield tag;
			if (!tag.end && tag.name === 'plaintext' && foreign === 0) return;
			continue;
		}
		const close = new RegExp(`</${tag.name}[\\t\\n\\f\\r />]`, 'gi');
		close.lastIndex = tag.close;
		const found = close.exec(html);
		const bodyEnd = found ? found.index : html.length;
		yield { ...tag, body: html.slice(tag.close, bodyEnd) };
		if (foreign === 0) pos = bodyEnd;
	}
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
	const all = [...tags(html)];
	const headEnd = all.find((tag) => tag.end && tag.name === 'head')?.start ?? -1;
	const metas = all.filter(
		(tag) =>
			!tag.end &&
			tag.name === 'meta' &&
			asciiLower(decodeHTMLAttribute(tag.attrs.get('http-equiv') ?? '')) === 'content-security-policy',
	);
	if (metas.length === 0) return ['no Content Security Policy <meta>'];
	if (metas.length > 1) problems.push(`${metas.length} Content Security Policy <meta> tags, expected one`);
	if (headEnd === -1 || metas[0].start > headEnd) problems.push('the Content Security Policy <meta> is not in <head>');
	const policy = parsePolicy(decodeHTMLAttribute(metas[0].attrs.get('content') ?? ''));
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
	for (const { name: kind, attrs, body: raw } of all) {
		if (raw === undefined || !HASHED.includes(kind)) continue;
		if (kind === 'script' && (attrs.has('src') || DATA_TYPE.test((attrs.get('type') ?? '').trim()))) continue;
		// The browser turns each CRLF and lone CR into LF before it parses the page, and hashes the result
		// (https://html.spec.whatwg.org/multipage/parsing.html#preprocessing-the-input-stream).
		const body = raw.replace(/\r\n?/g, '\n');
		const hash = sha256(body);
		const allowed = kind === 'script' ? scriptSrc : styleSrc;
		if (!allowed.includes(`'${hash}'`)) {
			const start = body.trim().replace(/\s+/g, ' ').slice(0, 60);
			problems.push(`inline <${kind}> not in ${kind}-src: '${hash}' "${start}"`);
		}
	}
	// The text of a script or style may hold markup in a string, which `tags` does not read as a tag.
	for (const { name, end, attrs } of all) {
		if (end) continue;
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
