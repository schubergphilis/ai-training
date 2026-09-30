/**
 * Renders the LineCompare widget with Astro's Container API: the markup
 * `scripts/line-compare.ts` binds to, the code and source files it loads
 * from `site/examples/`, and the props that must fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LineCompare from '@components/widgets/LineCompare.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

const EXAMPLES = join(import.meta.dirname, '../../examples');
const DIR = 'safety/saying-ai-helped/';
const SOURCE = `${DIR}sources/truncate.py`;

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

describe('LineCompare', () => {
	it('renders the source, the code in the text box, and the source as data', async () => {
		const html = await container.renderToString(LineCompare, {
			props: { candidate: `${DIR}sample/generated.py`, source: SOURCE },
		});
		const source = readFileSync(join(EXAMPLES, SOURCE), 'utf8');
		expect(html).toMatch(/<div class="not-content line-compare[^"]*" data-line-compare data-source="/);
		expect(html).toMatch(/<figcaption[^>]*>truncate.py<\/figcaption>/);
		expect(html).toContain(`>${escaped(source.replace(/\n$/, ''))}</pre>`);
		expect(html).toContain(`>${escaped(readFileSync(join(EXAMPLES, DIR, 'sample/generated.py'), 'utf8'))}</textarea>`);
		expect(html).toContain('Paste the code to compare with truncate.py');
		const attr = /data-source="([^"]*)"/.exec(html)?.[1] ?? '';
		const data: unknown = JSON.parse(attr.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&'));
		expect(data).toEqual({ name: 'truncate.py', text: source });
		expect(html).toMatch(/<button type="button" class="lc-check[^"]*">Compare<\/button>/);
		expect(html).toMatch(/<pre class="lc-lines[^"]*" tabindex="0" hidden><\/pre>/);
	});
	it('leaves the source text out with showSource false and starts empty without a candidate', async () => {
		const html = await container.renderToString(LineCompare, { props: { source: SOURCE, showSource: false } });
		expect(html).not.toContain('<figcaption');
		expect(html).toMatch(/<textarea class="lc-input[^"]*"[^>]*><\/textarea>/);
	});
	it('fails the build on a file that is not there', async () => {
		await expect(container.renderToString(LineCompare, { props: { source: `${DIR}sources/none.py` } })).rejects.toThrow(
			`LineCompare: no file ${DIR}sources/none.py`,
		);
		await expect(
			container.renderToString(LineCompare, { props: { source: SOURCE, candidate: `${DIR}sample/none.py` } }),
		).rejects.toThrow(`LineCompare: no file ${DIR}sample/none.py`);
	});
});
