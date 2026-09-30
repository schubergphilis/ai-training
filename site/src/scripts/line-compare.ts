/**
 * The line comparer script (`widgets/LineCompare.astro`): the Compare
 * button compares the text box with the widget's source file and shows the
 * report. An edit to the text clears the old report so it can't be read as
 * the result of the new text. The rules are `line-compare-logic.ts`.
 * Nothing is stored: the widget teaches and never grades. No DOM access at
 * import time, so it runs under Node in the unit tests with a `happy-dom`
 * document.
 */
import { compare } from './line-compare-logic';
import { requiredData, requiredElement } from './required-element';

/** The selector of each comparer's root element. */
export const ROOT_SELECTOR = '[data-line-compare]';

/** The source in `data-source`: a JSON `{ name, text }`. Throws on anything else. */
function sourceOf(root: HTMLElement): { name: string; text: string } {
	const value: unknown = JSON.parse(requiredData(root, 'source'));
	const valid =
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { name?: unknown }).name === 'string' &&
		typeof (value as { text?: unknown }).text === 'string';
	if (!valid) throw new Error('data-source on the line comparer is not a JSON { name, text } object');
	return value as { name: string; text: string };
}

/** Wires one comparer instance. */
export function mountLineCompare(root: HTMLElement): void {
	const source = sourceOf(root);
	const input = requiredElement<HTMLTextAreaElement>(root, '.lc-input');
	const button = requiredElement<HTMLButtonElement>(root, '.lc-check');
	const lines = requiredElement<HTMLPreElement>(root, '.lc-lines');

	button.addEventListener('click', () => {
		lines.textContent = compare(input.value, source.text, source.name).lines.join('\n');
		lines.hidden = false;
	});
	input.addEventListener('input', () => {
		lines.textContent = '';
		lines.hidden = true;
	});
}

/** Mounts every comparer under `root`. Returns how many it mounted. */
export function mountLineCompares(root: ParentNode): number {
	const widgets = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const widget of widgets) mountLineCompare(widget);
	return widgets.length;
}
