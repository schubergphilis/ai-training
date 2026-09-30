import {
	type BundleSources,
	buildLessonBundles,
	bundleOf,
	lessonUrl,
	proseOf,
	renderLessonBody,
} from '@lib/lesson-bundles';
import type { Lesson } from '@lib/lessons';
import { describe, expect, it, vi } from 'vitest';
import { bibliography, competencies, docs, topics } from './content';

vi.mock('astro:content', async () => (await import('./content')).mockContent());

const site = 'https://schubergphilis.github.io';
const ROOT = 'https://schubergphilis.github.io/ai-training';

describe('lessonUrl', () => {
	it('is the lesson page under site and base', () => {
		expect(lessonUrl('safety/agent-risk', site)).toBe(`${ROOT}/safety/agent-risk/`);
	});
});

describe('renderLessonBody with the alternate flag', () => {
	const pageUrl = `${ROOT}/x/y/`;
	const alt = (body: string, components?: Record<string, () => string>) =>
		renderLessonBody(body, site, 'x/y', {}, { pageUrl, ...(components ? { components } : {}) }).markdown;
	it('is the bundle prose without the flag', () => {
		const body = '<Habit id="h">\nDo it.\n</Habit>\n\nSee [a](#b).\n';
		expect(renderLessonBody(body, site, 'x/y', {}).markdown).toBe(proseOf(body, site, 'x/y'));
		expect(alt(body)).toBe(`#### Habit\n\nDo it.\n\nSee [a](${pageUrl}#b).\n`);
	});
	it('lists Scenario options, keeps a multi-line option in its item, and resolves a raw HTML fragment link', () => {
		expect(
			alt(
				'<Scenario id="s" objective="o" title="S" options={[{ text: \'One\\nline two\', correct: true, consequence: \'Q\' }]}>\nStem.\n</Scenario>\n\n<a href="#s">up</a>\n',
			),
		).toBe(`#### Checkpoint: S\n\nStem.\n\n- One\n  line two\n\n<a href="${pageUrl}#s">up</a>\n`);
	});
	it('renders a component by name through `components`', () => {
		expect(alt('Intro.\n\n<CoursePlan area="x" />\n', { CoursePlan: () => '- A lesson' })).toBe(
			'Intro.\n\n- A lesson\n',
		);
	});
	it('names the lesson when a checkpoint prop has the wrong form', () => {
		expect(() => alt('<Choice id="c" objective="o" title="C" options="none">\nS.\n</Choice>\n')).toThrow(
			'x/y: options of <Choice> must be an array',
		);
		expect(() => alt('<Order id="o" objective="o" title="O" steps={[1]}>\nS.\n</Order>\n')).toThrow(
			'x/y: an item of <Order> has no text',
		);
		expect(() => alt('<Repair id="r" objective="o" title="R" broken={1}>\nS.\n</Repair>\n')).toThrow(
			'x/y: broken of <Repair> must be a string',
		);
		expect(() => alt('<Predict id="p" title="P" answer={1}>\nS.\n</Predict>\n')).toThrow(
			'x/y: answer of an example <Predict> must be a string',
		);
	});
});

