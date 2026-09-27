/**
 * The data files of the lesson fixtures under `site/examples/`, as the
 * widgets show them: the `sample/` and `sources/` files next to a proof
 * fixture. A widget that shows the file its proof fixture reads can't drift
 * from what CI checks. The files are read at build time, so a page ships
 * their text and never fetches it.
 */

const ROOT = '../../examples/';
const FILES = import.meta.glob<string>(['../../examples/**/sample/*', '../../examples/**/sources/*'], {
	query: '?raw',
	import: 'default',
	eager: true,
});

/**
 * The text of `path`, a file in a `sample/` or `sources/` directory under
 * `site/examples/` (such as `safety/redact-before-you-paste/sample/email.txt`).
 * Throws with `widget` in the message when there is no such file, so a typo
 * in a page fails the build.
 */
export function exampleFile(path: string, widget: string): string {
	const text = FILES[ROOT + path];
	if (text === undefined)
		throw new Error(`${widget}: no file ${path} (a file in a sample/ or sources/ directory under site/examples/)`);
	return text;
}
