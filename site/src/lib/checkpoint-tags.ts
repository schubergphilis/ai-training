import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import {
	type CheckpointKind,
	type CheckpointPhase,
	type CheckpointTag,
	CONCEPTS_FORM,
	DEFAULT_PHASE,
	isPhase,
	KIND_OF_TAG,
	MAX_PRACTICE,
	MORE_PRACTICE_TAG,
	PHASES,
} from './checkpoint-rules';
import { isBuildId, MATCH_ROW_ID } from './page-ids';
import { headingSlugs } from './section-slugs';

/**
 * The checkpoint tag reader: finds every `<Choice ...>` (and the other kinds
 * in `KIND_OF_TAG`) in a lesson's MDX tree and reads its props and stem. The
 * tree is the one the MDX compiler builds (`remark-parse` with `remark-mdx`),
 * so a tag reads the same here as on the rendered page. The remark plugin
 * (`plugins/remark-checkpoints.mjs`) runs `checkpointTagsIn` during the page
 * build, `lib/lessons.ts` runs it over a collection entry's body for the
 * review page and the export, `lib/lesson-bundles.ts` renders every
 * component of a lesson from the same tree, and the command-line gates
 * (`scripts/lib/checkpoints.mjs`, `live-lessons.mjs`, `examples.mjs`) run it
 * over the page files. No Astro import, so every caller can load it.
 */

/** One prop of a checkpoint tag: `name="text"` (`expr` false), `name={...}` (`expr` true) or bare `name` (value `true`). */
export interface CheckpointAttr {
	value: unknown;
	expr: boolean;
}

/** A checkpoint tag as it appears in the MDX source, before any rule is applied. */
export interface CheckpointTagInfo {
	tag: CheckpointTag;
	kind: CheckpointKind;
	attrs: Map<string, CheckpointAttr>;
	/** The children of the tag, as Markdown source. Empty for a self-closing tag. */
	stem: string;
	/** The `phase` prop, `first` when absent (spec S03 "Checkpoint props"). */
	phase: CheckpointPhase;
}

/** The mdast fields the reader touches. The full types are in `mdast-util-mdx-jsx`; only these matter here. */
interface Position {
	start: { offset?: number };
	end: { offset?: number };
}
export interface MdxNode {
	type: string;
	position?: Position;
	children?: MdxNode[];
}
export interface JsxElement extends MdxNode {
	type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
	name: string | null;
	attributes: JsxAttribute[];
	children: MdxNode[];
}
interface JsxAttribute {
	type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
	name?: string;
	value?: string | null | { type: 'mdxJsxAttributeValueExpression'; value: string; data?: { estree?: EstreeProgram } };
}
interface EstreeProgram {
	body: { type: string; expression?: EstreeNode }[];
}
interface EstreeNode {
	type: string;
	value?: unknown;
	elements?: (EstreeNode | null)[];
	properties?: EstreeNode[];
	key?: EstreeNode;
	computed?: boolean;
	name?: string;
	quasis?: { value: { cooked?: string | null } }[];
	expressions?: EstreeNode[];
	operator?: string;
	argument?: EstreeNode;
}

export const isJsxElement = (node: MdxNode): node is JsxElement =>
	node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';

/** The MDX tree of `src`, parsed the way the page build parses it. */
export function parseMdx(src: string): MdxNode {
	return unified().use(remarkParse).use(remarkMdx).parse(src) as MdxNode;
}

/**
 * The value of a JavaScript literal in an ESTree: a string, number, boolean
 * or null literal, a template literal without `${}` parts, an array or an
 * object of those, or a negated number. Anything else (an identifier, a
 * call, a spread) throws, so a prop the component would compute at render
 * time cannot slip into the export as something else.
 */
export function literalOf(node: EstreeNode | null | undefined): unknown {
	if (node === undefined) throw new Error('an empty expression');
	if (node === null) throw new Error('a hole in an array literal');
	switch (node.type) {
		case 'Literal':
			if (node.value instanceof RegExp || typeof node.value === 'bigint')
				throw new Error(`a ${typeof node.value === 'bigint' ? 'BigInt' : 'RegExp'} literal`);
			return node.value;
		case 'TemplateLiteral':
			if ((node.expressions ?? []).length > 0) throw new Error('a template literal with placeholders');
			return (node.quasis ?? []).map((q) => q.value.cooked ?? '').join('');
		case 'ArrayExpression':
			return (node.elements ?? []).map((e) => literalOf(e));
		case 'ObjectExpression': {
			const out: Record<string, unknown> = {};
			for (const p of node.properties ?? []) {
				if (p.type !== 'Property' || p.computed || !p.key) throw new Error(`${p.type} in an object literal`);
				const key =
					p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : undefined;
				if (key === undefined) throw new Error(`${p.key.type} as an object key`);
				out[key] = literalOf(p.value as EstreeNode);
			}
			return out;
		}
		case 'UnaryExpression':
			if (node.operator === '-' && node.argument?.type === 'Literal' && typeof node.argument.value === 'number')
				return -node.argument.value;
			throw new Error(`${node.operator ?? ''} expression`);
		default:
			throw new Error(node.type);
	}
}

