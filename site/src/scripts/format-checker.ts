/**
 * The format checker script (`widgets/FormatChecker.astro`): the Check
 * button checks the text box and lists the report, and an edit to the text
 * clears the old report so it can't be read as the result of the new text.
 * The rules are `format-checker-logic.ts`. Nothing is stored: the widget
 * teaches and never grades. No DOM access at import time, so it runs under
 * Node in the unit tests with a `happy-dom` document.
 */
import { type CheckerConfig, check } from './format-checker-logic';
import { requiredData, requiredElement } from './required-element';

/** The selector of each checker's root element. */
export const ROOT_SELECTOR = '[data-format-checker]';

/** A list of strings in a `data-*` attribute; throws when the value is anything else. */
function stringList(root: HTMLElement, key: string): string[] {
	const value: unknown = JSON.parse(requiredData(root, key));
	if (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))
		throw new Error(`data-${key} on the format checker is not a JSON list of strings`);
	return value;
}

/** Wires one checker instance. */
export function mountFormatChecker(root: HTMLElement): void {
	const config: CheckerConfig = { fields: stringList(root, 'fields'), priorities: stringList(root, 'priorities') };
	const input = requiredElement<HTMLTextAreaElement>(root, '.fc-input');
	const button = requiredElement<HTMLButtonElement>(root, '.fc-check');
	const lines = requiredElement(root, '.fc-lines');
	const summary = requiredElement(root, '.fc-summary');

	button.addEventListener('click', () => {
		const report = check(input.value, config);
		lines.replaceChildren(
			...report.lines.map((line) => {
				const li = root.ownerDocument.createElement('li');
				li.className = line.ok ? 'fc-ok' : 'fc-fail';
				li.textContent = line.text;
				return li;
			}),
		);
		summary.textContent = report.summary ?? '';
	});
	input.addEventListener('input', () => {
		lines.replaceChildren();
		summary.textContent = '';
	});
}

/** Mounts every checker under `root`. Returns how many it mounted. */
export function mountFormatCheckers(root: ParentNode): number {
	const checkers = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const checker of checkers) mountFormatChecker(checker);
	return checkers.length;
}
