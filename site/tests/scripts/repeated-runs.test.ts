/**
 * Mounts `repeated-runs.ts` on the markup the component renders (Astro
 * Container API), so a class the script looks up and the template dropped
 * fails here. The Container API renders `.astro` files only in Vitest's Node
 * environment, so the markup goes into a `happy-dom` window made here. The
 * toy model is tested in `repeated-runs-logic.test.ts`.
 */
import RepeatedRuns from '@components/widgets/RepeatedRuns.astro';
import { mountRepeatedRun, mountRepeatedRuns, ROOT_SELECTOR } from '@scripts/repeated-runs';
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

async function show(): Promise<HTMLElement> {
	document.body.innerHTML = await container.renderToString(RepeatedRuns);
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function items(root: HTMLElement, selector: string): { cls: string; text: string }[] {
	return [...root.querySelectorAll(`${selector} li`)].map((li) => ({ cls: li.className, text: li.textContent ?? '' }));
}

function press(root: HTMLElement): void {
	part<HTMLButtonElement>(root, '.rr-go').click();
}

function slide(root: HTMLElement, value: string): void {
	const range = part<HTMLInputElement>(root, '.rr-temp input[type=range]');
	range.value = value;
	range.dispatchEvent(new window.Event('input') as unknown as Event);
}

function toggle(root: HTMLElement, selector: string): void {
	const box = part<HTMLInputElement>(root, selector);
	box.checked = !box.checked;
	box.dispatchEvent(new window.Event('change') as unknown as Event);
}

describe('mountRepeatedRun', () => {
	it('shows the starting temperature and an empty report', async () => {
		const root = await show();
		expect(mountRepeatedRuns(document)).toBe(1);
		expect(part<HTMLOutputElement>(root, '.rr-temp output').value).toBe('1.0');
		expect(part(root, '.rr-heading').textContent).toBe('');
		expect(items(root, '.rr-lines')).toEqual([]);
	});
	it('runs ten times at temperature 0 and lists the same answer on every line', async () => {
		const root = await show();
		mountRepeatedRun(root, Math.random);
		slide(root, '0');
		expect(part<HTMLOutputElement>(root, '.rr-temp output').value).toBe('0.0');
		press(root);
		expect(part(root, '.rr-heading').textContent).toBe('What is the capital of Australia? (temperature 0.0, 10 runs)');
		const lines = items(root, '.rr-lines');
		expect(lines).toHaveLength(10);
		expect(lines[0]).toEqual({ cls: '', text: ' 1  Canberra' });
		expect(lines[9]).toEqual({ cls: '', text: '10  Canberra' });
		expect(items(root, '.rr-summary').map((l) => l.text)).toEqual(['10 of 10 runs give the same answer as run 1']);
	});
	it('marks a failed answer and adds the check line when the check is on', async () => {
		const root = await show();
		// Every draw is near 1, so every run at temperature 1 lands on the last candidate, Sydney.
		mountRepeatedRun(root, () => 0.99999);
		toggle(root, '.rr-check');
		press(root);
		const lines = items(root, '.rr-lines');
		expect(lines[0]).toEqual({ cls: 'rr-fail', text: ' 1  FAIL  Sydney' });
		expect(items(root, '.rr-summary').map((l) => l.text)).toEqual([
			'10 of 10 runs give the same answer as run 1',
			'0 of 10 runs pass the check: the answer names Canberra',
		]);
	});
	it('clears the report when a setting changes', async () => {
		const root = await show();
		mountRepeatedRun(root, Math.random);
		for (const change of [
			() => slide(root, '0.5'),
			() => toggle(root, '.rr-jitter'),
			() => toggle(root, '.rr-check'),
		]) {
			press(root);
			expect(items(root, '.rr-lines')).toHaveLength(10);
			change();
			expect(part(root, '.rr-heading').textContent).toBe('');
			expect(items(root, '.rr-lines')).toEqual([]);
			expect(items(root, '.rr-summary')).toEqual([]);
		}
	});
	it('mounts none on a page without the widget, and throws when the markup lacks a part', () => {
		document.body.innerHTML = '<p>no widget</p>';
		expect(mountRepeatedRuns(document)).toBe(0);
		document.body.innerHTML = '<div data-repeated-runs></div>';
		expect(() => mountRepeatedRuns(document)).toThrow('missing .rr-temp input[type=range]');
	});
});
