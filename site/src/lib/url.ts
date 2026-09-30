/**
 * Component-rendered links do not pass through the rehype base plugin (it
 * only sees Markdown), so components build hrefs with this helper.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function href(path: string): string {
	if (!path.startsWith('/')) throw new Error(`href() takes a root-relative path, got ${path}`);
	return `${base}${path}`;
}

/**
 * Astro's `site` (an origin such as `https://schubergphilis.github.io`, with
 * or without a trailing slash) plus the base path, without a trailing slash:
 * `https://schubergphilis.github.io/ai-training`. The one place the origin and
 * the base meet, for text that leaves the page: the lesson bundles and the tutor
 * instruction file (spec S08).
 */
export function siteRoot(site: string): string {
	return `${site.replace(/\/$/, '')}${base}`;
}

/**
 * A root-relative path as an absolute URL on `site`, `siteRoot(site)` plus
 * the path. A path that already carries the base keeps it, as the rehype
 * plugin does, and a URL with a scheme is returned as is.
 */
export function absoluteUrl(path: string, site: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
	if (path === base || path.startsWith(`${base}/`)) return `${siteRoot(site)}${path.slice(base.length)}`;
	if (!path.startsWith('/')) throw new Error(`absoluteUrl() takes a root-relative path, got ${path}`);
	return `${siteRoot(site)}${path}`;
}
