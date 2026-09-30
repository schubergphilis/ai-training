import { alternateSources } from '@lib/alternates';
import { markdownResponse } from '@lib/markdown-alternate';
import type { APIRoute, GetStaticPaths } from 'astro';

/**
 * The Markdown alternates (spec S12 "Markdown alternates"): one file per page
 * that `alternateSources` (`@lib/alternates`) lists, at the page URL plus
 * `index.md`, such as `/ai-training/safety/agent-risk/index.md`. The page
 * path `/safety/agent-risk/` is the `page` param `safety/agent-risk`.
 */
export const getStaticPaths: GetStaticPaths = async () => {
	// `site` from astro.config.mjs; an alternate's links are absolute, so it is required.
	const site: string | undefined = import.meta.env.SITE;
	if (!site) throw new Error('Markdown alternates need `site` in astro.config.mjs for absolute URLs');
	const origin = new URL(site).origin;
	return (await alternateSources()).map((source) => ({
		params: { page: source.path.replace(/^\/|\/$/g, '') },
		props: { render: () => source.render(origin) },
	}));
};

export const GET: APIRoute = async ({ props }) => markdownResponse(await props.render());