describe('proseOf', () => {
	it('keeps a run of blank lines inside a fenced block and collapses one outside', () => {
		const block = '```python\nimport os\n\n\ndef f():\n    pass\n```';
		expect(proseOf(`Before.\n\n\n\n${block}\n\n\n\nAfter.\n`, site)).toBe(`Before.\n\n${block}\n\nAfter.\n`);
	});
	it('drops the import block, omits widgets, and renders components to Markdown', () => {
		const md = proseOf(
			[
				"import { Choice, Pitfall, Exercise, Recap } from '@components/lesson';",
				"import Sampler from '@components/widgets/Sampler.astro';",
				'',
				'Intro with a [link](/glossary/#token) and ![img](/pic.png).',
				'',
				'<Sampler />',
				'',
				'<Pitfall title="Asking why">',
				'The model has no log.',
				'</Pitfall>',
				'',
				'<Choice id="c1" objective="o1" title="Pick one" hint="h" concepts={[\'token\']} options={[{ text: \'a > b\', correct: true }]}>',
				'Which is it?',
				'</Choice>',
				'',
				'<Predict id="ex" title="Shown" answer="2" run="y.py">',
				'Run this.',
				'</Predict>',
				'',
				'<Exercise stretch="Try more.">',
				'Do the thing.',
				'</Exercise>',
				'',
				'<Recap>',
				'',
				'1. One.',
				'',
				'</Recap>',
				'',
				'<a href="/ai-training/guides/">raw</a>',
			].join('\n'),
			site,
		);
		expect(md).toBe(
			[
				`Intro with a [link](${ROOT}/glossary/#token) and ![img](${ROOT}/pic.png).`,
				'',
				'#### Pitfall: Asking why',
				'',
				'The model has no log.',
				'',
				'#### Checkpoint: Pick one',
				'',
				'Which is it?',
				'',
				'#### Example: Shown',
				'',
				'Run this.',
				'',
				'## Exercise',
				'',
				'Do the thing.',
				'',
				'Stretch: Try more.',
				'',
				'## Recap',
				'',
				'1. One.',
				'',
				`<a href="${ROOT}/guides/">raw</a>`,
				'',
			].join('\n'),
		);
	});
	it('fences Prompt and Response with a fence longer than any inside, and keeps the illustrative caption', () => {
		const md = proseOf(
			'<Prompt model="illustrative" recorded="illustrative">\nSay:\n\n```python\nprint(1)\n```\n</Prompt>\n<Response>\nOk.\n</Response>\n',
			site,
		);
		expect(md).toBe(
			'#### Prompt (illustrative, not a recorded transcript)\n\n````text\nSay:\n\n```python\nprint(1)\n```\n````\n\n#### Response\n\n```text\nOk.\n```\n',
		);
		expect(proseOf('<Prompt model="claude-x" recorded="2026-09">\nHi.\n</Prompt>\n', site)).toBe(
			'#### Prompt · claude-x, recorded 2026-09\n\n```text\nHi.\n```\n',
		);
	});
	it('leaves out a hidden review alternate and titles the More practice section', () => {
		const md = proseOf(
			[
				'<Choice id="a" objective="o" title="Own">\nAsk.\n</Choice>',
				'<Choice id="b" phase="review" objective="o" title="Hidden">\nAgain.\n</Choice>',
				'<MorePractice>\n<Choice id="c" phase="practice" objective="o" title="Extra">\nMore.\n</Choice>\n</MorePractice>',
				'',
			].join('\n\n'),
			site,
		);
		expect(md).toBe('#### Checkpoint: Own\n\nAsk.\n\n## More practice\n\n#### Checkpoint: Extra\n\nMore.\n');
	});
	it('titles a habit by its id', () => {
		expect(
			proseOf('<Recap>\n1. A.\n</Recap>\n<Habit id="check-the-diff">\nRead the diff first.\n</Habit>\n', site),
		).toBe('## Recap\n\n1. A.\n\n#### Habit: check-the-diff\n\nRead the diff first.\n');
	});
	it('leaves a link inside a Prompt or Response body alone, in a code span or not', () => {
		expect(proseOf('<Response>\nSee `[a](/x/)` and [b](/y/).\n</Response>\n', site)).toBe(
			'#### Response\n\n```text\nSee `[a](/x/)` and [b](/y/).\n```\n',
		);
	});
	it('copies code unchanged: imports, tags, XML and links inside fences or code spans', () => {
		const src = [
			"import { Pitfall } from '@components/lesson';",
			'',
			'Use `<Tool>` and `[b](/guides/y/)` as written.',
			'',
			'```python',
			'import fnmatch',
			'',
			'def f(): return fnmatch.fnmatchcase("a", "a")',
			'```',
			'',
			'```ts',
			'const p: Promise<LessonBundle[]> = build();',
			'```',
			'',
			'```xml',
			'<Doc><Title>x</Title></Doc>',
			'```',
			'',
			'```md',
			'[see](/guides/z/)',
			'```',
			'',
			'<Pitfall title="Real">',
			'Text with `<API>` and a [link](/guides/x/).',
			'</Pitfall>',
		].join('\n');
		const md = proseOf(src, site);
		expect(md).toBe(
			[
				'Use `<Tool>` and `[b](/guides/y/)` as written.',
				'',
				'```python',
				'import fnmatch',
				'',
				'def f(): return fnmatch.fnmatchcase("a", "a")',
				'```',
				'',
				'```ts',
				'const p: Promise<LessonBundle[]> = build();',
				'```',
				'',
				'```xml',
				'<Doc><Title>x</Title></Doc>',
				'```',
				'',
				'```md',
				'[see](/guides/z/)',
				'```',
				'',
				'#### Pitfall: Real',
				'',
				`Text with \`<API>\` and a [link](${ROOT}/guides/x/).`,
				'',
			].join('\n'),
		);
	});
	it('keeps the children of an unknown component and rejects an unclosed one, naming the lesson', () => {
		expect(proseOf('<Aside>\nKept.\n</Aside>\n', site)).toBe('Kept.\n');
		expect(() => proseOf('<Pitfall title="x">\nno end\n', site, 'a/b')).toThrow(
			/^a\/b: Expected a closing tag for `<Pitfall>`/,
		);
	});
	it('reads the tags from the MDX tree: raw HTML stays, a component inside it renders, and a prop must be a literal', () => {
		expect(proseOf('<div class="x">\n<Pitfall title="In">\nText.\n</Pitfall>\n</div>\n', site)).toBe(
			'<div class="x">\n\n#### Pitfall: In\n\nText.\n\n</div>\n',
		);
		expect(proseOf('<Pitfall title={`Tick`}>\nT.\n</Pitfall>\n', site)).toBe('#### Pitfall: Tick\n\nT.\n');
		expect(() => proseOf('<Pitfall title={1}>\nT.\n</Pitfall>\n', site, 'a/b')).toThrow(
			/^a\/b: title of <Pitfall> must be a string, got number/,
		);
		expect(() => proseOf('<Sampler seed={seed} />\n', site, 'a/b')).toThrow(
			/^a\/b: cannot read seed=\{\.\.\.\} of <Sampler>: Identifier is not a literal/,
		);
	});
});

