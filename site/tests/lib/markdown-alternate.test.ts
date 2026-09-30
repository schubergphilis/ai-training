import {
	alternateHeadLink,
	alternateUrlOf,
	LICENSE_LINE,
	MARKDOWN_CONTENT_TYPE,
	markdownResponse,
	pageUrlOf,
	referenceLine,
	renderAlternate,
} from '@lib/markdown-alternate';
import { describe, expect, it } from 'vitest';

const site = 'https://schubergphilis.github.io';
const ROOT = 'https://schubergphilis.github.io/ai-training';

describe('alternate URLs', () => {
	it('is the page URL plus index.md, under site and base', () => {
		expect(pageUrlOf('/safety/agent-risk/', site)).toBe(`${ROOT}/safety/agent-risk/`);
		expect(alternateUrlOf('/safety/agent-risk/', site)).toBe(`${ROOT}/safety/agent-risk/index.md`);
		expect(alternateUrlOf('/safety/', `${site}/`)).toBe(`${ROOT}/safety/index.md`);
	});
	it('rejects a path that does not start and end with a slash', () => {
		expect(() => alternateUrlOf('/safety/agent-risk', site)).toThrow(/starts and ends with "\/"/);
		expect(() => alternateUrlOf('safety/', site)).toThrow(/starts and ends with "\/"/);
	});
	it('gives the head link in the form Starlight takes', () => {
		expect(alternateHeadLink('/safety/', site)).toEqual({
			tag: 'link',
			attrs: { rel: 'alternate', type: 'text/markdown', href: `${ROOT}/safety/index.md` },
		});
	});
});

describe('referenceLine', () => {
	it('lists title, container and url, and drops a container equal to the title', () => {
		expect(
			referenceLine({ key: 'a', entry: { type: 'course', title: 'T', container: 'C', url: 'https://x.org/' } }),
		).toBe('- T, C, https://x.org/');
		expect(referenceLine({ key: 'b', entry: { type: 'book', title: 'T', container: 'T', url: null } })).toBe('- T');
	});
});

describe('renderAlternate', () => {
	const page = {
		title: 'Why agent safety is different',
		description: 'What changes once an AI can act.\n  How to decide what it may reach.',
		path: '/safety/agent-risk/',
		body: '\nThe body.\n\n## A section\n\nMore.\n\n',
		references: [],
	};
	it('puts the title, the one-line summary, the page and license lines before the body', () => {
		expect(renderAlternate(page, site)).toBe(
			[
				'# Why agent safety is different',
				'',
				'> What changes once an AI can act. How to decide what it may reach.',
				'',
				`Page: ${ROOT}/safety/agent-risk/`,
				LICENSE_LINE,
				'',
				'The body.',
				'',
				'## A section',
				'',
				'More.',
				'',
			].join('\n'),
		);
	});
	it('ends with a References section only when the page cites a source', () => {
		const md = renderAlternate(
			{ ...page, references: [{ key: 'k', entry: { type: 'course', title: 'T', container: 'C', url: null } }] },
			site,
		);
		expect(md.endsWith('More.\n\n## References\n\n- T, C\n')).toBe(true);
		expect(renderAlternate(page, site)).not.toContain('## References');
	});
	it('rejects a page without a title or a description', () => {
		expect(() => renderAlternate({ ...page, title: ' ' }, site)).toThrow(/needs a title/);
		expect(() => renderAlternate({ ...page, description: '' }, site)).toThrow(/needs a description/);
	});
});

describe('markdownResponse', () => {
	it('serves the text as UTF-8 Markdown, as the tutor instruction file is served', async () => {
		const res = markdownResponse('# T\n');
		expect(res.headers.get('Content-Type')).toBe(MARKDOWN_CONTENT_TYPE);
		expect(MARKDOWN_CONTENT_TYPE).toBe('text/markdown; charset=utf-8');
		expect(await res.text()).toBe('# T\n');
	});
});
