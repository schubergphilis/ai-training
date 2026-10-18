/**
 * The landing page's "Last updated" date (spec S11 "Lesson page"): the
 * newest commit under `site/`, so a change to any lesson, data file or site
 * code moves it. Every other page keeps Starlight's `lastUpdated`, the last
 * commit of the page's own file. The route middleware sets it.
 */
import { spawnSync } from 'node:child_process';

/** The site directory as a git pathspec. `:/` makes it relative to the repository root, so it works from any working directory inside the clone. */
export const SITE_PATHSPEC = ':/site';

/**
 * The committer date of the newest commit that touches `pathspec`, or
 * `undefined` when git has no answer: git is missing, `cwd` is outside a
 * clone, or no commit touches the path. The footer then shows no date, the
 * same as Starlight does for a page it finds no git history for.
 */
export function newestCommitDate(pathspec: string, cwd?: string): Date | undefined {
	const result = spawnSync('git', ['log', '--format=%ct', '--max-count=1', '--', pathspec], {
		cwd,
		encoding: 'utf-8',
	});
	const timestamp = result.status === 0 ? result.stdout.trim() : '';
	if (!/^\d+$/.test(timestamp)) return undefined;
	return new Date(Number(timestamp) * 1000);
}
