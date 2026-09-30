/**
 * Where the site is published: Astro's `site` (the origin) and `base` (the
 * project path under it). `astro.config.mjs` reads both from here, and so
 * does `mise run bundles`, which can't import that config from a `bun`
 * script (it loads Starlight and every integration). `vitest.config.ts`
 * sets `test.env` from `BASE` for `src/lib/url.ts`.
 */
export const SITE = 'https://schubergphilis.github.io';
export const BASE = '/ai-training';

/** The site root the published files' absolute URLs start with, with a trailing slash. */
export const SITE_ROOT = `${SITE}${BASE}/`;
