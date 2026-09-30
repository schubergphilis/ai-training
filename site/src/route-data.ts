import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { alternatePaths } from '@lib/alternates';
import { alternateHeadLink } from '@lib/markdown-alternate';

/**
 * Starlight route middleware (`routeMiddleware` in astro.config.mjs, per
 * https://starlight.astro.build/guides/route-data/): it adds the head hint
 * of spec S12 "Head hints", `<link rel="alternate" type="text/markdown">`,
 * to each page that `alternatePaths` (`@lib/alternates`) lists, and to no
 * other page. The same list drives the alternate route, so every hint
 * points at a file the build writes.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** The page path without the base, ending in `/`: `/ai-training/safety/` is `/safety/`. */
export function pagePathOf(pathname: string): string {
	const path = pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
	return path.endsWith('/') ? path : `${path}/`;
}

/**
 * The list of pages with an alternate, read once per build, since every page runs this middleware. The dev
 * server reads it on each request, so a lesson page added while it runs gets its hint without a restart.
 */
let paths: Promise<Set<string>> | undefined;
function pagesWithAlternate(): Promise<Set<string>> {
	if (import.meta.env.DEV) return alternatePaths();
	paths ??= alternatePaths();
	return paths;
}

export const onRequest = defineRouteMiddleware(async (context) => {
	const site: string | undefined = import.meta.env.SITE;
	if (!site) throw new Error('the Markdown alternate head hint needs `site` in astro.config.mjs for absolute URLs');
	const path = pagePathOf(context.url.pathname);
	if (!(await pagesWithAlternate()).has(path)) return;
	context.locals.starlightRoute.head.push(alternateHeadLink(path, new URL(site).origin));
});
