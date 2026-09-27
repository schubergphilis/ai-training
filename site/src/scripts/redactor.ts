/**
 * The redaction widget script (`widgets/Redactor.astro`): the button runs
 * the pass over the text box with the map box, shows the result and, when
 * the widget has a watch box, the `still identifying:` line for the result.
 * An edit to any box clears the old result so it can't be read as the
 * result of the new text. The rules are `redactor-logic.ts`. Nothing is
 * stored: the widget teaches and never grades. No DOM access at import
 * time, so it runs under Node in the unit tests with a `happy-dom` document.
 */
import { runPass } from './redactor-logic';
import { requiredData, requiredElement } from './required-element';

/** The selector of each redactor's root element. */
export const ROOT_SELECTOR = '[data-redactor]';

/** Wires one redactor instance. */
export function mountRedactor(root: HTMLElement): void {
	const action = requiredData(root, 'action');
	if (action !== 'redact' && action !== 'restore')
		throw new Error(`data-action on the redactor is ${action}, and it must be redact or restore`);
	const text = requiredElement<HTMLTextAreaElement>(root, '.rd-text');
	const map = requiredElement<HTMLTextAreaElement>(root, '.rd-map');
	const watch = root.querySelector<HTMLTextAreaElement>('.rd-watch');
	const button = requiredElement<HTMLButtonElement>(root, '.rd-run');
	const output = requiredElement<HTMLPreElement>(root, '.rd-output');
	const leaks = requiredElement(root, '.rd-leaks');
	const error = requiredElement(root, '.rd-error');

	const clear = () => {
		output.textContent = '';
		output.hidden = true;
		leaks.textContent = '';
		error.textContent = '';
	};
	button.addEventListener('click', () => {
		const result = runPass(action, text.value, map.value, watch === null ? null : watch.value);
		output.textContent = result.text ?? '';
		output.hidden = result.text === null;
		leaks.textContent = result.leaks ?? '';
		error.textContent = result.error ?? '';
	});
	for (const box of [text, map, watch]) box?.addEventListener('input', clear);
}

/** Mounts every redactor under `root`. Returns how many it mounted. */
export function mountRedactors(root: ParentNode): number {
	const redactors = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const redactor of redactors) mountRedactor(redactor);
	return redactors.length;
}
