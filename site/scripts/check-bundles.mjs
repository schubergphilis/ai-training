#!/usr/bin/env bun
/**
 * Lesson bundle check (`mise run bundles`, after `site-build`): the built
 * dist/data/lessons/<area>/<lesson>.json files must be one per lesson page,
 * carry every field spec S08 "Format" names, and hold every fenced code block
 * of their page unchanged and the output of each ungraded example of the page
 * after an `Output:` line, with no raw `(@key)` token outside code in their
 * prose, behaviors or checkpoint stems, nor in the stems of
 * dist/data/checkpoints.json. The logic and the list of what it rejects are in
 * scripts/lib/bundles.mjs, which tests/scripts/bundles-export.test.ts covers.
 *
 * It checks the data tree as JSON (spec S12 "Data tree as JSON"): each built
 * dist/data/<kind>/<id>.json against its YAML source under src/data, and
 * dist/data/index.json against the same list (`checkDataFiles` and
 * `checkDataIndex` in scripts/lib/bundles.mjs).
 *
 * The same run checks every built HTML page for a `(@key)` citation that no
 * renderer resolved (scripts/lib/rendered-citations.mjs, covered by
 * tests/scripts/rendered-citations.test.ts), and checks that every Markdown
 * alternate head hint points at the alternate of its own page, which exists,
 * and that every alternate has a page that hints at it
 * (scripts/lib/alternate-hints.mjs, covered by
 * tests/scripts/alternate-hints.test.ts). This file only reports.
 *
 * It checks that every link in dist/llms.txt reaches a file in dist and that
 * every page links to llms.txt (scripts/lib/llms-txt.mjs, covered by
 * tests/scripts/llms-txt.test.ts).
 */
import { join } from 'node:path';
import { checkAlternateHints } from './lib/alternate-hints.mjs';
import { checkBundles, checkDataFiles, checkDataIndex, checkExportCitations } from './lib/bundles.mjs';
import { checkLlmsTxt } from './lib/llms-txt.mjs';
import { checkRenderedCitations } from './lib/rendered-citations.mjs';
import { SITE_ROOT } from './lib/site-address.mjs';

const root = new URL('..', import.meta.url).pathname;
const { errors, bundles } = checkBundles(
	join(root, 'dist/data/lessons'),
	join(root, 'src/content/docs'),
	join(root, 'src/data'),
);
errors.push(...checkExportCitations(join(root, 'dist/data/checkpoints.json')));
const data = checkDataFiles(join(root, 'dist/data'), join(root, 'src/data'));
errors.push(...data.errors);
errors.push(...checkDataIndex(join(root, 'dist/data'), join(root, 'src/data'), SITE_ROOT));
const rendered = checkRenderedCitations(join(root, 'dist'));
errors.push(...rendered.errors);
const alternates = checkAlternateHints(join(root, 'dist'), SITE_ROOT);
errors.push(...alternates.errors);
const llms = checkLlmsTxt(join(root, 'dist'), SITE_ROOT);
errors.push(...llms.errors);

if (errors.length) {
	for (const e of errors) console.error(`bundles: ${e}`);
	console.error(`bundles: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
	process.exit(1);
}
console.log(`bundles: ${bundles} bundle${bundles === 1 ? '' : 's'} under dist/data/lessons, one per lesson page`);
console.log(
	`bundles: ${data.files} data file${data.files === 1 ? '' : 's'} under dist/data, each its YAML source, all in index.json`,
);
console.log(
	`bundles: ${rendered.pages} HTML page${rendered.pages === 1 ? '' : 's'} under dist, no unresolved citation`,
);
console.log(
	`bundles: ${alternates.hints} Markdown alternate${alternates.hints === 1 ? '' : 's'} under dist, each with its page's head hint`,
);
console.log(
	`bundles: llms.txt under dist, its ${llms.links} site link${llms.links === 1 ? '' : 's'} each reaching a file`,
);
