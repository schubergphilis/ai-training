/**
 * Mounts `bias-in-patterns-ranker.ts` on the markup the component renders
 * (Astro Container API), so a class the script looks up and the template
 * dropped fails here. The Container API renders `.astro` files only in
 * Vitest's Node environment, so the markup goes into a `happy-dom` window
 * made here. The ranker is tested in `bias-in-patterns-ranker-logic.test.ts`.
 */
import BiasInPatternsRanker from '@components/widgets/BiasInPatternsRanker.astro';
import { mountBiasInPatternsRanker, mountBiasInPatternsRankers, ROOT_SELECTOR } from '@scripts/bias-in-patterns-ranker';
import { rankBoth } from '@scripts/bias-in-patterns-ranker-logic';
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
	document.body.innerHTML = await container.renderToString(BiasInPatternsRanker);
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function press(root: HTMLElement): void {
	part<HTMLButtonElement>(root, '.bp-go').click();
}

function slide(root: HTMLElement, value: string): void {
	const range = part<HTMLInputElement>(root, '.bp-bonus input[type=range]');
	range.value = value;
	range.dispatchEvent(new window.Event('input') as unknown as Event);
}

describe('mountBiasInPatternsRanker', () => {
	it('starts at 2 points with an empty report', async () => {
		const root = await show();
		expect(mountBiasInPatternsRankers(document)).toBe(1);
		const range = part<HTMLInputElement>(root, '.bp-bonus input[type=range]');
		expect([range.min, range.max, range.value]).toEqual(['0', '6', '2']);
		expect(part<HTMLOutputElement>(root, '.bp-bonus output').value).toBe('2');
		expect(part(root, '.bp-runs').textContent).toBe('');
		expect(part(root, '.bp-totals').textContent).toBe('');
	});
	it('prints both runs, a blank line apart, and the totals at 2 points', async () => {
		const root = await show();
		mountBiasInPatternsRanker(root);
		press(root);
		const report = rankBoth(2);
		const runs = part(root, '.bp-runs').textContent ?? '';
		expect(runs).toBe(`${report.runs[0]?.join('\n')}\n\n${report.runs[1]?.join('\n')}`);
		expect(runs.split('\n')[0]).toBe('Run 1');
		expect(part(root, '.bp-totals').textContent).toBe('shortlisted over both runs: list A 8, list B 4');
	});
	it('clears the report when the slider moves, and ranks at the new bonus on the next press', async () => {
		const root = await show();
		mountBiasInPatternsRanker(root);
		press(root);
		slide(root, '0');
		expect(part<HTMLOutputElement>(root, '.bp-bonus output').value).toBe('0');
		expect(part(root, '.bp-runs').textContent).toBe('');
		expect(part(root, '.bp-totals').textContent).toBe('');
		press(root);
		expect(part(root, '.bp-totals').textContent).toBe('shortlisted over both runs: list A 6, list B 6');
	});
	it('mounts none on a page without the widget, and throws when the markup lacks a part', () => {
		document.body.innerHTML = '<p>no widget</p>';
		expect(mountBiasInPatternsRankers(document)).toBe(0);
		document.body.innerHTML = '<div data-bias-in-patterns-ranker></div>';
		expect(() => mountBiasInPatternsRankers(document)).toThrow('missing .bp-bonus input[type=range]');
	});
});
