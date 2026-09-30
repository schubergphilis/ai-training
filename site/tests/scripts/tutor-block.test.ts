// @vitest-environment happy-dom
/**
 * Mounts `tutor-block.ts` on hand-written copy buttons like the ones
 * `lesson/TutorBlock.astro` renders, with a stub clipboard. The component
 * test renders the markup itself, and the e2e suite checks the block on a
 * built lesson page.
 */
import { mountTutorBlock, RESTORE_MS } from '@scripts/tutor-block';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const markup = `
<aside class="tutor-block not-content" data-tutor-block>
	<div class="tutor-line"><pre><code>npx skills add</code></pre>
		<button type="button" class="tutor-copy" data-copy="npx skills add">Copy</button></div>
	<div class="tutor-line"><pre><code>/ai-tutor https://example.org/l/</code></pre>
		<button type="button" class="tutor-copy" data-copy="/ai-tutor https://example.org/l/">Copy</button></div>
</aside>`;

const writeText = vi.fn<(text: string) => Promise<void>>();

function buttons(): HTMLButtonElement[] {
	return [...document.querySelectorAll<HTMLButtonElement>('.tutor-copy')];
}

/** Clicks `button` and lets the clipboard promise settle. */
async function click(button: HTMLButtonElement | undefined): Promise<void> {
	if (!button) throw new Error('test markup has no such button');
	button.click();
	await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
	vi.useFakeTimers();
	writeText.mockReset();
	writeText.mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
	document.body.innerHTML = markup;
});

afterEach(() => {
	vi.useRealTimers();
});

describe('mountTutorBlock', () => {
	it('copies the data-copy text of the clicked button and shows Copied, then restores the label', async () => {
		expect(mountTutorBlock(document)).toBe(2);
		await click(buttons()[1]);
		expect(writeText).toHaveBeenCalledExactlyOnceWith('/ai-tutor https://example.org/l/');
		expect(buttons()[1]?.textContent).toBe('Copied');
		expect(buttons()[0]?.textContent).toBe('Copy');
		await vi.advanceTimersByTimeAsync(RESTORE_MS);
		expect(buttons()[1]?.textContent).toBe('Copy');
	});
	it('asks the learner to select and copy when the clipboard refuses', async () => {
		writeText.mockRejectedValue(new Error('denied'));
		mountTutorBlock(document);
		await click(buttons()[0]);
		expect(buttons()[0]?.textContent).toBe('Select and copy');
		await vi.advanceTimersByTimeAsync(RESTORE_MS);
		expect(buttons()[0]?.textContent).toBe('Copy');
	});
	it('restores the original label after a second click before the first restore', async () => {
		mountTutorBlock(document);
		await click(buttons()[0]);
		await click(buttons()[0]);
		await vi.advanceTimersByTimeAsync(RESTORE_MS);
		expect(buttons()[0]?.textContent).toBe('Copy');
	});
	it('wires nothing on a page without the block', () => {
		document.body.innerHTML = '<button class="tutor-copy" data-copy="x">Copy</button>';
		expect(mountTutorBlock(document)).toBe(0);
	});
	it('throws with the attribute name when a copy button has no data-copy', () => {
		buttons()[0]?.removeAttribute('data-copy');
		expect(() => mountTutorBlock(document)).toThrow('missing data-copy');
	});
});
