#!/usr/bin/env bun
/**
 * Checkpoint export check (`mise run checkpoints`, after `site-build`): the
 * built dist/data/checkpoints.json must parse and list every checkpoint of
 * every lesson page with valid concept ids (spec S03 "Checkpoint export"),
 * no choice item is guessable from a cue, and the alternates follow their
 * rules (S03 "Checkpoints"). A reviewable checkpoint without a review
 * alternate is a warning, printed and not failed, and so is a graded Predict
 * whose answer has a word its stem and context lack.
 * The logic and the list of what it rejects are in scripts/lib/checkpoints.mjs,
 * which tests/scripts/checkpoints-export.test.ts covers; this file only reports.
 */
import { join } from 'node:path';
import { checkCheckpoints } from './lib/checkpoints.mjs';

const root = new URL('..', import.meta.url).pathname;
const { errors, items, exemptions, warnings } = checkCheckpoints(
	join(root, 'dist/data/checkpoints.json'),
	join(root, 'src/content/docs'),
	join(root, 'src/data'),
);

for (const e of exemptions) console.log(`checkpoints: ${e}`);
for (const w of warnings) console.log(`checkpoints: warning: ${w}`);
if (errors.length) {
	for (const e of errors) console.error(`checkpoints: ${e}`);
	console.error(`checkpoints: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
	process.exit(1);
}
console.log(
	`checkpoints: ${items} item${items === 1 ? '' : 's'} in dist/data/checkpoints.json, all lesson checkpoints present`,
);
