#!/usr/bin/env bun
/**
 * Lesson bundle check (`mise run bundles`, after `site-build`): the built
 * dist/data/lessons/<area>/<lesson>.json files must be one per lesson page,
 * carry every field spec S08 "Format" names, and hold every fenced code block
 * of their page unchanged, with no raw `(@key)` token outside code in their
 * prose, behaviors or checkpoint stems, nor in the stems of
 * dist/data/checkpoints.json. The logic and the list of what it rejects are in
 * scripts/lib/bundles.mjs, which tests/scripts/bundles-export.test.ts covers.
 *
 * The same run checks every built HTML page for a `(@key)` citation that no
 * renderer resolved (scripts/lib/rendered-citations.mjs, covered by
 * tests/scripts/rendered-citations.test.ts), and checks that every Markdown
 * alternate head hint points at the alternate of its own page, which exists,
 * and that every alternate has a page that hints at it
 * (scripts/lib/alternate-hints.mjs, covered by
 * tests/scripts/alternate-hints.test.ts). This file only reports.
 */
import { join } from 'node:path';
import { checkAlternateHints } from './lib/alternate-hints.mjs';
import { checkBundles, checkExportCitations } from './lib/bundles.mjs';
import { checkRenderedCitations } from './lib/rendered-citations.mjs';
import { SITE_ROOT } from './lib/site-address.mjs';

const root = new URL('..', import.meta.url).pathname;
const { errors, bundles } = checkBundles(
	join(root, 'dist/data/lessons'),
	join(root, 'src/content/docs'),
	join(root, 'src/data'),
);
errors.push(...checkExportCitations(join(root, 'dist/data/checkpoints.json')));
const rendered = checkRenderedCitations(join(root, 'dist'));
errors.push(...rendered.errors);
const alternates = checkAlternateHints(join(root, 'dist'), SITE_ROOT);
errors.push(...alternates.errors);

if (errors.length) {
	for (const e of errors) console.error(`bundles: ${e}`);
	console.error(`bundles: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
	process.exit(1);
}
console.log(`bundles: ${bundles} bundle${bundles === 1 ? '' : 's'} under dist/data/lessons, one per lesson page`);
console.log(
	`bundles: ${rendered.pages} HTML page${rendered.pages === 1 ? '' : 's'} under dist, no unresolved citation`,
);
console.log(
	`bundles: ${alternates.hints} Markdown alternate${alternates.hints === 1 ? '' : 's'} under dist, each with its page's head hint`,
);
