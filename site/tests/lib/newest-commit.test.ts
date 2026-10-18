import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { newestCommitDate, SITE_PATHSPEC } from '@lib/newest-commit';
import { describe, expect, it } from 'vitest';

/** What git itself says, to compare against: the newest commit under `site/`, in seconds. */
function gitTimestamp(): number {
	return Number(
		execFileSync('git', ['log', '--format=%ct', '--max-count=1', '--', SITE_PATHSPEC], { encoding: 'utf-8' }),
	);
}

describe('newest commit date', () => {
	it('is the committer date of the newest commit under site/', () => {
		expect(newestCommitDate(SITE_PATHSPEC)?.getTime()).toBe(gitTimestamp() * 1000);
	});
	it('reads the pathspec from the repository root, whatever the working directory', () => {
		expect(newestCommitDate(SITE_PATHSPEC, 'src/lib')).toEqual(newestCommitDate(SITE_PATHSPEC));
	});
	it('is undefined when no commit touches the path', () => {
		expect(newestCommitDate(':/no-such-directory')).toBeUndefined();
	});
	it('is undefined outside a git clone', () => {
		expect(newestCommitDate(SITE_PATHSPEC, tmpdir())).toBeUndefined();
	});
});
