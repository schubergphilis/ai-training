/**
 * The `href` of an `extends-to` entry (spec S03 "Frontmatter", S11 "Lesson
 * file"). Two forms are allowed: a root-relative path to a page of this
 * site, and an `https://` URL under the `url` of an entry in
 * `site/src/data/bibliography.yaml` (see `isUnderUrl`), so the "You are
 * ahead" card can only name a source the project already lists. The
 * MarkdownContent override fails the build on any other value. The same rule
 * serves other fields that name a source by URL; `field` names the field in
 * the error.
 */

export type ExtendsToHref =
	| { kind: 'internal' }
	/** `source` is the bibliography key whose `url` the href is under. */
	| { kind: 'external'; source: string }
	| { kind: 'invalid'; reason: string };

/** An `https://` URL, as opposed to a root-relative path. */
export function isExternalHref(href: string): boolean {
	return href.startsWith('https://');
}

/** A root-relative path: one leading slash. `//host/...` is protocol-relative and is not accepted. */
export function isRootRelative(href: string): boolean {
	return href.startsWith('/') && !href.startsWith('//');
}

/**
 * True when `href` is `url` itself or a path, query or fragment under it.
 * Both sides are normalized with `URL`, so `../` segments cannot leave the
 * prefix, and `https://a.example` does not match `https://a.example.evil`.
 * When `url` has a query, `href` must carry each of its parameters with the
 * same values (`queryIncludes`), so `watch?v=abc` covers `watch?v=abc&t=30`
 * and not `watch?v=xyz`. The fragment is ignored on both sides. An
 * unparsable side is false.
 */
export function isUnderUrl(href: string, url: string): boolean {
	let a: URL;
	let b: URL;
	try {
		a = new URL(href);
		b = new URL(url);
	} catch {
		return false;
	}
	if (a.protocol !== b.protocol || a.host !== b.host) return false;
	const prefix = b.pathname.replace(/\/$/, '');
	const path = a.pathname.replace(/\/$/, '');
	if (path !== prefix && !path.startsWith(`${prefix}/`)) return false;
	return queryIncludes(a.searchParams, b.searchParams);
}

/**
 * True when `href` has every parameter name of `url`, each with the same
 * values. A name repeated on either side must carry the same values on the
 * other, in any order, so `v=abc&v=xyz` does not pass for `v=abc`.
 * Parameters of `href` that `url` lacks, and the order of names, don't
 * matter. Values are compared after `URLSearchParams` decodes them, so
 * `%41` equals `A` and `+` equals `%20`.
 */
function queryIncludes(href: URLSearchParams, url: URLSearchParams): boolean {
	for (const name of new Set(url.keys())) {
		const want = url.getAll(name).sort();
		const got = href.getAll(name).sort();
		if (want.length !== got.length || want.some((v, i) => v !== got[i])) return false;
	}
	return true;
}

/**
 * Classify `href` against the bibliography. `sources` maps a bibliography
 * key to its `url`, which may be missing for a source without one.
 */
export function checkExtendsToHref(
	href: string,
	sources: Iterable<[string, string | null | undefined]>,
	field = 'extends-to',
): ExtendsToHref {
	if (isRootRelative(href)) return { kind: 'internal' };
	if (!isExternalHref(href)) {
		return { kind: 'invalid', reason: `${field} href must be a root-relative path or an https:// URL, got ${href}` };
	}
	return checkExternalSourceHref(href, sources, field);
}

/** The result of `checkExternalSourceHref`: an external href, or the reason it is invalid. */
export type ExternalSourceHref = Exclude<ExtendsToHref, { kind: 'internal' }>;

/**
 * Check an href that must be an `https://` URL under a bibliography `url`.
 * `checkExtendsToHref` calls it for the external form of `extends-to`, and a
 * lesson's `covered-by` (spec S11 "Lesson file") uses it directly, since a
 * page of this site cannot cover a lesson. `field` names the field in the error.
 */
export function checkExternalSourceHref(
	href: string,
	sources: Iterable<[string, string | null | undefined]>,
	field: string,
): ExternalSourceHref {
	if (!isExternalHref(href)) {
		return { kind: 'invalid', reason: `${field} href must be an https:// URL, got ${href}` };
	}
	for (const [key, url] of sources) {
		if (url && isUnderUrl(href, url)) return { kind: 'external', source: key };
	}
	return {
		kind: 'invalid',
		reason: `${field} href ${href} is not under the url of any entry in bibliography.yaml`,
	};
}
