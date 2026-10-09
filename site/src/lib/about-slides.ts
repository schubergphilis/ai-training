import { attrsOf, jsxElements, parseMdx } from './checkpoint-tags';

/**
 * The figures the About slides (`src/content/docs/about/slides.mdx`, issue #762) take from the About
 * page. A history figure has its data and its `source:` comment in `about.mdx`, so the slides read the
 * props of that figure from the page source by its `id`, and show the same numbers without a copy.
 */

/** A figure of the About page: its component name and its props, each a literal. */
export interface AboutFigureSource {
	name: string;
	props: Record<string, unknown>;
}

/** Every element with an `id` prop in the MDX source `body`, by id. Two elements with one id fail. */
export function aboutFiguresById(body: string, where: string): Map<string, AboutFigureSource> {
	const out = new Map<string, AboutFigureSource>();
	for (const el of jsxElements(parseMdx(body))) {
		if (!el.attributes.some((a) => a.type === 'mdxJsxAttribute' && a.name === 'id')) continue;
		const attrs = attrsOf(el, where);
		const id = attrs.get('id')?.value;
		if (typeof id !== 'string') throw new Error(`${where}: <${el.name}> has an id that is no string`);
		if (out.has(id)) throw new Error(`${where}: two elements have id="${id}"`);
		out.set(id, { name: el.name ?? '', props: Object.fromEntries([...attrs].map(([k, a]) => [k, a.value])) });
	}
	return out;
}

/** The figure `id` of `figures`. An unknown id fails the build with the ids there are. */
export function aboutFigureById(figures: Map<string, AboutFigureSource>, id: string): AboutFigureSource {
	const figure = figures.get(id);
	if (!figure) {
		const known = [...figures.keys()].sort().join(', ');
		throw new Error(`about/slides.mdx: about.mdx has no figure with id="${id}". Known ids: ${known}`);
	}
	return figure;
}

let cached: { body: string; figures: Map<string, AboutFigureSource> } | undefined;

/** `aboutFiguresById` of the About page body, parsed once per body: the slides read several figures. */
export function aboutFiguresOf(body: string): Map<string, AboutFigureSource> {
	if (cached?.body !== body) cached = { body, figures: aboutFiguresById(body, 'src/content/docs/about.mdx') };
	return cached.figures;
}