/**
 * The props of one JSX element, by name. A string prop keeps its text, an
 * expression prop is read as a literal (`literalOf`), and a bare prop is
 * `true`, as JSX has it. A spread (`{...rest}`) throws.
 */
export function attrsOf(node: JsxElement, where: string): Map<string, CheckpointAttr> {
	const attrs = new Map<string, CheckpointAttr>();
	for (const a of node.attributes) {
		if (a.type !== 'mdxJsxAttribute' || !a.name)
			throw new Error(`${where}: <${node.name}> has a spread prop; name every prop`);
		if (a.value === null || a.value === undefined) {
			attrs.set(a.name, { value: true, expr: false });
		} else if (typeof a.value === 'string') {
			attrs.set(a.name, { value: a.value, expr: false });
		} else {
			const expression = a.value.data?.estree?.body[0]?.expression;
			try {
				attrs.set(a.name, { value: literalOf(expression), expr: true });
			} catch (e) {
				throw new Error(
					`${where}: cannot read ${a.name}={...} of <${node.name}>: ${(e as Error).message} is not a literal; write a string, number, boolean, array or object`,
				);
			}
		}
	}
	return attrs;
}

/** The source of a node's children, from the first child's start to the last child's end, trimmed. */
export function childrenSource(node: JsxElement, src: string): string {
	const first = node.children[0]?.position?.start.offset;
	const last = node.children.at(-1)?.position?.end.offset;
	if (first === undefined || last === undefined) return '';
	return src.slice(first, last).trim();
}

/** Every JSX element in `tree`, in source order, the children of one included after it. */
export function jsxElements(tree: MdxNode): JsxElement[] {
	const out: JsxElement[] = [];
	const walk = (node: MdxNode) => {
		if (isJsxElement(node)) out.push(node);
		for (const child of node.children ?? []) walk(child);
	};
	walk(tree);
	return out;
}

/** The `phase` prop of a checkpoint tag: one of `PHASES` as a string, `first` when absent. */
export function phaseProp(where: string, attrs: Map<string, CheckpointAttr>): CheckpointPhase {
	const v = attrs.get('phase')?.value;
	if (v === undefined) return DEFAULT_PHASE;
	if (!isPhase(v)) throw new Error(`${where}: phase must be one of ${PHASES.join(', ')}, got ${JSON.stringify(v)}`);
	return v;
}

/** The start and end offsets of a node; `-1` when the parser gave none. */
function offsets(node: MdxNode): { start: number; end: number } {
	return { start: node.position?.start.offset ?? -1, end: node.position?.end.offset ?? -1 };
}

/**
 * The "More practice" rules (spec S03 "More practice"), checked over
 * `elements`, the tree's JSX elements in source order: at most one
 * `<MorePractice>` block, after the `<Exercise>` and before the `<Recap>`,
 * holding one to `MAX_PRACTICE` checkpoints, all `practice` and every
 * `practice` checkpoint in it. Throws on the first break, naming `where`.
 */
function checkPracticePlacement(
	elements: readonly JsxElement[],
	tags: { node: JsxElement; info: CheckpointTagInfo; id: string }[],
	where: string,
): void {
	const blocks = elements.filter((n) => n.name === MORE_PRACTICE_TAG);
	if (blocks.length > 1) throw new Error(`${where}: <${MORE_PRACTICE_TAG}> is used ${blocks.length} times; use one`);
	const block = blocks[0];
	const inside = new Set(block ? jsxElements(block) : []);
	for (const { node, info, id } of tags) {
		if (info.phase === 'practice' && !inside.has(node))
			throw new Error(`${where}: "${id}" has phase="practice" but is outside <${MORE_PRACTICE_TAG}>`);
		if (info.phase !== 'practice' && inside.has(node))
			throw new Error(`${where}: "${id}" is inside <${MORE_PRACTICE_TAG}>, so it needs phase="practice"`);
	}
	if (!block) return;
	const count = tags.filter((t) => inside.has(t.node)).length;
	if (count === 0 || count > MAX_PRACTICE)
		throw new Error(`${where}: <${MORE_PRACTICE_TAG}> holds ${count} checkpoints; it takes 1 to ${MAX_PRACTICE}`);
	const at = offsets(block);
	for (const exercise of elements.filter((n) => n.name === 'Exercise')) {
		if (offsets(exercise).end > at.start)
			throw new Error(`${where}: <${MORE_PRACTICE_TAG}> must come after the <Exercise>`);
	}
	for (const recap of elements.filter((n) => n.name === 'Recap')) {
		if (offsets(recap).start < at.end) throw new Error(`${where}: <${MORE_PRACTICE_TAG}> must come before the <Recap>`);
	}
}

/**
 * Throws unless the checkpoint id `id` differs from every other DOM id the
 * page gets: a heading slug in `slugs`, the id of a row of a `<Match>` in
 * `matchIds`, and an id the build adds (`isBuildId`). Names `where`.
 */
