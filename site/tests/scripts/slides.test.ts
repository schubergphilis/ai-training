// @vitest-environment happy-dom
import {
	DECK_CLASS,
	indexOfHash,
	type KeyPress,
	keyAction,
	keyTargetOf,
	mountSlides,
	slideAfter,
} from '@scripts/slides';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
	key,
	shiftKey: false,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	...extra,
});

describe('keyAction', () => {
	it('moves on the arrow keys, Page Up and Page Down, Home and End', () => {
		expect(['ArrowRight', 'ArrowDown', 'PageDown'].map((k) => keyAction(press(k), 'other'))).toEqual([
			'next',
			'next',
			'next',
		]);
		expect(['ArrowLeft', 'ArrowUp', 'PageUp'].map((k) => keyAction(press(k), 'control'))).toEqual([
			'back',
			'back',
			'back',
		]);
		expect([keyAction(press('Home'), 'other'), keyAction(press('End'), 'other')]).toEqual(['first', 'last']);
	});
	it('moves on Space and Shift+Space, and toggles full screen on F, except on a button or a link', () => {
		expect(keyAction(press(' '), 'other')).toBe('next');
		expect(keyAction(press(' ', { shiftKey: true }), 'other')).toBe('back');
		expect(keyAction(press('f'), 'other')).toBe('fullscreen');
		expect(keyAction(press(' '), 'control')).toBeUndefined();
		expect(keyAction(press('F'), 'control')).toBeUndefined();
	});
	it('leaves a key with a modifier, a key in a field and any other key to the browser', () => {
		expect(keyAction(press('ArrowRight', { altKey: true }), 'other')).toBeUndefined();
		expect(keyAction(press('ArrowRight', { metaKey: true }), 'other')).toBeUndefined();
		expect(keyAction(press('f', { ctrlKey: true }), 'other')).toBeUndefined();
		expect(keyAction(press('ArrowRight'), 'field')).toBeUndefined();
		expect(keyAction(press('a'), 'other')).toBeUndefined();
	});
});

describe('slideAfter and indexOfHash', () => {
	it('moves within the deck and stops at both ends', () => {
		expect(slideAfter('next', 0, 3)).toBe(1);
		expect(slideAfter('next', 2, 3)).toBe(2);
		expect(slideAfter('back', 0, 3)).toBe(0);
		expect([slideAfter('first', 2, 3), slideAfter('last', 0, 3)]).toEqual([0, 2]);
		expect(slideAfter('last', 0, 0)).toBe(0);
	});
	it('reads a slide number from the hash, and nothing from another hash', () => {
		expect(indexOfHash('#3', 5)).toBe(2);
		expect([indexOfHash('#0', 5), indexOfHash('#6', 5), indexOfHash('#intro', 5), indexOfHash('', 5)]).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});
});

describe('keyTargetOf', () => {
	it('tells a field from a control and from the rest of the page', () => {
		document.body.innerHTML = '<select></select><button><span>x</span></button><a href="#1">a</a><p>t</p>';
		expect(keyTargetOf(document.querySelector('select'))).toBe('field');
		expect(keyTargetOf(document.querySelector('span'))).toBe('control');
		expect(keyTargetOf(document.querySelector('a'))).toBe('control');
		expect(keyTargetOf(document.querySelector('p'))).toBe('other');
		expect(keyTargetOf(null)).toBe('other');
	});
});

const deck = `
<main>
<div data-slides>
  <div><div data-slide-progress></div></div>
  <section data-slide><h2 id="one">One</h2></section>
  <section data-slide><h2 id="two">Two</h2></section>
  <section data-slide><h2 id="three">Three</h2></section>
  <nav>
    <button data-slide-back></button><span data-slide-counter></span><button data-slide-next></button>
    <button data-slide-fullscreen></button>
  </nav>
</div>
</main>`;

const visible = () => [...document.querySelectorAll<HTMLElement>('[data-slide]')].findIndex((s) => !s.hidden);
const counter = () => document.querySelector('[data-slide-counter]')?.textContent;
const key = (k: string, target: EventTarget = document.body) =>
	target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('mountSlides', () => {
	beforeEach(() => {
		history.replaceState(null, '', '/about/slides/');
		document.body.innerHTML = deck;
		document.documentElement.classList.remove(DECK_CLASS);
	});
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('shows the first slide, labels each slide and moves the deck under <body>', () => {
		expect(mountSlides(document)).toBe(true);
		expect(visible()).toBe(0);
		expect(counter()).toBe('1 / 3');
		expect(document.documentElement.classList.contains(DECK_CLASS)).toBe(true);
		expect(document.querySelector('[data-slides]')?.parentElement).toBe(document.body);
		expect(document.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(3);
		expect(document.querySelector('[data-slide]')?.getAttribute('aria-label')).toBe('1 of 3');
		expect((document.querySelector('[data-slide-back]') as HTMLButtonElement).disabled).toBe(true);
	});
	it('moves with the buttons and the keys, and writes the slide number to the hash', () => {
		mountSlides(document);
		(document.querySelector('[data-slide-next]') as HTMLButtonElement).click();
		expect([visible(), counter(), location.hash]).toEqual([1, '2 / 3', '#2']);
		key('End');
		expect([visible(), location.hash]).toEqual([2, '#3']);
		expect((document.querySelector('[data-slide-next]') as HTMLButtonElement).disabled).toBe(true);
		expect(document.querySelector<HTMLElement>('[data-slide-progress]')?.style.width).toBe('100%');
		key('ArrowLeft');
		expect(visible()).toBe(1);
		(document.querySelector('[data-slide-back]') as HTMLButtonElement).click();
		expect(visible()).toBe(0);
	});
	it('ignores a key the browser needs, such as Space on a button', () => {
		mountSlides(document);
		key(' ', document.querySelector('[data-slide-next]') as HTMLElement);
		expect(visible()).toBe(0);
	});
	it('opens the slide of a numbered hash, or the slide that holds the element a hash names', () => {
		history.replaceState(null, '', '#3');
		mountSlides(document);
		expect(visible()).toBe(2);
		history.replaceState(null, '', '#two');
		window.dispatchEvent(new HashChangeEvent('hashchange'));
		expect(visible()).toBe(1);
		history.replaceState(null, '', '#nowhere');
		window.dispatchEvent(new PopStateEvent('popstate'));
		expect(visible()).toBe(0);
	});
	it('toggles full screen with F and the button', () => {
		const calls: string[] = [];
		let full: Element | null = null;
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => full });
		document.documentElement.requestFullscreen = async () => {
			calls.push('enter');
			full = document.documentElement;
		};
		document.exitFullscreen = async () => {
			calls.push('exit');
			full = null;
		};
		mountSlides(document);
		key('f');
		(document.querySelector('[data-slide-fullscreen]') as HTMLButtonElement).click();
		expect(calls).toEqual(['enter', 'exit']);
		expect(visible()).toBe(0);
	});
	it('changes nothing on a page without a deck', () => {
		document.body.innerHTML = '<p>No deck</p>';
		expect(mountSlides(document)).toBe(false);
		expect(document.documentElement.classList.contains(DECK_CLASS)).toBe(false);
	});
});
