/**
 * Renders the ClaimChecker widget with Astro's Container API: the markup
 * `scripts/claim-checker.ts` binds to, the summary and source files it
 * loads from `site/examples/`, and the props that must fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ClaimChecker from '@components/widgets/ClaimChecker.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

const EXAMPLES = join(import.meta.dirname, '../../examples');
const DIR = 'safety/spotting-hallucination/';
const SOURCES = [`${DIR}sources/report.txt`, `${DIR}sources/minutes.txt`];

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

function escaped(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

describe('ClaimChecker', () => {
	it('renders the sources numbered, the summary in the text box, and the sources as data', async () => {
		const html = await container.renderToString(ClaimChecker, {
			props: { summary: `${DIR}sample/summary_1.txt`, sources: SOURCES },
		});
		expect(html).toMatch(/<div class="not-content claim-checker[^"]*" data-claim-checker data-sources="/);
		expect(html).toMatch(/<figcaption[^>]*>report.txt<\/figcaption>/);
		expect(html).toContain(' 3  On a weekday morning in March the team counted 890 bicycles');
		expect(html).toContain(' 9  No cost estimate was made for this review.</pre>');
		expect(html).toContain(`>${escaped(readFileSync(join(EXAMPLES, DIR, 'sample/summary_1.txt'), 'utf8'))}</textarea>`);
		const attr = /data-sources="([^"]*)"/.exec(html)?.[1] ?? '';
		const data: unknown = JSON.parse(attr.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&'));
		expect(data).toEqual([
			{ name: 'report.txt', text: readFileSync(join(EXAMPLES, DIR, 'sources/report.txt'), 'utf8') },
			{ name: 'minutes.txt', text: readFileSync(join(EXAMPLES, DIR, 'sources/minutes.txt'), 'utf8') },
		]);
		expect(html).toMatch(/<button type="button" class="cc-check[^"]*">Check<\/button>/);
	});
	it('leaves the source text out with showSources false and starts empty without a summary', async () => {
		const html = await container.renderToString(ClaimChecker, { props: { sources: SOURCES, showSources: false } });
		expect(html).not.toContain('<figcaption');
		expect(html).toMatch(/<textarea class="cc-input[^"]*"[^>]*><\/textarea>/);
	});
	it('fails the build on a file that is not there and on no sources', async () => {
		await expect(
			container.renderToString(ClaimChecker, { props: { sources: [`${DIR}sources/none.txt`] } }),
		).rejects.toThrow(`ClaimChecker: no file ${DIR}sources/none.txt`);
		await expect(container.renderToString(ClaimChecker, { props: { sources: [] } })).rejects.toThrow(
			'ClaimChecker: sources is empty',
		);
	});
});