function assertFreeDomId(where: string, id: string, slugs: ReadonlySet<string>, matchIds: ReadonlySet<string>): void {
	if (slugs.has(id)) throw new Error(`${where}: checkpoint id "${id}" is also a heading slug; pick another id`);
	if (isBuildId(id, slugs))
		throw new Error(`${where}: checkpoint id "${id}" is also an id the build adds to the lesson page; pick another id`);
	const row = MATCH_ROW_ID.exec(id);
	if (row && matchIds.has(row[1] ?? ''))
		throw new Error(
			`${where}: checkpoint id "${id}" is also the id of a row of <Match id="${row[1]}">; pick another id`,
		);
}

/**
 * The checkpoint tags in `tree`, parsed from `src`: the component name, its
 * props, and the children as Markdown (empty for a self-closing tag). `where`
 * names the lesson in error messages. The reader only knows the tags in
 * `KIND_OF_TAG`, so a new kind enters there first. A `<Predict>` with no
 * `objective` is an ungraded example, not a checkpoint, and is skipped, but
 * its `id` still counts: every tag's string `id` must be unique in the page,
 * because each one becomes a DOM id. For the same reason it must not be a
 * heading slug of the page, the id of a `<Match>` row or an id the build adds
 * (`isBuildId` in `lib/page-ids.ts`, issue #471). Each tag's `phase` is read and checked,
 * and so is where the `practice` ones are (`checkPracticePlacement`).
 */
export function checkpointTagsIn(tree: MdxNode, src: string, where: string): CheckpointTagInfo[] {
	const out: CheckpointTagInfo[] = [];
	const placed: { node: JsxElement; info: CheckpointTagInfo; id: string }[] = [];
	const ids = new Set<string>();
	const elements = jsxElements(tree);
	// The ids the build gives the headings (`lib/section-slugs.ts`), so a repeated heading's `-1` counts too.
	const slugs = new Set(headingSlugs(tree));
	// A `<Match>` gives each of its rows ids too (`MATCH_ROW_ID`).
	const matchIds = new Set(
		elements
			.filter((n) => n.name === 'Match')
			.map((n) => attrsOf(n, where).get('id')?.value)
			.filter((v): v is string => typeof v === 'string'),
	);
	for (const node of elements) {
		const kind: CheckpointKind | undefined = node.name ? KIND_OF_TAG[node.name as CheckpointTag] : undefined;
		if (!kind) continue;
		const tag = node.name as CheckpointTag;
		const attrs = attrsOf(node, where);
		const id = attrs.get('id');
		if (id && !id.expr && typeof id.value === 'string') {
			if (ids.has(id.value)) throw new Error(`${where}: id "${id.value}" is used twice`);
			ids.add(id.value);
			assertFreeDomId(where, id.value, slugs, matchIds);
		}
		// A Predict without an objective is an ungraded example (spec S03 "Examples"): CI runs its fixture,
		// the page shows the output, and it is not a checkpoint anywhere.
		if (tag === 'Predict' && !attrs.has('objective')) continue;
		const label = typeof id?.value === 'string' ? id.value : `<${tag}>`;
		const info: CheckpointTagInfo = {
			tag,
			kind,
			attrs,
			stem: childrenSource(node, src),
			phase: phaseProp(`${where}#${label}`, attrs),
		};
		out.push(info);
		placed.push({ node, info, id: label });
	}
	checkPracticePlacement(elements, placed, where);
	return out;
}

/** The checkpoint tags of one MDX source, parsed and read in one call. A parse error names `where`. */
export function checkpointTagsOfSource(src: string, where: string): CheckpointTagInfo[] {
	let tree: MdxNode;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${(e as Error).message}`);
	}
	return checkpointTagsIn(tree, src, where);
}

/** A prop's value: the string text, or the literal the expression holds. `undefined` when absent. */
export function propValue(attrs: Map<string, CheckpointAttr>, name: string): unknown {
	return attrs.get(name)?.value;
}

/** A prop that must be a string when present: `name="text"` or `name={'text'}`. */
export function stringProp(where: string, attrs: Map<string, CheckpointAttr>, name: string): string | undefined {
	const v = propValue(attrs, name);
	if (v !== undefined && typeof v !== 'string') throw new Error(`${where}: ${name} must be a string, got ${typeof v}`);
	return v;
}

/**
 * The `concepts` prop as a list of ids: the array-literal form, non-empty and
 * all strings. The ids are checked against the topics by the caller
 * (`lib/concepts.ts`).
 */
export function conceptsProp(where: string, attrs: Map<string, CheckpointAttr>): string[] {
	const attr = attrs.get('concepts');
	if (!attr?.expr) throw new Error(`${where}: ${CONCEPTS_FORM} is required`);
	const value = attr.value;
	if (!Array.isArray(value) || !value.every((c) => typeof c === 'string')) {
		throw new Error(`${where}: concepts must be an array of concept ids, as ${CONCEPTS_FORM}`);
	}
	if (value.length === 0) throw new Error(`${where}: concepts needs at least one concept id`);
	return value as string[];
}
