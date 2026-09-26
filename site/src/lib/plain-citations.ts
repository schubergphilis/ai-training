import {
	hasMultipleKeys,
	multipleKeysMessage,
	splitCitations,
	unknownKeyMessage,
} from '../../plugins/citation-syntax.mjs';
import type { BibliographyEntry } from './citations';

/**
 * `(@key)` citations as plain text, for the JSON exports a tutor reads (spec
 * S08 "Lesson bundles"): the lesson bundle's `prose`, its behaviors'
 * `claim`, `why` and `example`, and the checkpoint stems in
 * `checkpoints.json` and the bundles. The HTML pages render citations as
 * numbered links instead (`citations.ts` and `plugins/remark-citations.mjs`).
 * Code is set aside first, so a token in a fenced block or a code span stays
 * as written.
 */

/**
 * Code set aside while the prose passes run. A fenced block or an inline
 * code span is swapped for a placeholder no lesson text contains, and `restore`
 * puts the code back, so a `<Tag>` or a `](/path)` inside code is never read
 * as a component or a link.
 */
export interface CodeAside {
	text: string;
	/** Sets more text aside, so it is copied unchanged through the passes that follow. */
	keep: (code: string) => string;
	restore: (s: string) => string;
}

// Private-use characters, which no lesson text contains.
const PLACEHOLDER = /\uE000(\d+)\uE001/g;

/** The fenced blocks (```` ``` ```` or `~~~`, three or more, closed by a fence of the same character at least as long) and inline code spans of `src`, set aside. */
export function setAsideCode(src: string): CodeAside {
	const kept: string[] = [];
	const keep = (code: string) => {
		kept.push(code);
		return `\uE000${kept.length - 1}\uE001`;
	};
	const lines = src.split('\n');
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const open = /^(\s*)(`{3,}|~{3,})/.exec(line);
		if (!open) {
			out.push(line);
			continue;
		}
		const fence = open[2] as string;
		const block = [line];
		for (i++; i < lines.length; i++) {
			block.push(lines[i] as string);
			const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[i] as string);
			if (close && close[1]?.[0] === fence[0] && (close[1]?.length ?? 0) >= fence.length) break;
		}
		out.push(keep(block.join('\n')));
	}
	// Inline spans are matched over the whole text, since a span may wrap across a line break. A blank line
	// ends a paragraph and so a span, so the body pattern excludes one and a stray backtick before a blank
	// line pairs with nothing. The fenced blocks are placeholders by now, so no backtick is theirs.
	// A backtick next to a brace (`={\`` and `\`}`) delimits a template literal in a component attribute, and
	// is never a span's edge, so two such attributes on adjacent lines don't pair up as one span. The same rule
	// makes a span whose whole body is one brace (`{` or `}`) no span, since its closing backtick follows a `{`
	// or its opening backtick precedes a `}`, and the backticks it leaves pair with the next span's. No lesson
	// has such a span (write the brace in a fenced block instead), and `scripts/lib/bundles.mjs` checks only
	// fenced blocks, so a rewrite inside one would pass. Extend the rule before writing one.
	// The body's edges are not backticks, and its middle may hold one, so ``a ` b`` is one span.
	const edge = '(?:[^`\\n]|\\n(?![ \\t]*\\n))';
	const middle = '(?:[^\\n]|\\n(?![ \\t]*\\n))';
	const span = new RegExp(`(?<!\\{)(\`+)(?!\\})(${edge}|${edge}${middle}*?${edge})(?<!\\{)\\1(?!\`)(?!\\})`, 'g');
	const text = out.join('\n').replace(span, (m) => keep(m));
	return {
		text,
		keep,
		restore: (s) => s.replace(PLACEHOLDER, (_, n: string) => kept[Number(n)] ?? ''),
	};
}

/**
 * A citation as the prose shows it (spec S08 "Lesson bundles"): the source's
 * title and container in parentheses, or the title alone when the entry has
 * no container or its container is the title, as the References list does.
 */
export function citationText(entry: BibliographyEntry): string {
	const container = entry.container && entry.container !== entry.title ? `, ${entry.container}` : '';
	return `(${entry.title}${container})`;
}

/**
 * Every `(@key)` token in `text`, the lesson with its code set aside, replaced
 * by `citationText` for its entry. The rendered text is set aside too, so the
 * MDX parser never reads a title as markup, and a token inside code, already
 * a placeholder, stays as written. A token inside a component's children
 * resolves, as it does on the page. An unknown key or a token with more than
 * one key throws the message remark-citations.mjs fails the page build with.
 */
export function resolveCitations(
	text: string,
	bibliography: Record<string, BibliographyEntry>,
	aside: CodeAside,
	where: string,
): string {
	return splitCitations(text)
		.map((part) => {
			if (part.type === 'text') return part.value;
			if (hasMultipleKeys(part.key)) throw new Error(multipleKeysMessage(where, part.key));
			const entry = bibliography[part.key];
			if (!entry) throw new Error(unknownKeyMessage(where, part.key));
			return aside.keep(citationText(entry));
		})
		.join('');
}

/**
 * `text` with each `(@key)` outside code rendered by `citationText`, and its
 * code unchanged. This is the pass `proseOf` runs, for a field that is plain
 * text with no components: a behavior's `claim`, `why` or `example`, or a
 * checkpoint stem. An unknown key or a token with more than one key throws,
 * naming `where`.
 */
export function plainCitations(text: string, bibliography: Record<string, BibliographyEntry>, where: string): string {
	const aside = setAsideCode(text);
	return aside.restore(resolveCitations(aside.text, bibliography, aside, where));
}
