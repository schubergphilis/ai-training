/**
 * Renders the TokenCounter widget with Astro's Container API: the markup
 * `scripts/token-counter.ts` binds to, the sample file it loads from
 * `site/examples/`, and the prop that must fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TokenCounter from '@components/widgets/TokenCounter.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

const EXAMPLES = join(import.meta.dirname, '../../examples');

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

function escaped(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

describe('TokenCounter', () => {
	it('renders a not-content container with an empty text box, a Count button and two report lists', async () => {
		const html = await container.renderToString(TokenCounter);
		expect(html).toMatch(/<div class="not-content token-counter[^"]*" data-token-counter/);
		expect(html).toMatch(/<textarea class="tc-input[^"]*"[^>]*><\/textarea>/);
		expect(html).toMatch(/<button type="button" class="tc-count[^"]*">Count<\/button>/);
		expect(html).toMatch(/<ul class="tc-counts[^"]*"><\/ul>/);
		expect(html).toMatch(/<ul class="tc-pages[^"]*"><\/ul>/);
	});
	it('fills the text box with the sample file', async () => {
		const name = 'concepts/context-window/sample/notes.txt';
		const html = await container.renderToString(TokenCounter, { props: { sample: name } });
		const text = readFileSync(join(EXAMPLES, name), 'utf8');
		expect(text).toContain('project Lantern');
		expect(html).toContain(`>${escaped(text)}</textarea>`);
	});
	it('fails the build on a sample that is not there', async () => {
		await expect(
			container.renderToString(TokenCounter, { props: { sample: 'concepts/context-window/sample/none.txt' } }),
		).rejects.toThrow('TokenCounter: no file concepts/context-window/sample/none.txt');
	});
});
