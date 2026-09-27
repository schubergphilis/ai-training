/**
 * Mounts `claim-checker.ts` on the markup the component renders (Astro
 * Container API), so a class the script looks up and the template dropped
 * fails here. The markup goes into a `happy-dom` window made here, as in
 * `format-checker.test.ts`. The rules are tested in
 * `claim-checker-logic.test.ts`, and what the template renders in
 * `tests/components/claim-checker.test.ts`.
 */
import ClaimChecker from '@components/widgets/ClaimChecker.astro';
import { mountClaimChecker, mountClaimCheckers, ROOT_SELECTOR } from '@scripts/claim-checker';
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

const DIR = 'safety/spotting-hallucination/';
const SOURCES = [`${DIR}sources/report.txt`, `${DIR}sources/minutes.txt`];

async function show(props: Record<string, unknown> = {}): Promise<HTMLElement> {
	document.body.innerHTML = await container.renderToString(ClaimChecker, { props: { sources: SOURCES, ...props } });
	return document.querySelector(ROOT_SELECTOR) as HTMLElement;
}

function part<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
	return root.querySelector(selector) as T;
}

function press(root: HTMLElement): void {
	part<HTMLButtonElement>(root, '.cc-check').click();
}

function report(root: HTMLElement): { cls: string; text: string }[] {
	return [...root.querySelectorAll('.cc-lines span')].map((s) => ({ cls: s.className, text: s.textContent ?? '' }));
}

describe('mountClaimChecker', () => {
	it('checks the preloaded summary on a click and marks each claim with no source', async () => {
		const root = await show({ summary: `${DIR}sample/summary_1.txt` });
		mountClaimChecker(root);
		const lines = part<HTMLPreElement>(root, '.cc-lines');
		expect(lines.hidden).toBe(true);
		press(root);
		expect(lines.hidden).toBe(false);
		expect(report(root).filter((r) => r.cls === 'cc-missing')).toEqual([
			{ cls: 'cc-missing', text: 'NO SOURCE  50 passengers' },
			{ cls: 'cc-missing', text: 'NO SOURCE  38 percent' },
			{ cls: 'cc-missing', text: 'NO SOURCE  9,000 passengers' },
			{ cls: 'cc-missing', text: 'NO SOURCE  "Racks before car parks, every time."' },
		]);
		expect(report(root)).toHaveLength(21);
		expect(lines.textContent?.split('\n').at(-1)).toBe('4 of 12 claims have no source');
	});
	it('clears the report when the summary changes, and checks pasted text', async () => {
		const root = await show();
		mountClaimChecker(root);
		const input = part<HTMLTextAreaElement>(root, '.cc-input');
		input.value = 'The team counted 891 bicycles.';
		press(root);
		expect(report(root).map((r) => r.text)).toEqual(['NO SOURCE  891 bicycles', '1 of 1 claims have no source']);
		input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
		expect(report(root)).toEqual([]);
		expect(part<HTMLPreElement>(root, '.cc-lines').hidden).toBe(true);
	});
	it('writes nothing to local storage', async () => {
		const root = await show({ summary: `${DIR}sample/summary_2.txt` });
		const setItem = vi.spyOn(window.localStorage, 'setItem');
		mountClaimChecker(root);
		press(root);
		expect(setItem).not.toHaveBeenCalled();
	});
	it('throws when data-sources is not a list of named texts', async () => {
		const root = await show();
		for (const bad of ['{}', '[]', '[{"name": "a.txt"}]', '[null]']) {
			root.dataset.sources = bad;
			expect(() => mountClaimChecker(root)).toThrow(
				'data-sources on the claim checker is not a JSON list of { name, text } objects',
			);
		}
	});
});

describe('mountClaimCheckers', () => {
	it('mounts every instance and returns 0 on a page without one', async () => {
		const one = await container.renderToString(ClaimChecker, { props: { sources: SOURCES } });
		const two = await container.renderToString(ClaimChecker, {
			props: { sources: SOURCES, summary: `${DIR}sample/summary_2.txt`, showSources: false },
		});
		document.body.innerHTML = one + two;
		expect(mountClaimCheckers(document)).toBe(2);
		const [first, second] = [...document.querySelectorAll<HTMLElement>(ROOT_SELECTOR)] as [HTMLElement, HTMLElement];
		press(second);
		expect(report(first)).toEqual([]);
		expect(report(second).at(-1)?.text).toBe('2 of 12 claims have no source');
		document.body.innerHTML = '<p>no checker</p>';
		expect(mountClaimCheckers(document)).toBe(0);
	});
	it('throws with the selector when the markup lacks a part the script needs', async () => {
		const root = await show();
		part(root, '.cc-lines').remove();
		expect(() => mountClaimCheckers(document)).toThrow('missing .cc-lines');
	});
});
