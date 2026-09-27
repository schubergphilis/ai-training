/**
 * The token counter script (`widgets/TokenCounter.astro`): the Count button
 * counts the text box and lists two reports, the counts of the text and the
 * pages of that size that fit in each window. An edit to the text clears
 * the old reports so they can't be read as the result of the new text. The
 * rules are `token-counter-logic.ts`. Nothing is stored: the widget teaches
 * and never grades. No DOM access at import time, so it runs under Node in
 * the unit tests with a `happy-dom` document.
 */
import { requiredElement } from './required-element';
import { countReport, estimateTokens, pagesReport } from './token-counter-logic';

/** The selector of each counter's root element. */
export const ROOT_SELECTOR = '[data-token-counter]';

/** Replaces the items of `list` with one `li` per line. */
function fill(list: Element, lines: string[]): void {
	list.replaceChildren(
		...lines.map((line) => {
			const li = list.ownerDocument.createElement('li');
			li.textContent = line;
			return li;
		}),
	);
}

/** Wires one counter instance. */
export function mountTokenCounter(root: HTMLElement): void {
	const input = requiredElement<HTMLTextAreaElement>(root, '.tc-input');
	const button = requiredElement<HTMLButtonElement>(root, '.tc-count');
	const counts = requiredElement(root, '.tc-counts');
	const pages = requiredElement(root, '.tc-pages');

	button.addEventListener('click', () => {
		fill(counts, countReport(input.value));
		fill(pages, pagesReport(estimateTokens(input.value)));
	});
	input.addEventListener('input', () => {
		counts.replaceChildren();
		pages.replaceChildren();
	});
}

/** Mounts every counter under `root`. Returns how many it mounted. */
export function mountTokenCounters(root: ParentNode): number {
	const counters = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const counter of counters) mountTokenCounter(counter);
	return counters.length;
}
