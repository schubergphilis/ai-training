import {
	attrsOf,
	checkpointTagsOfSource,
	childrenSource,
	isJsxElement,
	jsxElements,
	literalOf,
	parseMdx,
} from '@lib/checkpoint-tags';
import { describe, expect, it } from 'vitest';

/** The ESTree of one JavaScript expression, as the MDX parser attaches it to a `{...}` prop. */
function estree(expr: string) {
	const tree = parseMdx(`<X a={${expr}} />`);
	const [node] = jsxElements(tree);
	const attr = node?.attributes[0];
	if (!attr || typeof attr.value !== 'object' || attr.value === null) throw new Error('no expression');
	return attr.value.data?.estree?.body[0]?.expression;
}

describe('literalOf', () => {
	it('reads strings, numbers, booleans, null, templates, arrays, objects and negative numbers', () => {
		expect(literalOf(estree("'s'"))).toBe('s');
		expect(literalOf(estree('2'))).toBe(2);
		expect(literalOf(estree('-2'))).toBe(-2);
		expect(literalOf(estree('true'))).toBe(true);
		expect(literalOf(estree('null'))).toBe(null);
		expect(literalOf(estree('`a > b`'))).toBe('a > b');
		expect(literalOf(estree("[{ text: 'x', correct: true, 'why': 1 }, ['n']]"))).toEqual([
			{ text: 'x', correct: true, why: 1 },
			['n'],
		]);
	});
	it('rejects anything that is not a literal, naming the construct', () => {
		expect(() => literalOf(estree('name'))).toThrow(/Identifier/);
		expect(() => literalOf(estree('f()'))).toThrow(/CallExpression/);
		expect(() => literalOf(estree('`a ${'.concat('b}`')))).toThrow(/template literal with placeholders/);
		expect(() => literalOf(estree('[1, , 2]'))).toThrow(/hole in an array/);
		expect(() => literalOf(estree('{ ...rest }'))).toThrow(/SpreadElement in an object literal/);
		expect(() => literalOf(estree('{ [k]: 1 }'))).toThrow(/in an object literal/);
		expect(() => literalOf(estree('!true'))).toThrow(/! expression/);
		expect(() => literalOf(null)).toThrow(/hole/);
		expect(() => literalOf(undefined)).toThrow(/an empty expression/);
		expect(() => literalOf(estree('/a/'))).toThrow(/a RegExp literal/);
		expect(() => literalOf(estree('1n'))).toThrow(/a BigInt literal/);
	});
});

describe('attrsOf and childrenSource', () => {
	it('reads string, literal and bare props, and the children as source', () => {
		const src = '<Choice id="a" review={false} honor>\n\nStem *here*.\n\n</Choice>\n';
		const [node] = jsxElements(parseMdx(src));
		if (!node) throw new Error('no element');
		expect(isJsxElement(node)).toBe(true);
		expect([...attrsOf(node, 'x').entries()]).toEqual([
			['id', { value: 'a', expr: false }],
			['review', { value: false, expr: true }],
			['honor', { value: true, expr: false }],
		]);
		expect(childrenSource(node, src)).toBe('Stem *here*.');
	});
	it('rejects a spread prop', () => {
		const [node] = jsxElements(parseMdx('<Choice {...rest} />'));
		if (!node) throw new Error('no element');
		expect(() => attrsOf(node, 'x')).toThrow(/x: <Choice> has a spread prop/);
	});
});

describe('checkpointTagsOfSource', () => {
	it('ignores components that are not checkpoints and reads nested ones', () => {
		const src = '<Aside>\n<Choice id="in" concepts={["c"]} options={[]}>\nS\n</Choice>\n</Aside>\n';
		expect(checkpointTagsOfSource(src, 'x').map((t) => [t.tag, t.stem])).toEqual([['Choice', 'S']]);
	});
	it('names the lesson in a parse error', () => {
		expect(() => checkpointTagsOfSource('<Choice id="a>', 'x/y')).toThrow(/^x\/y: Unexpected end of file/);
	});
	it('reads the phase, first when absent', () => {
		const src =
			'<Choice id="a" concepts={["c"]}>\n</Choice>\n\n<Order id="b" phase="review" concepts={["c"]} steps={[]} />\n';
		expect(checkpointTagsOfSource(src, 'x').map((t) => t.phase)).toEqual(['first', 'review']);
		expect(() => checkpointTagsOfSource('<Choice id="a" phase={1} />', 'x')).toThrow(
			/^x#a: phase must be one of first, review, practice, got 1/,
		);
	});
	it('leaves a stray expression child in the stem source rather than failing', () => {
		const src = '<Choice id="a">\n{/* note */}\n\nStem.\n</Choice>';
		expect(checkpointTagsOfSource(src, 'x')[0]?.stem).toBe('{/* note */}\n\nStem.');
	});
});

