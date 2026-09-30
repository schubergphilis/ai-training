/**
 * The bias-in-patterns ranker script (`widgets/BiasInPatternsRanker.astro`):
 * a slider sets the points the simulated ranker adds to a list A name, and
 * the button ranks the twelve records twice, names swapped, and prints both
 * rankings and the totals. A change to the slider clears the old report so
 * it can't be read as the result of the new bonus. The ranker is
 * `bias-in-patterns-ranker-logic.ts`. Nothing is stored: the widget teaches
 * and never grades. No DOM access at import time, so it runs under Node in
 * the unit tests with a `happy-dom` document.
 */
import { rankBoth } from './bias-in-patterns-ranker-logic';
import { requiredElement } from './required-element';

/** The selector of each widget's root element. */
export const ROOT_SELECTOR = '[data-bias-in-patterns-ranker]';

/** Wires one widget instance. */
export function mountBiasInPatternsRanker(root: HTMLElement): void {
	const range = requiredElement<HTMLInputElement>(root, '.bp-bonus input[type=range]');
	const shown = requiredElement<HTMLOutputElement>(root, '.bp-bonus output');
	const button = requiredElement<HTMLButtonElement>(root, '.bp-go');
	const runs = requiredElement(root, '.bp-runs');
	const totals = requiredElement(root, '.bp-totals');

	const clear = () => {
		runs.textContent = '';
		totals.textContent = '';
	};

	button.addEventListener('click', () => {
		const report = rankBoth(Number(range.value));
		runs.textContent = report.runs.map((lines) => lines.join('\n')).join('\n\n');
		totals.textContent = report.totals;
	});
	range.addEventListener('input', () => {
		shown.value = range.value;
		clear();
	});
	shown.value = range.value;
}

/** Mounts every widget under `root`. Returns how many it mounted. */
export function mountBiasInPatternsRankers(root: ParentNode): number {
	const widgets = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const widget of widgets) mountBiasInPatternsRanker(widget);
	return widgets.length;
}
