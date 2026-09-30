/**
 * Text contrast of the site theme in both color schemes (spec S14 "How
 * it's checked"). Each pair resolves two color tokens on a lesson page and
 * asserts the WCAG 2 contrast ratio: 4.5:1 for text, 3:1 for a state fill
 * or a border that carries meaning. A palette change that makes text hard
 * to read fails here.
 */
import { expect, test } from './fixtures';

type Pair = { what: string; fg: string; bg: string; min: number };

/** Text and state colors sit both on the page and on a surface (a checkpoint, a widget, a card). */
const GROUNDS = ['--at-page', '--at-surface'];
const ON_BOTH: Omit<Pair, 'bg'>[] = [
	{ what: 'body text', fg: '--sl-color-text', min: 4.5 },
	{ what: 'secondary text', fg: '--sl-color-gray-3', min: 4.5 },
	{ what: 'link text', fg: '--sl-color-text-accent', min: 4.5 },
	{ what: 'done text', fg: '--at-done-text', min: 4.5 },
	{ what: 'warning text', fg: '--at-warn', min: 4.5 },
	{ what: 'done fill', fg: '--at-done', min: 3 },
	{ what: 'accent border', fg: '--sl-color-accent', min: 3 },
];
const PAIRS: Pair[] = [
	...ON_BOTH.flatMap((p) => GROUNDS.map((bg) => ({ ...p, what: `${p.what} on ${bg}`, bg }))),
	{ what: 'body text in a hint or code sample', fg: '--sl-color-text', bg: '--at-inset', min: 4.5 },
	{ what: 'prompt and response header text', fg: '--sl-color-gray-2', bg: '--sl-color-accent-low', min: 4.5 },
	{ what: 'illustrative prompt header text', fg: '--at-warn', bg: '--sl-color-accent-low', min: 4.5 },
	{ what: 'link text in the sidebar', fg: '--sl-color-text-accent', bg: '--sl-color-bg-sidebar', min: 4.5 },
	{ what: 'secondary text in the sidebar', fg: '--sl-color-gray-3', bg: '--sl-color-bg-sidebar', min: 4.5 },
	{ what: 'link text in the right-hand menu', fg: '--sl-color-text-accent', bg: '--at-sidebar-2', min: 4.5 },
	{ what: 'secondary text in the right-hand menu', fg: '--sl-color-gray-3', bg: '--at-sidebar-2', min: 4.5 },
	{ what: 'text on an accent fill', fg: '--sl-color-text-invert', bg: '--sl-color-bg-accent', min: 4.5 },
	{ what: 'text on a Done button', fg: '--at-on-done', bg: '--at-done-strong', min: 4.5 },
];

for (const theme of ['light', 'dark'] as const) {
	test(`${theme} theme: text and state colors meet their contrast minimum`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme);
		await page.goto('concepts/same-prompt-twice/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		const ratios = await page.evaluate((pairs) => {
			/** The computed sRGB color of `var(name)`, as 0-255 channels. */
			const resolve = (name: string): [number, number, number] => {
				const probe = document.createElement('div');
				probe.style.color = `var(${name})`;
				document.body.append(probe);
				const rgb = getComputedStyle(probe).color;
				probe.remove();
				const channels = rgb.match(/[\d.]+/g);
				if (!channels || channels.length < 3) throw new Error(`${name} resolved to ${rgb}`);
				return [Number(channels[0]), Number(channels[1]), Number(channels[2])];
			};
			const luminance = ([r, g, b]: [number, number, number]) => {
				const lin = (c: number) => {
					const s = c / 255;
					return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
				};
				return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
			};
			return pairs.map((p) => {
				const fg = luminance(resolve(p.fg));
				const bg = luminance(resolve(p.bg));
				const [hi, lo] = [Math.max(fg, bg), Math.min(fg, bg)];
				return { what: p.what, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, min: p.min };
			});
		}, PAIRS);
		const failing = ratios.filter((r) => r.ratio < r.min);
		expect(failing, `pairs below their minimum in the ${theme} theme`).toEqual([]);
	});
}
