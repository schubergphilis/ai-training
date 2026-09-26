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
 * tests/scripts/rendered-citations.test.ts). This file only reports.
 */
import { join } from 'node:path';
import { checkBundles, checkExportCitations } from './lib/bundles.mjs';
import { checkRenderedCitations } from './lib/rendered-citations.mjs';

const root = new URL('..', import.meta.url).pathname;
const { errors, bundles } = checkBundles(
	join(root, 'dist/data/lessons'),
	join(root, 'src/content/docs'),
	join(root, 'src/data'),
);
errors.push(...checkExportCitations(join(root, 'dist/data/checkpoints.json')));
const rendered = checkRenderedCitations(join(root, 'dist'));
errors.push(...rendered.errors);

if (errors.length) {
	for (const e of errors) console.error(`bundles: ${e}`);
	console.error(`bundles: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
	process.exit(1);
}
console.log(`bundles: ${bundles} bundle${bundles === 1 ? '' : 's'} under dist/data/lessons, one per lesson page`);
console.log(
	`bundles: ${rendered.pages} HTML page${rendered.pages === 1 ? '' : 's'} under dist, no unresolved citation`,
);