describe('citations in proseOf', () => {
	const bib = {
		'AEC-02': { type: 'course', title: 'How agents think', container: 'Agent Engineer Course' },
		'Claude Code docs.permissions': { type: 'reference', title: 'Permissions', container: null },
		Same: { type: 'book', title: 'Same', container: 'Same' },
	};
	it('renders a token as its source, as citationText does', () => {
		expect(proseOf('Tokens (@AEC-02) and rules (@Claude Code\n  docs.permissions).\n', site, 'a/b', bib)).toBe(
			'Tokens (How agents think, Agent Engineer Course) and rules (Permissions).\n',
		);
	});
	it('resolves a token in component children and props, and leaves one in code unchanged', () => {
		const src = [
			'<Pitfall title="Cited (@Same)">',
			'See (@AEC-02), not `(@AEC-02)`.',
			'</Pitfall>',
			'',
			'<Prompt model="illustrative">',
			'Read (@Same) and `(@Same)`.',
			'</Prompt>',
			'',
			'```md',
			'Write (@AEC-02) to cite.',
			'```',
			'',
		].join('\n');
		expect(proseOf(src, site, 'a/b', bib)).toBe(
			[
				'#### Pitfall: Cited (Same)',
				'',
				'See (How agents think, Agent Engineer Course), not `(@AEC-02)`.',
				'',
				'#### Prompt (illustrative, not a recorded transcript)',
				'',
				'```text',
				'Read (Same) and `(@Same)`.',
				'```',
				'',
				'```md',
				'Write (@AEC-02) to cite.',
				'```',
				'',
			].join('\n'),
		);
	});
	it('does not read a title as markup', () => {
		const odd = { X: { type: 'book', title: 'Use <Tag> and {x}', container: null } };
		expect(proseOf('A (@X).\n', site, 'a/b', odd)).toBe('A (Use <Tag> and {x}).\n');
	});
	it('rejects an unknown key and a token with two keys, naming the lesson', () => {
		expect(() => proseOf('A (@Nope).\n', site, 'a/b', bib)).toThrow(/^a\/b: unknown citation key "Nope"/);
		expect(() => proseOf('A (@AEC-02, @Same).\n', site, 'a/b', bib)).toThrow(
			/^a\/b: citation key "AEC-02, @Same" contains "@"/,
		);
	});
});

