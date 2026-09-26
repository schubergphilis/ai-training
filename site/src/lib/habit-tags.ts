/**
 * The habit tag reader (spec S07 "Authoring"): finds every `<Habit>` in a
 * lesson's MDX tree and reads its `id` and text, and applies the authoring
 * rules. The tree is the one `lib/checkpoint-tags.ts` parses, so a tag reads
 * the same here as on the rendered page. `lib/lessons.ts` runs it over a
 * collection entry's body for the review page and the progress catalog, and
 * the component checks its own `id` the same way. No Astro import, so every
 * caller can load it.
 */
import { KIND_OF_TAG } from './checkpoint-rules';
import { attrsOf, childrenSource, jsxElements, type MdxNode, parseMdx, stringProp } from './checkpoint-tags';
import { isBuildId, MATCH_ROW_ID } from './page-ids';
import { headingSlugs } from './section-slugs';

export const HABIT_TAG = 'Habit';
/** Zero, one or two habits per lesson (spec S07 "Authoring"). */
export const MAX_HABITS = 2;
/** A habit id is a lowercase kebab-case slug. */
export const HABIT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface HabitInfo {
	/** The id within the lesson; the progress id is `<lesson id>#<id>`. */
	id: string;
	/** The children of the tag, as Markdown source. */
	text: string;
}

/** Throws unless `id` is a lowercase kebab-case slug, naming `where`. */
export function assertHabitId(where: string, id: string | undefined): string {
	if (!id) throw new Error(`${where}: <${HABIT_TAG}> without an id`);
	if (!HABIT_ID.test(id)) throw new Error(`${where}: habit id "${id}" is not a lowercase kebab-case slug`);
	return id;
}

/**
 * The habits in `tree`, parsed from `src`, in source order, after the rules:
 * at most `MAX_HABITS`, each with a kebab-case `id` unique in the lesson that
 * is not a heading slug, a checkpoint id, the id of a `<Match>` row or an id
 * the build adds (`isBuildId` in `lib/page-ids.ts`), each after the `<Recap>`, and each with text.
 * Throws on the first break, naming `where`.
 */
export function habitTagsIn(tree: MdxNode, src: string, where: string): HabitInfo[] {
	const elements = jsxElements(tree);
	const habits = elements.filter((n) => n.name === HABIT_TAG);
	if (habits.length > MAX_HABITS)
		throw new Error(`${where}: ${habits.length} <${HABIT_TAG}> tags; a lesson has at most ${MAX_HABITS}`);
	const recapEnd = Math.max(-1, ...elements.filter((n) => n.name === 'Recap').map((n) => n.position?.end.offset ?? -1));
	// The ids the build gives the headings (`lib/section-slugs.ts`), so a repeated heading's `-1` counts too.
	const slugs = new Set(headingSlugs(tree));
	// A checkpoint's section id is its `id` too (`CheckpointShell.astro`), so a habit id must differ from those as well.
	const checkpointIds = new Set(
		elements
			.filter((n) => n.name !== null && n.name in KIND_OF_TAG)
			.map((n) => attrsOf(n, where).get('id')?.value)
			.filter((v): v is string => typeof v === 'string'),
	);
	// A `<Match>` also gives each of its rows ids (`MATCH_ROW_ID`).
	const matchIds = new Set(
		elements
			.filter((n) => n.name === 'Match')
			.map((n) => attrsOf(n, where).get('id')?.value)
			.filter((v): v is string => typeof v === 'string'),
	);
	const ids = new Set<string>();
	return habits.map((node) => {
		const attrs = attrsOf(node, where);
		const id = assertHabitId(where, stringProp(`${where} <${HABIT_TAG}>`, attrs, 'id'));
		if (ids.has(id)) throw new Error(`${where}: habit id "${id}" is used twice`);
		ids.add(id);
		if (slugs.has(id)) throw new Error(`${where}: habit id "${id}" is also a heading slug; pick another id`);
		if (checkpointIds.has(id)) throw new Error(`${where}: habit id "${id}" is also a checkpoint id; pick another id`);
		if (isBuildId(id, slugs))
			throw new Error(`${where}: habit id "${id}" is also an id the build adds to the lesson page; pick another id`);
		const row = MATCH_ROW_ID.exec(id);
		if (row && matchIds.has(row[1] ?? ''))
			throw new Error(`${where}: habit id "${id}" is also the id of a row of <Match id="${row[1]}">; pick another id`);
		const start = node.position?.start.offset ?? -1;
		if (recapEnd < 0 || start < recapEnd) throw new Error(`${where}#${id}: <${HABIT_TAG}> must come after the <Recap>`);
		const text = childrenSource(node, src);
		if (!text) throw new Error(`${where}#${id}: <${HABIT_TAG}> has no text`);
		return { id, text };
	});
}

/** The habits of one MDX source, parsed and read in one call. A parse error names `where`. */
export function habitTagsOfSource(src: string, where: string): HabitInfo[] {
	let tree: MdxNode;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${(e as Error).message}`);
	}
	return habitTagsIn(tree, src, where);
}
