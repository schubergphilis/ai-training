/**
 * The claim checker script (`widgets/ClaimChecker.astro`): the Check button
 * checks the summary in the text box against the widget's sources and shows
 * the report, with each `NO SOURCE` line marked. An edit to the summary
 * clears the old report so it can't be read as the result of the new text.
 * The rules are `claim-checker-logic.ts`. Nothing is stored: the widget
 * teaches and never grades. No DOM access at import time, so it runs under
 * Node in the unit tests with a `happy-dom` document.
 */
import { check, type Source, source } from './claim-checker-logic';
import { requiredData, requiredElement } from './required-element';

/** The selector of each checker's root element. */
export const ROOT_SELECTOR = '[data-claim-checker]';

/** The sources in `data-sources`: a JSON list of `{ name, text }`. Throws on anything else. */
function sourcesOf(root: HTMLElement): Source[] {
	const value: unknown = JSON.parse(requiredData(root, 'sources'));
	const valid =
		Array.isArray(value) &&
		value.length > 0 &&
		value.every(
			(v) =>
				typeof v === 'object' &&
				v !== null &&
				typeof (v as { name?: unknown }).name === 'string' &&
				typeof (v as { text?: unknown }).text === 'string',
		);
	if (!valid) throw new Error('data-sources on the claim checker is not a JSON list of { name, text } objects');
	return (value as { name: string; text: string }[]).map((f) => source(f.name, f.text));
}

/** Wires one checker instance. */
export function mountClaimChecker(root: HTMLElement): void {
	const sources = sourcesOf(root);
	const input = requiredElement<HTMLTextAreaElement>(root, '.cc-input');
	const button = requiredElement<HTMLButtonElement>(root, '.cc-check');
	const lines = requiredElement<HTMLPreElement>(root, '.cc-lines');

	button.addEventListener('click', () => {
		const report = check(input.value, sources);
		lines.replaceChildren(
			...report.lines.flatMap((line, i) => {
				const span = root.ownerDocument.createElement('span');
				span.className = line.startsWith('NO SOURCE') ? 'cc-missing' : 'cc-line';
				span.textContent = line;
				return i === 0 ? [span] : [root.ownerDocument.createTextNode('\n'), span];
			}),
		);
		lines.hidden = false;
	});
	input.addEventListener('input', () => {
		lines.replaceChildren();
		lines.hidden = true;
	});
}

/** Mounts every checker under `root`. Returns how many it mounted. */
export function mountClaimCheckers(root: ParentNode): number {
	const checkers = root.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
	for (const checker of checkers) mountClaimChecker(checker);
	return checkers.length;
}
