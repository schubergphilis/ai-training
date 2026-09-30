import { llmsTxt, textResponse } from '@lib/llms-txt';
import type { APIRoute } from 'astro';

/**
 * `/llms.txt` under the base path (spec S12 "`llms.txt`"), built at build
 * time by `llmsTxt` (`@lib/llms-txt`) from the data tree and the Markdown
 * alternates.
 */
export const GET: APIRoute = async () => {
	// `site` from astro.config.mjs; the file's links are absolute, so it is required.
	const site: string | undefined = import.meta.env.SITE;
	if (!site) throw new Error('llms.txt needs `site` in astro.config.mjs for absolute URLs');
	return textResponse(await llmsTxt(new URL(site).origin));
};
