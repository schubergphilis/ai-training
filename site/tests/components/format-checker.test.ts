/**
 * Renders the FormatChecker widget with Astro's Container API: the markup
 * `scripts/format-checker.ts` binds to, the sample file it loads from
 * `site/examples/`, and the props that must fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import FormatChecker from '@components/widgets/FormatChecker.astro';
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

describe('FormatChecker', () => {
	it('renders a not-content container with the default fields and priorities, and an empty text box', async () => {
		const html = await container.renderToString(FormatChecker);
		expect(html).toMatch(/<div class="not-content format-checker[^"]*" data-format-checker/);
		expect(html).toContain(`data-fields="${escaped(JSON.stringify(['owner', 'task', 'due', 'priority']))}"`);
		expect(html).toContain(`data-priorities="${escaped(JSON.stringify(['high', 'medium', 'low']))}"`);
		expect(html).toMatch(/<textarea class="fc-input[^"]*"[^>]*><\/textarea>/);
		expect(html).toMatch(/<button type="button" class="fc-check[^"]*">Check<\/button>/);
		expect(html).toMatch(/<div class="fc-report[^"]*" aria-live="polite">/);
	});
	it('fills the text box with the sample file, escaped', async () => {
		const name = 'concepts/structured-output/sample/bare.json';
		const html = await container.renderToString(FormatChecker, { props: { sample: name } });
		const text = readFileSync(join(EXAMPLES, name), 'utf8');
		expect(text).toContain('```json');
		expect(html).toContain(`>${escaped(text)}</textarea>`);
	});
	it('takes other fields and priorities', async () => {
		const html = await container.renderToString(FormatChecker, { props: { fields: ['owner'], priorities: ['p1'] } });
		expect(html).toContain(`data-fields="${escaped('["owner"]')}"`);
		expect(html).toContain(`data-priorities="${escaped('["p1"]')}"`);
	});
	it('fails the build on a sample that is not there and on an empty list', async () => {
		await expect(
			container.renderToString(FormatChecker, { props: { sample: 'concepts/structured-output/sample/none.txt' } }),
		).rejects.toThrow('FormatChecker: no sample concepts/structured-output/sample/none.txt');
		await expect(container.renderToString(FormatChecker, { props: { fields: [] } })).rejects.toThrow(
			'FormatChecker: fields is empty',
		);
		await expect(container.renderToString(FormatChecker, { props: { priorities: [] } })).rejects.toThrow(
			'FormatChecker: priorities is empty',
		);
	});
});
