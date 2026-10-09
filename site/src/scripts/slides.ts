/**
 * The navigation of the About slides (`components/slides/Slides.astro`,
 * issue #762). Without this script the slides are sections of one long page.
 * With it, the deck fills the window and shows one slide at a time. The back
 * and next buttons, the arrow keys, Page Up and Page Down (what a presenter's
 * remote sends), Space, Home and End move between slides, and F toggles full
 * screen. The URL hash holds the slide number (`#3`), so a reload or a shared
 * link opens the same slide, and the browser's back button goes to the slide
 * before. A hash that names an element on a slide opens that slide. No DOM
 * access at import time, so it runs under Node in the unit tests with a
 * `happy-dom` document.
 */

/** What a key press does: one of these, or nothing. */
export type SlideAction = 'next' | 'back' | 'first' | 'last' | 'fullscreen';

/**
 * Where a key press happens. A `field` takes the keys itself (the theme select changes with the arrow
 * keys), and a `control`, such as a button or a link, acts on Space and Enter.
 */
export type KeyTarget = 'field' | 'control' | 'other';

export interface KeyPress {
	key: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}

/** The action of a key press on `target`, or undefined to leave the key to the browser. */
export function keyAction(e: KeyPress, target: KeyTarget): SlideAction | undefined {
	if (e.altKey || e.ctrlKey || e.metaKey || target === 'field') return undefined;
	switch (e.key) {
		case 'ArrowRight':
		case 'ArrowDown':
		case 'PageDown':
			return 'next';
		case 'ArrowLeft':
		case 'ArrowUp':
		case 'PageUp':
			return 'back';
		case 'Home':
			return 'first';
		case 'End':
			return 'last';
		case ' ':
			if (target === 'control') return undefined;
			return e.shiftKey ? 'back' : 'next';
		case 'f':
		case 'F':
			return target === 'control' ? undefined : 'fullscreen';
		default:
			return undefined;
	}
}

/** The slide an action moves to from `current`, in a deck of `count`, kept within the deck. */
export function slideAfter(action: Exclude<SlideAction, 'fullscreen'>, current: number, count: number): number {
	const last = Math.max(0, count - 1);
	if (action === 'first') return 0;
	if (action === 'last') return last;
	return Math.min(last, Math.max(0, current + (action === 'next' ? 1 : -1)));
}

/** The slide index of a numbered hash (`#3` is index 2), or undefined for another hash or a number past the deck. */
export function indexOfHash(hash: string, count: number): number | undefined {
	const m = /^#(\d+)$/.exec(hash);
	if (!m) return undefined;
	const n = Number(m[1]);
	return n >= 1 && n <= count ? n - 1 : undefined;
}

/** The kind of the element a key press happens on. */
export function keyTargetOf(el: EventTarget | null): KeyTarget {
	if (!(el instanceof Element)) return 'other';
	if (el.closest('select, input, textarea, [contenteditable="true"]')) return 'field';
	if (el.closest('button, a[href], summary')) return 'control';
	return 'other';
}

/** The class on `<html>` while the deck shows one slide at a time. The CSS keys off it. */
export const DECK_CLASS = 'slides-deck';

/** The listeners of the last mount on the document and the window, so a second mount replaces them. */
let bound: AbortController | undefined;

/**
 * Binds the deck of `doc`: one slide at a time, the buttons, the keys and the hash. Returns false, and
 * changes nothing, when the page has no deck.
 */
export function mountSlides(doc: Document): boolean {
	const deck = doc.querySelector<HTMLElement>('[data-slides]');
	const slides = [...(deck?.querySelectorAll<HTMLElement>('[data-slide]') ?? [])];
	const counter = deck?.querySelector<HTMLElement>('[data-slide-counter]');
	const back = deck?.querySelector<HTMLButtonElement>('[data-slide-back]');
	const next = deck?.querySelector<HTMLButtonElement>('[data-slide-next]');
	const progress = deck?.querySelector<HTMLElement>('[data-slide-progress]');
	if (!deck || slides.length === 0 || !counter || !back || !next) return false;
	const win = doc.defaultView;
	const count = slides.length;
	let current = 0;

	slides.forEach((s, i) => {
		s.setAttribute('aria-roledescription', 'slide');
		s.setAttribute('aria-label', `${i + 1} of ${count}`);
	});

	const show = (index: number, updateHash: boolean) => {
		current = index;
		slides.forEach((s, i) => {
			s.hidden = i !== index;
		});
		counter.textContent = `${index + 1} / ${count}`;
		back.disabled = index === 0;
		next.disabled = index === count - 1;
		if (progress) progress.style.width = `${((index + 1) / count) * 100}%`;
		if (updateHash && win && win.location.hash !== `#${index + 1}`) win.history.pushState(null, '', `#${index + 1}`);
	};

	/** The slide of the current hash: a slide number, or the slide that holds the element the hash names. */
	const fromHash = (): number => {
		const hash = win?.location.hash ?? '';
		const numbered = indexOfHash(hash, count);
		if (numbered !== undefined) return numbered;
		const id = decodeURIComponent(hash.slice(1));
		const target = id ? doc.getElementById(id) : null;
		const holder = target ? slides.findIndex((s) => s.contains(target)) : -1;
		return holder >= 0 ? holder : 0;
	};

	const toggleFullscreen = () => {
		if (doc.fullscreenElement) void doc.exitFullscreen?.();
		else void doc.documentElement.requestFullscreen?.();
	};

	const act = (action: SlideAction) => {
		if (action === 'fullscreen') toggleFullscreen();
		else show(slideAfter(action, current, count), true);
	};

	bound?.abort();
	bound = new AbortController();
	const { signal } = bound;
	back.addEventListener('click', () => act('back'));
	next.addEventListener('click', () => act('next'));
	deck.querySelector('[data-slide-fullscreen]')?.addEventListener('click', toggleFullscreen);
	doc.addEventListener(
		'keydown',
		(e) => {
			const action = keyAction(e, keyTargetOf(e.target));
			if (!action) return;
			e.preventDefault();
			act(action);
		},
		{ signal },
	);
	win?.addEventListener('hashchange', () => show(fromHash(), false), { signal });
	win?.addEventListener('popstate', () => show(fromHash(), false), { signal });

	// A Starlight container around the page content contains its layout, which would size a fixed deck
	// to the content column. Under <body> the deck fills the window.
	doc.body.append(deck);
	doc.documentElement.classList.add(DECK_CLASS);
	show(fromHash(), false);
	return true;
}
