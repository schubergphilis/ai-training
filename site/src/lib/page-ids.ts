/**
 * The DOM ids the build puts on a lesson page that the lesson source doesn't
 * spell out. A habit id (`lib/habit-tags.ts`, issue #458) and a checkpoint id
 * (`lib/checkpoint-tags.ts`, issue #471) each become a DOM id on the page, so
 * each must differ from these. No Astro import, so every caller can load it.
 */

/** The fixed ids the site's own code adds to a lesson page. */
export const RESERVED_IDS: ReadonlySet<string> = new Set([
	// The heading `plugins/remark-citations.mjs` appends when the lesson cites a source; Starlight slugs it.
	'references',
	// The group headings of the lesson table of contents, one per group in `lib/lesson-toc.ts`:
	// `overrides/TableOfContents.astro` emits `lesson-toc-<group>`.
	'lesson-toc-checkpoints',
	'lesson-toc-examples',
	// `overrides/MobileTableOfContents.astro` emits `lesson-toc-mobile-<group>`.
	'lesson-toc-mobile-checkpoints',
	'lesson-toc-mobile-examples',
	// The sections `<Recap>` (`lesson/Recap.astro`), `<Exercise>` (`lesson/Exercise.astro`) and
	// `<MorePractice>` (`lesson/MorePractice.astro`) render, with an id the tag doesn't carry.
	'recap',
	'exercise',
	'more-practice',
	// The `<template>` of theme icons Starlight's `ThemeProvider.astro` puts on every page.
	'theme-icons',
]);
/**
 * Starlight's own fixed ids: `_top` from `constants.js` via `PageTitle.astro`,
 * `starlight__sidebar` from `PageFrame.astro`, `starlight__search` from
 * `Search.astro`, `starlight__on-this-page` from `TableOfContents.astro`,
 * `starlight__mobile-toc` and `starlight__on-this-page--mobile` from
 * `MobileTableOfContents.astro`. A habit id can't be one, because `HABIT_ID`
 * rejects an id with `_` or `--`, but a checkpoint id has no such format rule.
 */
export const STARLIGHT_IDS: ReadonlySet<string> = new Set([
	'_top',
	'starlight__sidebar',
	'starlight__search',
	'starlight__on-this-page',
	'starlight__mobile-toc',
	'starlight__on-this-page--mobile',
]);
/** The id of the n-th entry of the references list `plugins/remark-citations.mjs` appends. */
export const REFERENCE_ID = /^ref-\d+$/;
/**
 * The ids Starlight's `<Tabs>` gives its tabs and panels, `tab-<i>-<n>` and
 * `tab-panel-<i>-<n>` (`@astrojs/starlight/dist/user-components/tabs-processor.js`).
 */
export const TAB_ID = /^tab-(?:panel-)?\d+-\d+$/;
/**
 * The ids `lesson/Match.astro` gives the rows of a `<Match>`: `<id>-row-<i>` on each
 * select and `<id>-row-<i>-fb` on its feedback. Group 1 is the checkpoint id.
 */
export const MATCH_ROW_ID = /^(.+)-row-\d+(?:-fb)?$/;

/**
 * The slug the appended `References` heading gets on a page whose source
 * headings slug to `slugs`. The page-wide slugger slugs it after the source
 * headings, so when a source heading has taken `references` it becomes the
 * next free `references-<n>`.
 */
export function referencesSlug(slugs: ReadonlySet<string>): string {
	let slug = 'references';
	for (let n = 1; slugs.has(slug); n++) slug = `references-${n}`;
	return slug;
}

/**
 * True when `id` is an id the build adds to a lesson page whose source
 * headings slug to `slugs`: one of `RESERVED_IDS` or `STARLIGHT_IDS`, a
 * `REFERENCE_ID`, a `TAB_ID`, or the slug of the appended `References` heading.
 */
export function isBuildId(id: string, slugs: ReadonlySet<string>): boolean {
	return (
		RESERVED_IDS.has(id) ||
		STARLIGHT_IDS.has(id) ||
		REFERENCE_ID.test(id) ||
		TAB_ID.test(id) ||
		id === referencesSlug(slugs)
	);
}