describe('bundleOf and buildLessonBundles', () => {
	it('builds one bundle per live lesson, in id order, with an id equal to its path', async () => {
		const bundles = await buildLessonBundles(site);
		expect(bundles.map((b) => b.id)).toEqual(['concepts/how-models-work', 'safety/agent-risk', 'safety/deeper']);
		for (const b of bundles) {
			expect(b.version).toBe(1);
			expect(b.url).toBe(`${ROOT}/${b.id}/`);
			expect(JSON.parse(JSON.stringify(b))).toEqual(b);
		}
	});
	it('copies the topic, objectives, checkpoints and assumes with absolute URLs', async () => {
		const [models, risk, deeper] = await buildLessonBundles(site);
		expect(models).toMatchObject({
			title: 'How a language model works',
			mode: 'explanation',
			topics: [{ id: 'concepts/models', name: 'Models', url: `${ROOT}/topics/concepts/models/` }],
			objectives: [
				{
					id: 'o1',
					statement: 'Explains generation',
					level: 'base',
					competency_url: `${ROOT}/competencies/concepts/explains-models/#o1`,
					behaviors: [],
				},
			],
			assumes: [],
			extends_to: [],
		});
		expect(models?.topics[0]?.concepts.map((c) => c.id)).toEqual(['token', 'context-window']);
		expect(models?.checkpoints.map((c) => c.id)).toEqual(['what-the-model-does', 'honor', 'graded', 'fix', 'opt-out']);
		expect(models?.checkpoints[0]).not.toHaveProperty('lesson');
		expect(models?.checkpoints[0]).toMatchObject({ kind: 'choice', options: ['a', 'b > c'], answer: 'a', revision: 1 });
		expect(models?.prose).toContain('#### Checkpoint: What the model does');
		expect(models?.prose).toContain('## Recap');
		expect(models?.prose).toContain('Tokens, **not** words (How agents think, Agent Engineer Course).');
		expect(models?.prose).not.toContain('(@');
		expect(risk?.assumes).toEqual([
			{ objective: 'o1', lesson: 'concepts/how-models-work', section: 's', url: `${ROOT}/concepts/how-models-work/#s` },
		]);
		expect(risk?.prose).toContain(
			'#### Prompt (illustrative, not a recorded transcript)\n\n```text\nSummarize the memo.\n\n- Keep every date.',
		);
		expect(deeper?.checkpoints).toEqual([]);
		expect(deeper?.topics.map((t) => t.id)).toEqual(['safety/depth']);
	});
	it('rejects a lesson whose topic or objective is unknown, and handles a bare assumes entry', () => {
		const sources: BundleSources = {
			topics: topics.map((t) => ({ ...t.data, definition: 'd' })),
			competencies: competencies.map((c) => c.data) as BundleSources['competencies'],
			items: [],
			lessonIds: new Set(['concepts/how-models-work']),
			bibliography: Object.fromEntries(bibliography.map((e) => [e.id, e.data])),
			site,
		};
		const base = docs.find((d) => d.id === 'safety/agent-risk') as unknown as Lesson;
		const lesson = (data: object): Lesson => ({ ...base, data: { ...base.data, ...data } }) as Lesson;
		expect(() => bundleOf(lesson({ covers: 'nowhere/none' }), sources)).toThrow(/covers nowhere\/none/);
		expect(() => bundleOf(lesson({ serves: ['o9'] }), sources)).toThrow(/serves o9/);
		expect(() => bundleOf(lesson({ assumes: [{ objective: 'o1', lesson: 'concepts/gone' }] }), sources)).toThrow(
			/assumes o1 from concepts\/gone, which is not a lesson page/,
		);
		const bare = bundleOf(
			lesson({ assumes: [{ objective: 'o1' }], 'extends-to': [{ label: 'Next', href: '/safety/deeper/' }] }),
			sources,
		);
		expect(bare.assumes).toEqual([{ objective: 'o1', lesson: null, section: null, url: null }]);
		expect(bare.extends_to).toEqual([{ label: 'Next', url: `${ROOT}/safety/deeper/` }]);
		// A behavior's citations render as their sources in each of its three fields, and code stays as written.
		const judged = bundleOf(lesson({ serves: ['o2'] }), sources);
		expect(judged.objectives[0]?.behaviors).toEqual([
			{
				claim: 'Reads the diff before `git push` (How agents think, Agent Engineer Course).',
				why: 'A wrong line ships otherwise (Taste, Brilliant).',
				example: 'Runs the tests once more (How agents think, Agent Engineer Course).',
			},
		]);
		const unknown = { ...sources, bibliography: {} };
		expect(() => bundleOf(lesson({ serves: ['o2'] }), unknown)).toThrow(
			/^safety\/agent-risk: o2 behavior 1 claim: unknown citation key "AEC-02"/,
		);
		// An external entry (an https:// URL under a bibliography url) is passed through as is.
		const academy = 'https://academy.claude.com/courses/ai-capabilities-and-limitations';
		const external = bundleOf(lesson({ 'extends-to': [{ label: 'Academy', href: academy }] }), sources);
		expect(external.extends_to).toEqual([{ label: 'Academy', url: academy }]);
	});
});
