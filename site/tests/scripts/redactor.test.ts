/**
 * Mounts `redactor.ts` on the markup the component renders (Astro Container
 * API), so a class the script looks up and the template dropped fails here.
 * The markup goes into a `happy-dom` window made here, as in
 * `format-checker.test.ts`. The rules are tested in
 * `redactor-logic.test.ts`, and what the template renders in
 * `tests/components/redactor.test.ts`.
 */
import Redactor from '@components/widgets/Redactor.astro';
import { mountRedactor, mountRedactors, ROOT_SELECTOR } from '@scripts/redactor';
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

const DIR = 'safety/redact-before-you-paste/sample/';

async function show(props: Record<string, unknown>): Promise<HTMLElement> {
	document.body.innerHTML = await container.renderToString(Redactor, { props });
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function type(root: HTMLElement, selector: string, value: string): void {
	const box = part<HTMLTextAreaElement>(root, selector);
	box.value = value;
	box.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
}

function press(root: HTMLElement): void {
	part<HTMLButtonElement>(root, '.rd-run').click();
}

describe('mountRedactor', () => {
	it('redacts the preloaded email on a click and shows the result', async () => {
		const root = await show({ text: `${DIR}email.txt`, map: `${DIR}email-map.txt` });
		mountRedactor(root);
		const output = part<HTMLPreElement>(root, '.rd-output');
		expect(output.hidden).toBe(true);
		press(root);
		expect(output.hidden).toBe(false);
		expect(output.textContent).toContain('From: Person 1 <[email]>');
		expect(part(root, '.rd-leaks').textContent).toBe('');
		expect(part(root, '.rd-error').textContent).toBe('');
	});
	it('prints the leak line for the colleague version, and none after the map covers it', async () => {
		const root = await show({ text: `${DIR}partial.txt`, watch: `${DIR}watch.txt` });
		mountRedactor(root);
		press(root);
		expect(part(root, '.rd-leaks').textContent).toBe('still identifying: initials, account number, city, technician');
		type(root, '.rd-map', 'R. A. => Person 1\nNB-4471-0928 => [account number]\nZwolle => [city]');
		expect(part(root, '.rd-leaks').textContent).toBe('');
		press(root);
		expect(part(root, '.rd-leaks').textContent).toBe('still identifying: technician');
		type(root, '.rd-map', `${part<HTMLTextAreaElement>(root, '.rd-map').value}\nTijmen Boskoorn => Person 2`);
		press(root);
		expect(part(root, '.rd-leaks').textContent).toBe('still identifying: none of the listed details');
	});
	it('restores the reply with the map', async () => {
		const root = await show({ action: 'restore', text: `${DIR}reply.txt`, map: `${DIR}email-map.txt` });
		mountRedactor(root);
		press(root);
		expect(part(root, '.rd-output').textContent?.startsWith('Dear Renske Adelhof,')).toBe(true);
	});
	it('shows the error for a map line it cannot read, and clears it on an edit', async () => {
		const root = await show({ text: `${DIR}ticket.txt` });
		mountRedactor(root);
		type(root, '.rd-map', 'Renske Adelhof -> Person 1');
		press(root);
		expect(part(root, '.rd-error').textContent).toBe("map line without ' => ': Renske Adelhof -> Person 1");
		expect(part<HTMLPreElement>(root, '.rd-output').hidden).toBe(true);
		type(root, '.rd-text', 'x');
		expect(part(root, '.rd-error').textContent).toBe('');
	});
	it('writes nothing to local storage', async () => {
		const root = await show({ text: `${DIR}email.txt`, map: `${DIR}email-map.txt` });
		const setItem = vi.spyOn(window.localStorage, 'setItem');
		mountRedactor(root);
		press(root);
		expect(setItem).not.toHaveBeenCalled();
	});
	it('throws on an action it does not know', async () => {
		const root = await show({ text: `${DIR}email.txt` });
		root.dataset.action = 'shred';
		expect(() => mountRedactor(root)).toThrow('data-action on the redactor is shred, and it must be redact or restore');
	});
});

describe('mountRedactors', () => {
	it('mounts every instance, each with its own boxes, and returns 0 on a page without one', async () => {
		const one = await container.renderToString(Redactor, { props: { text: `${DIR}email.txt` } });
		const two = await container.renderToString(Redactor, {
			props: { text: `${DIR}email.txt`, map: `${DIR}email-map.txt` },
		});
		document.body.innerHTML = one + two;
		expect(mountRedactors(document)).toBe(2);
		const [first, second] = [...document.querySelectorAll<HTMLElement>(ROOT_SELECTOR)] as [HTMLElement, HTMLElement];
		press(second);
		expect(part(first, '.rd-output').textContent).toBe('');
		expect(part(second, '.rd-output').textContent).toContain('Person 2');
		document.body.innerHTML = '<p>no redactor</p>';
		expect(mountRedactors(document)).toBe(0);
	});
	it('throws with the selector when the markup lacks a part the script needs', async () => {
		const root = await show({ text: `${DIR}email.txt` });
		part(root, '.rd-leaks').remove();
		expect(() => mountRedactors(document)).toThrow('missing .rd-leaks');
	});
});
