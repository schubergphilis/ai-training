/**
 * The repeated-runs script (`widgets/RepeatedRuns.astro`): a temperature
 * slider and two switches, jitter and check, set up the toy model, and the
 * button runs it ten times and lists the answers and the summary lines. A
 * change to a setting clears the old report so it can't be read as the
 * result of the new settings. The toy model is `repeated-runs-logic.ts`.
 * Nothing is stored: the widget teaches and never grades. No DOM access at
 * import time, so it runs under Node in the unit tests with a `happy-dom`
 * document.
 */
import { type RunSettings, runMany } from './repeated-runs-logic';
import { requiredElement } from './required-element';

/** The selector of each widget's root element. */
export const ROOT_SELECTOR = '[data-repeated-runs]';

/** Wires one widget instance. `random` gives uniform numbers in [0, 1); the unit tests pass their own. */
export function mountRepeatedRun(root: HTMLElement, random: () => number = Math.random): void {
	const range = requiredElement<HTMLInputElement>(root, '.rr-temp input[type=range]');
	const shown = requiredElement<HTMLOutputElement>(root, '.rr-temp output');
	const jitter = requiredElement<HTMLInputElement>(root, '.rr-jitter');
	const check = requiredElement<HTMLInputElement>(root, '.rr-check');
	const button = requiredElement<HTMLButtonElement>(root, '.rr-go');
	const heading = requiredElement(root, '.rr-heading');
	const lines = requiredElement(root, '.rr-lines');
	const summary = requiredElement(root, '.rr-summary');

	const settings = (): RunSettings => ({
		temperature: Number(range.value),
		jitter: jitter.checked,
		check: check.checked,
	});
	const clear = () => {
		heading.textContent = '';
		lines.replaceChildren();
		summary.replaceChildren();
	};
	const item = (text: string, className?: string) => {
		const li = root.ownerDocument.createElement('li');
		if (className) li.className = className;
		li.textContent = text;
		return li;
	};

	button.addEventListener('click', () => {
		const run = runMany(random, settings());
		heading.textContent = run.heading;
		lines.replaceChildren(...run.lines.map((line) => item(line.text, line.ok ? undefined : 'rr-fail')));
		summary.replaceChildren(...run.summary.map((line) => item(line)));
	});
	range.addEventListener('input', () => {
		shown.value = Number(range.value).toFixed(1);
		clear();
	});
	jitter.addEventListener('change', clear);
	check.addEventListener('change', clear);
	shown.value = Number(range.value).toFixed(1);
}

/** Mounts every widget under `root`. Returns how many it mounted. */
export function mountRepeatedRuns(root: ParentNode, random: () => number = Math.random): number {
	const widgets = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const widget of widgets) mountRepeatedRun(widget, random);
	return widgets.length;
}
