#!/usr/bin/env bun
/**
 * Data tree check (`mise run data`): the YAML under site/src/data must agree
 * with itself and with the lesson pages (specs S09, S10, S11), and a lesson
 * page in the foundations group shows no code or terminal work (spec S03
 * "Foundations audience"). The logic and the list of what it rejects are in
 * scripts/lib/data.mjs, which
 * tests/scripts/data.test.ts covers; this file only reports.
 */
import { join } from 'node:path';
import { checkData, reportData } from './lib/data.mjs';

const root = new URL('..', import.meta.url).pathname;
process.exit(reportData(checkData(join(root, 'src/data'), join(root, 'src/content/docs'))));
