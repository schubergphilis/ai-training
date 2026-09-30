/**
 * The Markdown alternate head hint check (spec S12 "Head hints"): after
 * `site-build`, each built HTML page that carries
 * `<link rel="alternate" type="text/markdown" href="...">` must point at the
 * alternate of that same page, `<page URL>index.md`, and that file must be
 * in `site/dist` and start with an H1. Each alternate under `site/dist` must
 * in turn have its HTML page next to it, with the hint. So no published page
 * points at an alternate that doesn't exist, and no alternate is left without
 * the page that announces it. Each hint must start with `root`, Astro's
 * `site` plus the base path (`SITE_ROOT` in `site-address.mjs`).
 * The pages S12 "Which pages get one" gives no alternate (the front page, the
 * topic and competency maps, the progress, reference and settings pages, and
 * the review pages) must carry no hint and have no alternate. Every other
 * page's `index.html` must carry the hint, so a page that
 * `alternateSources` leaves out fails the check.
 * `scripts/check-bundles.mjs` runs this; tests import it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from './data.mjs';

const LINK = /<link\b[^>]*>/gi;

/**
 * The area slugs: the directory names under `site/src/data/areas/`, since
 * an area's directory is its id (spec S09).
 */
const AREAS = new Set(
	readdirSync(fileURLToPath(new URL('../../src/data/areas/', import.meta.url)), { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name),
);

/**
 * The pages S12 "Which pages get one" lists as having no alternate, as page
 * directories under dist (`''` is the front page), and whether `dir` is one.
 * A review page is `<area>/review/`, one per course, so `review` under a
 * directory that is no area slug (`guides/review`) is an ordinary page.
 * @param {string} dir
 * @param {Set<string>} [areas] the area slugs, `site/src/data/areas/` by default
 */
export function hasNoAlternate(dir, areas = AREAS) {
	if (['', 'map', 'competencies', 'progress', 'reference', 'settings'].includes(dir)) return true;
	const review = /^([^/]+)\/review$/.exec(dir);
	return review !== null && areas.has(review[1] ?? '');
}

/** An attribute of one `<link>` tag's source, or undefined. Astro writes attributes in double quotes. */
function attr(tag, name) {
	return new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];
}

/**
 * The `href` of every Markdown alternate hint in `html`, in order.
 * @param {string} html
 * @returns {string[]}
 */
export function alternateHints(html) {
	return [...html.matchAll(LINK)]
		.map((m) => m[0])
		.filter((tag) => attr(tag, 'rel') === 'alternate' && attr(tag, 'type') === 'text/markdown')
		.map((tag) => attr(tag, 'href') ?? '');
}

/**
 * Every problem with the hints and alternates under `distDir`.
 * @param {string} distDir
 * @param {string} root the expected site root, such as `https://schubergphilis.github.io/ai-training/`
 * @returns {{ errors: string[], hints: number }}
 */
export function checkAlternateHints(distDir, root) {
	/** @type {string[]} */
	const errors = [];
	const files = [...walk(distDir)].sort();
	/** @type {Set<string>} */
	const hinted = new Set();
	for (const file of files.filter((p) => p.endsWith('.html'))) {
		const rel = relative(distDir, file);
		const hints = alternateHints(readFileSync(file, 'utf8'));
		const pageDir = dirname(rel) === '.' ? '' : dirname(rel).split(sep).join('/');
		if (hints.length === 0) {
			// Every page S12 doesn't exclude has an alternate, so a page left out of `alternateSources` fails here.
			// `404.html` is no page URL; only a page directory's `index.html` is checked.
			if (file.endsWith(`${sep}index.html`) && !hasNoAlternate(pageDir))
				errors.push(`${rel}: a page that spec S12 gives a Markdown alternate has no alternate hint`);
			continue;
		}
		if (hasNoAlternate(pageDir)) {
			errors.push(`${rel}: a page that spec S12 gives no Markdown alternate has an alternate hint`);
			continue;
		}
		if (hints.length > 1) errors.push(`${rel}: ${hints.length} Markdown alternate hints, expected one`);
		const href = hints[0] ?? '';
		// The page's own directory, as a URL path: `safety/agent-risk/index.html` is `/safety/agent-risk/`.
		const dir = dirname(rel) === '.' ? '/' : `/${dirname(rel).split(sep).join('/')}/`;
		let url;
		try {
			url = new URL(href);
		} catch {
			errors.push(`${rel}: the Markdown alternate hint ${JSON.stringify(href)} is not an absolute URL`);
			continue;
		}
		const want = `${dir}index.md`;
		if (!url.pathname.endsWith(want) || url.search || url.hash) {
			errors.push(`${rel}: the Markdown alternate hint ${href} is not this page's alternate, ${want}`);
			continue;
		}
		const hintRoot = `${url.origin}${url.pathname.slice(0, -want.length)}`;
		// `root` may end in `/`, as `SITE_ROOT` does; the hint's root is compared with one slash at its end.
		if (`${hintRoot}/` !== `${root.replace(/\/$/, '')}/`) {
			errors.push(`${rel}: the Markdown alternate hint ${href} is not under the site root ${root}`);
			continue;
		}
		const target = join(distDir, ...want.split('/'));
		hinted.add(target);
		if (!existsSync(target)) errors.push(`${rel}: the Markdown alternate hint ${href} points at no file in dist`);
		else if (!readFileSync(target, 'utf8').startsWith('# '))
			errors.push(`${relative(distDir, target)}: a Markdown alternate starts with its H1 title`);
	}
	for (const file of files.filter((p) => p.endsWith(`${sep}index.md`))) {
		const dir = dirname(relative(distDir, file));
		if (hasNoAlternate(dir === '.' ? '' : dir.split(sep).join('/')))
			errors.push(`${relative(distDir, file)}: a page that spec S12 gives no Markdown alternate has one`);
		else if (!hinted.has(file))
			errors.push(`${relative(distDir, file)}: a Markdown alternate whose page has no head hint for it`);
	}
	return { errors, hints: hinted.size };
}
