import { dataFiles, dataIndexOf, dataJson } from '@lib/data-files';
import { getLessons } from '@lib/lessons';
import type { APIRoute } from 'astro';

/**
 * The data index (spec S12 "Index"), served under the base path as
 * `/ai-training/data/index.json`: every published data file, so an agent can
 * find them on a static host without a directory listing. A lesson is live
 * when its lesson page exists, as for the lesson bundles.
 */
export const GET: APIRoute = async () => {
	// `site` from astro.config.mjs; the index's URLs are absolute, so it is required.
	const site: string | undefined = import.meta.env.SITE;
	if (!site) throw new Error('the data index needs `site` in astro.config.mjs for absolute URLs');
	const live = new Set((await getLessons()).map((l) => l.id));
	return new Response(dataJson(dataIndexOf(dataFiles(), live, new URL(site).origin)), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
