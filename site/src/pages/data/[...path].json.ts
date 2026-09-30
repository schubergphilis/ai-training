import { type DataFile, dataFiles, dataJson } from '@lib/data-files';
import type { APIRoute, GetStaticPaths } from 'astro';

/**
 * The data tree as JSON (spec S12 "Data tree as JSON"): `groups.yaml` and
 * each YAML file under `src/data/areas/`, without its `notes`, served under
 * the base path as `/ai-training/data/<kind>/<id>.json`. `publishedPath` in
 * `@lib/data-files` maps each source file to its path. The lesson bundles
 * (`lessons/[...id].json.ts`), the checkpoint export and the index have
 * routes of their own, and this route builds none of their paths.
 * `mise run bundles` compares each built file with its YAML.
 */
export const getStaticPaths: GetStaticPaths = () =>
	dataFiles().map((file) => ({ params: { path: file.path }, props: { file } }));

export const GET: APIRoute = ({ props }) => {
	return new Response(dataJson((props.file as DataFile).data), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
