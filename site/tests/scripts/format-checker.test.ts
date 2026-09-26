/**
 * Mounts `format-checker.ts` on the markup the component renders (Astro
 * Container API), so a class the script looks up and the template dropped
 * fails here. The Container API renders `.astro` files only in Vitest's Node
 * environment, so the markup goes into a `happy-dom` window made here. The
 * rules are tested in `format-checker-logic.test.ts`, and what the template
 * renders in `tests/components/format-checker.test.ts`.
 */
import FormatChecker from '@components/widgets/FormatChecker.astro';
import { mountFormatChecker, mountFormatCheckers, ROOT_SELECTOR } from '@scripts/format-checker';
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

async function show(props: Record<string, unknown> = {}): Promise<HTMLElement> {
	document.body.innerHTML = await container.renderToString(FormatChecker, { props });
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function results(root: HTMLElement): { cls: string; text: string }[] {
	return [...root.querySelectorAll('.fc-lines li')].map((li) => ({ cls: li.className, text: li.textContent ?? '' }));
}

function type(root: HTMLElement, value: string): void {
	const input = part<HTMLTextAreaElement>(root, '.fc-input');
	input.value = value;
	input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
}

describe('mountFormatChecker', () => {
	it('checks the preloaded one-line sample on a click and lists every item as ok', async () => {
		const root = await show({ sample: 'concepts/structured-output/sample/lines.txt' });
		mountFormatChecker(root);
		expect(results(root)).toEqual([]);
		part<HTMLButtonElement>(root, '.fc-check').click();
		expect(results(root).map((r) => r.cls)).toEqual(['fc-ok', 'fc-ok', 'fc-ok', 'fc-ok']);
		expect(results(root)[0]?.text).toBe('ok 1: Jonas, fix the password reset email address, 2026-10-03, high');
		expect(part(root, '.fc-summary').textContent).toBe('4 of 4 items pass');
	});
	it('fails the bare JSON sample', async () => {
		const root = await show({ sample: 'concepts/structured-output/sample/bare.json' });
		mountFormatChecker(root);
		part<HTMLButtonElement>(root, '.fc-check').click();
		expect(results(root).every((r) => r.cls === 'fc-fail')).toBe(true);
		expect(results(root)).toHaveLength(7);
		expect(part(root, '.fc-summary').textContent).toBe('0 of 4 items pass');
	});
	it('clears the report when the text changes, and shows no summary for a file-level error', async () => {
		const root = await show();
		mountFormatChecker(root);
		part<HTMLButtonElement>(root, '.fc-check').click();
		expect(results(root)).toEqual([{ cls: 'fc-fail', text: 'FAIL: the file is empty' }]);
		expect(part(root, '.fc-summary').textContent).toBe('');
		type(root, 'owner: A | task: t | due: 2026-10-03 | priority: high');
		expect(results(root)).toEqual([]);
		part<HTMLButtonElement>(root, '.fc-check').click();
		expect(part(root, '.fc-summary').textContent).toBe('1 of 1 items pass');
		type(root, 'x');
		expect(part(root, '.fc-summary').textContent).toBe('');
	});
	it('checks with the fields and priorities the component was given', async () => {
		const root = await show({ fields: ['owner', 'status'], priorities: ['p1'] });
		mountFormatChecker(root);
		type(root, 'owner: A | status: open | priority: p1');
		part<HTMLButtonElement>(root, '.fc-check').click();
		expect(results(root)).toEqual([{ cls: 'fc-fail', text: 'FAIL 1: unexpected priority' }]);
	});
	it('writes nothing to local storage', async () => {
		const root = await show({ sample: 'concepts/structured-output/sample/items.json' });
		const setItem = vi.spyOn(window.localStorage, 'setItem');
		mountFormatChecker(root);
		part<HTMLButtonElement>(root, '.fc-check').click();
		expect(setItem).not.toHaveBeenCalled();
		expect(window.localStorage.length).toBe(0);
	});
	it('throws when a data attribute is not a list of strings', async () => {
		const root = await show();
		root.dataset.fields = '{"owner": 1}';
		expect(() => mountFormatChecker(root)).toThrow('data-fields on the format checker is not a JSON list of strings');
		root.dataset.fields = '[1]';
		expect(() => mountFormatChecker(root)).toThrow('not a JSON list of strings');
	});
});

describe('mountFormatCheckers', () => {
	it('mounts every instance, each checking its own text, and returns 0 on a page without one', async () => {
		const one = await container.renderToString(FormatChecker, {
			props: { sample: 'concepts/structured-output/sample/lines.txt' },
		});
		const two = await container.renderToString(FormatChecker, {
			props: { sample: 'concepts/structured-output/sample/bare.json' },
		});
		document.body.innerHTML = one + two;
		expect(mountFormatCheckers(document)).toBe(2);
		const [first, second] = [...document.querySelectorAll<HTMLElement>(ROOT_SELECTOR)] as [HTMLElement, HTMLElement];
		part<HTMLButtonElement>(second, '.fc-check').click();
		expect(results(first)).toEqual([]);
		expect(part(second, '.fc-summary').textContent).toBe('0 of 4 items pass');
		document.body.innerHTML = '<p>no checker</p>';
		expect(mountFormatCheckers(document)).toBe(0);
	});
	it('throws with the selector when the markup lacks a part the script needs', async () => {
		const root = await show();
		part(root, '.fc-summary').remove();
		expect(() => mountFormatCheckers(document)).toThrow('missing .fc-summary');
	});
});
