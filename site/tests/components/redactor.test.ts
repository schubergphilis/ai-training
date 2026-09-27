/**
 * Renders the Redactor widget with Astro's Container API: the markup
 * `scripts/redactor.ts` binds to, the sample files it loads from
 * `site/examples/`, and the props that must fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Redactor from '@components/widgets/Redactor.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

const EXAMPLES = join(import.meta.dirname, '../../examples');
const DIR = 'safety/redact-before-you-paste/sample/';

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

function escaped(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

describe('Redactor', () => {
	it('renders a not-content container with the text and map boxes, a Redact button and no watch box', async () => {
		const html = await container.renderToString(Redactor, {
			props: { text: `${DIR}email.txt`, map: `${DIR}email-map.txt` },
		});
		expect(html).toMatch(/<div class="not-content redactor[^"]*" data-redactor data-action="redact"/);
		expect(html).toContain(`>${escaped(readFileSync(join(EXAMPLES, DIR, 'email.txt'), 'utf8'))}</textarea>`);
		expect(html).toContain(`>${escaped(readFileSync(join(EXAMPLES, DIR, 'email-map.txt'), 'utf8'))}</textarea>`);
		expect(html).toMatch(/<button type="button" class="rd-run[^"]*">Redact<\/button>/);
		expect(html).not.toContain('rd-watch');
		expect(html).toMatch(/<pre class="rd-output[^"]*" tabindex="0" hidden><\/pre>/);
	});
	it('renders a watch box, an empty map box and the text label it is given', async () => {
		const html = await container.renderToString(Redactor, {
			props: { text: `${DIR}partial.txt`, watch: `${DIR}watch.txt`, textLabel: 'Their version' },
		});
		expect(html).toContain(`>${escaped(readFileSync(join(EXAMPLES, DIR, 'watch.txt'), 'utf8'))}</textarea>`);
		expect(html).toMatch(/<textarea class="rd-map[^"]*"[^>]*><\/textarea>/);
		expect(html).toMatch(/<span[^>]*>Their version<\/span>/);
	});
	it('renders a Restore button for the restore action', async () => {
		const html = await container.renderToString(Redactor, {
			props: { action: 'restore', text: `${DIR}reply.txt`, map: `${DIR}email-map.txt` },
		});
		expect(html).toContain('data-action="restore"');
		expect(html).toMatch(/>Restore<\/button>/);
	});
	it('fails the build on a file that is not there and on an unknown action', async () => {
		await expect(container.renderToString(Redactor, { props: { text: `${DIR}none.txt` } })).rejects.toThrow(
			`Redactor: no file ${DIR}none.txt`,
		);
		await expect(
			container.renderToString(Redactor, { props: { text: `${DIR}email.txt`, action: 'shred' } }),
		).rejects.toThrow('Redactor: action is shred, and it must be redact or restore');
	});
});
