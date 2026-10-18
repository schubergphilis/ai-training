import { newestCommitDate, SITE_PATHSPEC } from '@lib/newest-commit';
import { describe, expect, it, vi } from 'vitest';
import { onRequest, pagePathOf } from '../../src/route-data';

vi.mock('astro:content', async () => {
	const { alternateDocs } = await import('./alternate-fixtures');
	return (await import('./content')).mockContent({ docs: alternateDocs });
});

describe('pagePathOf', () => {
	it('strips the base and ends the path in a slash', () => {
		expect(pagePathOf('/ai-training/safety/agent-risk/')).toBe('/safety/agent-risk/');
		expect(pagePathOf('/ai-training/safety')).toBe('/safety/');
		expect(pagePathOf('/ai-training/')).toBe('/');
	});
});

describe('the head hint middleware', () => {
	async function headOf(pathname: string) {
		const head: unknown[] = [];
		const context = {
			url: new URL(`https://schubergphilis.github.io${pathname}`),
			locals: { starlightRoute: { head } },
		};
		await onRequest(context as never, async () => {});
		return head;
	}
	const describedBy = {
		tag: 'link',
		attrs: { rel: 'describedby', href: 'https://schubergphilis.github.io/ai-training/llms.txt' },
	};
	it('adds the alternate link to a lesson page and a course page', async () => {
		expect(await headOf('/ai-training/safety/agent-risk/')).toEqual([
			describedBy,
			{
				tag: 'link',
				attrs: {
					rel: 'alternate',
					type: 'text/markdown',
					href: 'https://schubergphilis.github.io/ai-training/safety/agent-risk/index.md',
				},
			},
		]);
		expect(await headOf('/ai-training/safety/')).toHaveLength(2);
	});
	it('adds only the llms.txt link to a page without an alternate', async () => {
		expect(await headOf('/ai-training/')).toEqual([describedBy]);
		expect(await headOf('/ai-training/progress/')).toEqual([describedBy]);
	});
});

describe('the landing page date', () => {
	async function lastUpdatedOf(pathname: string) {
		const pageDate = new Date('2026-09-29');
		const route = { head: [], lastUpdated: pageDate as Date | undefined };
		const context = { url: new URL(`https://schubergphilis.github.io${pathname}`), locals: { starlightRoute: route } };
		await onRequest(context as never, async () => {});
		return route.lastUpdated;
	}
	it('is the newest commit under site/ on the landing page', async () => {
		expect(await lastUpdatedOf('/ai-training/')).toEqual(newestCommitDate(SITE_PATHSPEC));
	});
	it('stays the page date on every other page', async () => {
		expect(await lastUpdatedOf('/ai-training/safety/agent-risk/')).toEqual(new Date('2026-09-29'));
		expect(await lastUpdatedOf('/ai-training/progress/')).toEqual(new Date('2026-09-29'));
	});
});
