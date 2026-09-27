/**
 * Mounts `token-counter.ts` on the markup the component renders (Astro
 * Container API), so a class the script looks up and the template dropped
 * fails here. The Container API renders `.astro` files only in Vitest's Node
 * environment, so the markup goes into a `happy-dom` window made here. The
 * rules are tested in `token-counter-logic.test.ts`.
 */
import TokenCounter from '@components/widgets/TokenCounter.astro';
import { mountTokenCounter, mountTokenCounters, ROOT_SELECTOR } from '@scripts/token-counter';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

async function show(props: Record<string, unknown> = {}): Promise<HTMLElement> {
	document.body.innerHTML = await container.renderToString(TokenCounter, { props });
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function items(root: HTMLElement, selector: string): string[] {
	return [...root.querySelectorAll(`${selector} li`)].map((li) => li.textContent ?? '');
}

function press(root: HTMLElement): void {
	part<HTMLButtonElement>(root, '.tc-count').click();
}

describe('mountTokenCounter', () => {
	it('lists the counts and the pages of the sample on Count', async () => {
		const root = await show({ sample: 'concepts/context-window/sample/notes.txt' });
		expect(mountTokenCounters(document)).toBe(1);
		expect(items(root, '.tc-counts')).toEqual([]);
		press(root);
		expect(items(root, '.tc-counts')).toEqual(['characters: 460', 'words: 80', 'tokens (estimate): 115']);
		expect(items(root, '.tc-pages')).toEqual([
			'one page: 115 tokens',
			'8,000-token window: 69 pages',
			'32,000-token window: 278 pages',
			'200,000-token window: 1,739 pages',
			'1,000,000-token window: 8,695 pages',
		]);
	});
	it('counts pasted text and clears the report on an edit', async () => {
		const root = await show();
		mountTokenCounter(root);
		const input = part<HTMLTextAreaElement>(root, '.tc-input');
		input.value = 'Hello, world!';
		press(root);
		expect(items(root, '.tc-counts')).toEqual(['characters: 13', 'words: 2', 'tokens (estimate): 4']);
		expect(items(root, '.tc-pages')[0]).toBe('one page: 4 tokens');
		input.value = 'Hello';
		input.dispatchEvent(new window.Event('input') as unknown as Event);
		expect(items(root, '.tc-counts')).toEqual([]);
		expect(items(root, '.tc-pages')).toEqual([]);
	});
	it('mounts none on a page without a counter', () => {
		document.body.innerHTML = '<p>no widget</p>';
		expect(mountTokenCounters(document)).toBe(0);
	});
	it('throws with the selector when the markup lacks a part', () => {
		document.body.innerHTML = '<div data-token-counter><textarea class="tc-input"></textarea></div>';
		expect(() => mountTokenCounters(document)).toThrow('missing .tc-count');
	});
});
