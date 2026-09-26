/**
 * The unresolved citation check's logic (issue #310): a `(@` in the text of a
 * built HTML page is a `(@key)` citation that no renderer resolved, and the
 * reader sees the raw syntax. Spec S03 "Citations and terms" defines the
 * token; `plugins/citation-syntax.mjs` matches it for lesson pages and
 * `src/lib/citations.ts` for text from the data tree.
 *
 * Scope: every `.html` page under `site/dist`, lesson, course, topic and
 * competency pages included. Text inside `<code>`, `<pre>`, `<script>`,
 * `<style>`, `<template>` and `<textarea>` is skipped, because a lesson may
 * show the syntax as code. The attributes a reader sees or hears are read
 * too (`ATTRIBUTES`): `alt`, `aria-label`, and the `content` of the
 * description `<meta>` tags, which topic and competency pages build from
 * data-tree text. `title` and `data-key` are not read, because a resolved
 * citation link carries its key there.
 * The JSON exports under `site/dist/data/` are out of scope: `citationsOutsideCode`
 * in `bundles.mjs` checks a bundle's `prose`, `behaviors[]` and
 * `checkpoints[].stem`, and `checkExportCitations` there checks the stems in
 * `checkpoints.json`.
 *
 * The page is parsed with happy-dom and read as the text of its elements,
 * so a `(@` that inline markup splits (`(<em>@key</em>)`) or a line break
 * splits is still one run of text. A block element (`BLOCKS`) ends its text
 * with a space, so the end of one list item and the start of the next do not
 * join into a token. `scripts/check-bundles.mjs`
 * runs this after the bundle check; tests import it.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { Window } from 'happy-dom';
import { walk } from './data.mjs';

/** Elements whose text is code or not shown as prose. */
export const SKIPPED = ['code', 'pre', 'script', 'style', 'template', 'textarea'];

/** Elements the browser lays out as their own block, or the page title and body. */
export const BLOCKS = [
	'address',
	'article',
	'aside',
	'blockquote',
	'body',
	'caption',
	'dd',
	'details',
	'dialog',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'head',
	'header',
	'hgroup',
	'legend',
	'li',
	'main',
	'nav',
	'ol',
	'option',
	'p',
	'section',
	'summary',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'title',
	'tr',
	'ul',
];

/** Attributes whose value a reader sees or hears: a CSS selector and the attribute to read. */
export const ATTRIBUTES = [
	['[alt]', 'alt'],
	['[aria-label]', 'aria-label'],
	['meta[name=description]', 'content'],
	['meta[property$=description]', 'content'],
];

const TOKEN = '(@';
const CONTEXT = 40;

/**
 * Parse `html` and replace every `SKIPPED` element with one space, so the
 * text on either side of a code span does not join into a token.
 * @param {string} html
 * @param {Window} window
 */
function parse(html, window) {
	const doc = new window.DOMParser().parseFromString(html, 'text/html');
	for (const el of [...doc.querySelectorAll(SKIPPED.join(','))]) {
		// A skipped element inside another one was removed with its parent.
		if (el.isConnected) el.replaceWith(doc.createTextNode(' '));
	}
	return doc;
}

/**
 * The text of a parsed page outside the skipped elements, with a space after
 * the text of each `BLOCKS` element and whitespace runs collapsed to one
 * space.
 * @param {Document} doc
 */
function textOf(doc) {
	for (const el of doc.querySelectorAll(BLOCKS.join(','))) el.append(doc.createTextNode(' '));
	return (doc.documentElement.textContent ?? '').replace(/\s+/g, ' ');
}

/**
 * The text of an HTML page as `unresolvedCitations` reads it.
 * @param {string} html
 * @param {Window} window
 */
export function pageText(html, window) {
	return textOf(parse(html, window));
}

/** A snippet around each `(@` in `text`. */
function snippets(text) {
	const found = [];
	for (let i = text.indexOf(TOKEN); i !== -1; i = text.indexOf(TOKEN, i + TOKEN.length)) {
		found.push(text.slice(Math.max(0, i - CONTEXT), i + CONTEXT).trim());
	}
	return found;
}

/**
 * Each `(@` on the page outside the skipped elements: `where` is `text` or
 * the attribute's name, and `snippet` the text around it.
 * @param {string} html
 * @param {Window} window
 * @returns {{ where: string, snippet: string }[]}
 */
export function unresolvedCitations(html, window) {
	const doc = parse(html, window);
	const found = [];
	for (const [selector, name] of ATTRIBUTES) {
		for (const el of doc.querySelectorAll(selector)) {
			const value = (el.getAttribute(name) ?? '').replace(/\s+/g, ' ');
			for (const snippet of snippets(value)) found.push({ where: `${name} attribute of <${el.localName}>`, snippet });
		}
	}
	for (const snippet of snippets(textOf(doc))) found.push({ where: 'text', snippet });
	return found;
}

/**
 * One problem per `(@` on every `.html` page under `distDir`.
 * @param {string} distDir
 * @returns {{ errors: string[], pages: number }}
 */
export function checkRenderedCitations(distDir) {
	const window = new Window();
	const errors = [];
	let pages = 0;
	try {
		for (const file of [...walk(distDir)].filter((p) => p.endsWith('.html')).sort()) {
			pages += 1;
			for (const { where, snippet } of unresolvedCitations(readFileSync(file, 'utf8'), window)) {
				errors.push(`${relative(distDir, file)}: unresolved citation in ${where}: "${snippet}"`);
			}
		}
	} finally {
		window.happyDOM.close();
	}
	return { errors, pages };
}