describe('the More practice rules', () => {
	const practice = (id: string) => `<Choice id="${id}" phase="practice" concepts={["c"]} />`;
	const block = (...children: string[]) => `<MorePractice>\n\n${children.join('\n\n')}\n\n</MorePractice>`;
	const page = (...parts: string[]) => parts.join('\n\n');
	const exercise = '<Exercise>\nDo.\n</Exercise>';
	const recap = '<Recap>\nDone.\n</Recap>';
	const read = (src: string) => () => checkpointTagsOfSource(src, 'x/y');

	it('accepts one block of practice checkpoints between the exercise and the recap', () => {
		const src = page('<Choice id="a" concepts={["c"]} />', exercise, block(practice('p1'), practice('p2')), recap);
		expect(checkpointTagsOfSource(src, 'x/y').map((t) => [t.attrs.get('id')?.value, t.phase])).toEqual([
			['a', 'first'],
			['p1', 'practice'],
			['p2', 'practice'],
		]);
	});
	it('rejects a practice checkpoint outside the block and another phase inside it', () => {
		expect(read(page(exercise, practice('p'), recap))).toThrow(
			/x\/y: "p" has phase="practice" but is outside <MorePractice>/,
		);
		expect(read(page(exercise, block('<Choice id="f" concepts={["c"]} />'), recap))).toThrow(
			/x\/y: "f" is inside <MorePractice>, so it needs phase="practice"/,
		);
	});
	it('rejects an empty block, a block with more than three, and a second block', () => {
		expect(read(page(exercise, block('Text only.'), recap))).toThrow(/holds 0 checkpoints; it takes 1 to 3/);
		expect(read(page(exercise, block(practice('a'), practice('b'), practice('c'), practice('d')), recap))).toThrow(
			/holds 4 checkpoints/,
		);
		expect(read(page(exercise, block(practice('a')), block(practice('b')), recap))).toThrow(/is used 2 times/);
	});
	it('rejects a block before the exercise or after the recap', () => {
		expect(read(page(block(practice('a')), exercise, recap))).toThrow(/must come after the <Exercise>/);
		expect(read(page(exercise, recap, block(practice('a'))))).toThrow(/must come before the <Recap>/);
	});
});

describe('a checkpoint id that is another DOM id on the page (issue #471)', () => {
	const read = (src: string) => () => checkpointTagsOfSource(src, 'x/y');
	const choice = (id: string) => `<Choice id="${id}" concepts={["c"]} />`;

	it('rejects a heading slug of any depth, the repeated heading suffix included', () => {
		expect(read(`## A line a team can apply\n\nText.\n\n${choice('a-line-a-team-can-apply')}`)).toThrow(
			/x\/y: id "a-line-a-team-can-apply" is also a heading slug/,
		);
		expect(read(`### Deeper still\n\n${choice('deeper-still')}`)).toThrow(/"deeper-still" is also a heading slug/);
		expect(read(`## Review\n\n### Review\n\n${choice('review-1')}`)).toThrow(/"review-1" is also a heading slug/);
		expect(checkpointTagsOfSource(`## Review\n\n${choice('review-1')}`, 'x/y')).toHaveLength(1);
	});
	it('rejects the id of an ungraded example that is a heading slug, because it is a DOM id too', () => {
		const example = '<Predict id="run-the-set" title="T" answer="1" run="x.py">\n</Predict>';
		expect(read(`## Run the set\n\n${example}`)).toThrow(/id "run-the-set" is also a heading slug/);
	});
	it('rejects an id the build adds to the lesson page', () => {
		for (const id of [
			'references',
			'lesson-toc-checkpoints',
			'recap',
			'theme-icons',
			'_top',
			'starlight__on-this-page--mobile',
			'ref-3',
			'tab-0-1',
			'tab-panel-2-0',
		]) {
			expect(read(choice(id))).toThrow(new RegExp(`id "${id}" is also an id the build adds to the lesson page`));
		}
		expect(read(`## References\n\nText.\n\n${choice('references-1')}`)).toThrow(
			/"references-1" is also an id the build adds/,
		);
		expect(checkpointTagsOfSource(choice('references-1'), 'x/y')).toHaveLength(1);
	});
	it('rejects the id of a row of a <Match> on the page', () => {
		const match = '<Match id="pair-them" concepts={["c"]} />';
		expect(read(`${match}\n\n${choice('pair-them-row-0')}`)).toThrow(
			/id "pair-them-row-0" is also the id of a row of <Match id="pair-them">/,
		);
		expect(read(`${choice('pair-them-row-1-fb')}\n\n${match}`)).toThrow(/"pair-them-row-1-fb" is also the id of a row/);
		expect(checkpointTagsOfSource(choice('other-row-0'), 'x/y')).toHaveLength(1);
	});
});
