/**
 * Mounts `line-compare.ts` on the markup the component renders (Astro
 * Container API), so a class the script looks up and the template dropped
 * fails here. The markup goes into a `happy-dom` window made here, as in
 * `claim-checker.test.ts`. The rules are tested in
 * `line-compare-logic.test.ts`, and what the template renders in
 * `tests/components/line-compare.test.ts`.
 */
import LineCompare from '@components/widgets/LineCompare.astro';
import { mountLineCompare, mountLineCompares, ROOT_SELECTOR } from '@scripts/line-compare';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const window = new Window();
// The script is typed against the DOM lib, and happy-dom's classes implement it.
const document = window.document as unknown as Document;
let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});
afterAll(async () => {
	await window.happyDOM.close();
});

const DIR = 'safety/saying-ai-helped/';
const SOURCE = `${DIR}sources/truncate.py`;

async function show(props: Record<string, unknown> = {}): Promise<HTMLElement> {
	document.body.innerHTML = await container.renderToString(LineCompare, { props: { source: SOURCE, ...props } });
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function press(root: HTMLElement): void {
	part<HTMLButtonElement>(root, '.lc-check').click();
}

describe('mountLineCompare', () => {
	it('compares the preloaded code on a click and shows the report', async () => {
		const root = await show({ candidate: `${DIR}sample/generated.py` });
		mountLineCompare(root);
		const lines = part<HTMLPreElement>(root, '.lc-lines');
		expect(lines.hidden).toBe(true);
		press(root);
		expect(lines.hidden).toBe(false);
		expect(lines.textContent).toBe(
			'9 of 10 lines also appear in truncate.py\nlines not in truncate.py:\n  def shorten(text, limit, marker="..."):',
		);
	});
	it('clears the report when the text changes, and compares pasted text', async () => {
		const root = await show();
		mountLineCompare(root);
		const input = part<HTMLTextAreaElement>(root, '.lc-input');
		input.value = 'words = text.split()\nprint(words)';
		press(root);
		const lines = part<HTMLPreElement>(root, '.lc-lines');
		expect(lines.textContent).toBe(
			'1 of 2 lines also appear in truncate.py\nlines not in truncate.py:\n  print(words)',
		);
		input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
		expect(lines.textContent).toBe('');
		expect(lines.hidden).toBe(true);
	});
	it('writes nothing to local storage', async () => {
		const root = await show({ candidate: `${DIR}sample/rewritten.py` });
		const setItem = vi.spyOn(window.localStorage, 'setItem');
		mountLineCompare(root);
		press(root);
		expect(setItem).not.toHaveBeenCalled();
	});
	it('throws when data-source is not a named text', async () => {
		const root = await show();
		for (const bad of ['[]', 'null', '"x"', '{"name": "a.py"}', '{"text": "x"}']) {
			root.dataset.source = bad;
			expect(() => mountLineCompare(root)).toThrow(
				'data-source on the line comparer is not a JSON { name, text } object',
			);
		}
	});
});

describe('mountLineCompares', () => {
	it('mounts every instance and returns 0 on a page without one', async () => {
		const one = await container.renderToString(LineCompare, { props: { source: SOURCE } });
		const two = await container.renderToString(LineCompare, {
			props: { source: SOURCE, candidate: `${DIR}sample/rewritten.py`, showSource: false },
		});
		document.body.innerHTML = one + two;
		expect(mountLineCompares(document)).toBe(2);
		const [first, second] = [...document.querySelectorAll<HTMLElement>(ROOT_SELECTOR)] as [HTMLElement, HTMLElement];
		press(second);
		expect(part(first, '.lc-lines').textContent).toBe('');
		expect(part(second, '.lc-lines').textContent?.split('\n')[0]).toBe('3 of 6 lines also appear in truncate.py');
		document.body.innerHTML = '<p>no comparer</p>';
		expect(mountLineCompares(document)).toBe(0);
	});
	it('throws with the selector when the markup lacks a part the script needs', async () => {
		const root = await show();
		part(root, '.lc-lines').remove();
		expect(() => mountLineCompares(document)).toThrow('missing .lc-lines');
	});
});
