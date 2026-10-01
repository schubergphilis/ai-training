import { citationText, plainCitations, setAsideCode } from '@lib/plain-citations';
import { describe, expect, it } from 'vitest';

describe('setAsideCode', () => {
	it('sets fenced blocks and inline code aside and restores them byte for byte', () => {
		const src = 'A `<Tool>` here.\n\n````md\n```\ninner\n```\n````\n\n~~~ts\nPromise<X[]>\n~~~\nEnd.';
		const { text, restore } = setAsideCode(src);
		expect(text).not.toContain('<Tool>');
		expect(text).not.toContain('Promise');
		expect(text).not.toContain('inner');
		expect(restore(text)).toBe(src);
	});
	it('sets a code span that wraps across a line break aside, but not one across a blank line', () => {
		const wrapped = 'See `a\n<Tag>` here.';
		const { text, restore } = setAsideCode(wrapped);
		expect(text).not.toContain('<Tag>');
		expect(restore(text)).toBe(wrapped);
		const paragraphs = 'Odd ` tick.\n\nAnother ` tick.';
		expect(setAsideCode(paragraphs).text).toBe(paragraphs);
	});
	it('sets a double-backtick span with a backtick inside aside', () => {
		const src = 'Use ``a ` <Tag>`` here.';
		const { text, restore } = setAsideCode(src);
		expect(text).not.toContain('<Tag>');
		expect(restore(text)).toBe(src);
	});
	it('a stray backtick before a blank line does not shift the spans of the next paragraph', () => {
		const src = 'Stray ` here.\n\nA `<Tag>` span, and <Real /> after.';
		const { text, restore } = setAsideCode(src);
		expect(text).not.toContain('<Tag>');
		expect(text).toContain('<Real />');
		expect(text).toContain('Stray ` here.');
		expect(restore(text)).toBe(src);
	});
	it('does not pair the backticks of template-literal attributes on adjacent lines as a span', () => {
		const tag = '<Repair broken={`# a\n\nb`}\n  model={`# c\n\nd`}>\nWhy?\n</Repair>';
		expect(setAsideCode(tag).text).toBe(tag);
	});
	it('opens no span on an escaped backtick, so a template literal keeps its escapes for the MDX parser', () => {
		const tag = '<Predict id="p" answer={`Run \\`x\\` and \\`y\\`.`}>\nA `<Tag>` span.\n</Predict>';
		const { text, restore } = setAsideCode(tag);
		expect(text).toContain('answer={`Run \\`x\\` and \\`y\\`.`}');
		expect(text).not.toContain('<Tag>');
		expect(restore(text)).toBe(tag);
		const { text: even } = setAsideCode('a \\\\`<x>` and `<y>`');
		expect(even).toMatch(/^a \\\\\uE000\d+\uE001 and \uE000\d+\uE001$/);
		expect(setAsideCode('a \\\\\\`<x>` b').text).toBe('a \\\\\\`<x>` b');
		const { text: closed } = setAsideCode('A path `C:\\` here.');
		expect(closed).toMatch(/^A path \uE000\d+\uE001 here\.$/);
	});
	it('a documented limit: a span whose whole body is one brace is no span, and its backticks pair with the next', () => {
		// The template-literal rule above rejects `{` and `}` as a body. No lesson has one, and the comment in
		// `setAsideCode` says so. This test pins the behavior so that a change to the rule shows up here.
		expect(setAsideCode('An open `{` brace.').text).toBe('An open `{` brace.');
		const { text, restore } = setAsideCode('A close `}` and `x` here.');
		expect(text).toMatch(/^A close `}\uE000\d+\uE001x` here\.$/);
		expect(restore(text)).toBe('A close `}` and `x` here.');
	});
	it('leaves an unclosed fence as code to the end', () => {
		const { text, restore } = setAsideCode('```\nopen\n<Tag>');
		expect(text).toMatch(/^\uE000\d+\uE001$/);
		expect(restore(text)).toBe('```\nopen\n<Tag>');
	});
});

describe('citationText', () => {
	const bib = {
		'AEC-02': { type: 'course', title: 'How agents think', container: 'Agent Engineer Course' },
		'Claude Code docs.permissions': { type: 'reference', title: 'Permissions', container: null },
		Same: { type: 'book', title: 'Same', container: 'Same' },
	};
	it('renders an entry as title and container, or the title alone without a distinct container', () => {
		expect(citationText(bib['AEC-02'])).toBe('(How agents think, Agent Engineer Course)');
		expect(citationText(bib['Claude Code docs.permissions'])).toBe('(Permissions)');
		expect(citationText(bib.Same)).toBe('(Same)');
	});
});

describe('plainCitations', () => {
	const bib = { 'AEC-02': { type: 'course', title: 'How agents think', container: 'Agent Engineer Course' } };
	it('renders a token as proseOf does and leaves one in a code span or fenced block unchanged', () => {
		expect(plainCitations('Run in (@AEC-02), not `(@AEC-02)`?', bib, 'x#a stem')).toBe(
			'Run in (How agents think, Agent Engineer Course), not `(@AEC-02)`?',
		);
		expect(plainCitations('A\n\n```\n(@AEC-02)\n```\n', bib, 'x#a stem')).toBe('A\n\n```\n(@AEC-02)\n```\n');
		expect(plainCitations('No token.', bib, 'x#a stem')).toBe('No token.');
	});
	it('rejects an unknown key and a token with two keys, naming where', () => {
		expect(() => plainCitations('(@Nope)', bib, 'x#a stem')).toThrow(/^x#a stem: unknown citation key "Nope"/);
		expect(() => plainCitations('(@AEC-02, @B)', bib, 'x#a stem')).toThrow(/^x#a stem: citation key "AEC-02, @B"/);
	});
});
