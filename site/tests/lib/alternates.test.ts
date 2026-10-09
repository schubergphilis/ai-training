import { alternatePaths, alternateSources, coursePlanMarkdown } from '@lib/alternates';
import { getCourse } from '@lib/courses';
import { describe, expect, it, vi } from 'vitest';

const site = 'https://schubergphilis.github.io';
const ROOT = 'https://schubergphilis.github.io/ai-training';

vi.mock('astro:content', async () => {
	const { alternateDocs } = await import('./alternate-fixtures');
	return (await import('./content')).mockContent({ docs: alternateDocs });
});

async function alternateOf(path: string): Promise<string> {
	const source = (await alternateSources()).find((s) => s.path === path);
	if (!source) throw new Error(`no alternate for ${path}`);
	return source.render(site);
}

describe('alternateSources', () => {
	const paths = [
		'/safety/',
		'/concepts/how-models-work/',
		'/safety/agent-risk/',
		'/safety/deeper/',
		'/contributing/',
		'/guides/tutor/',
		'/about/',
		'/glossary/',
		'/topics/concepts/models/',
		'/topics/safety/risk/',
		'/topics/safety/injection/',
		'/topics/safety/depth/',
		'/topics/safety/governance/',
		'/competencies/concepts/explains-models/',
		'/competencies/safety/judges-output/',
		'/competencies/safety/spots-injection/',
	];
	it('lists the course pages, live lessons, guides, contributing, About, glossary, topic and competency pages, and no other page', async () => {
		expect((await alternateSources()).map((s) => s.path)).toEqual(paths);
		expect(await alternatePaths()).toEqual(new Set(paths));
	});
});

describe('a lesson alternate', () => {
	it('holds the title and each checkpoint stem, and no script or widget markup', async () => {
		const md = await alternateOf('/concepts/how-models-work/');
		expect(md.startsWith('# How a language model works\n\n> What a model does.\n\n')).toBe(true);
		for (const kind of ['choice', 'multi-choice', 'match', 'order', 'sort', 'repair', 'predict'])
			expect(md).toContain(`Stem of the ${kind}?`);
		expect(md).not.toMatch(/<script|<Sampler|not-content|<[A-Z]/);
		expect(md).not.toContain('import ');
	});
	it('leaves out every hint, why and answer, and the hidden review alternate', async () => {
		const md = await alternateOf('/concepts/how-models-work/');
		expect(md).not.toMatch(/HINTWORD|WHYWORD|ANSWERWORD/);
		expect(md).not.toContain('Hidden');
		// The hidden alternate is the only place Brilliant TAS is cited, so it is not a reference.
		expect(md).not.toContain('Taste');
	});
	it('renders each checkpoint kind with what its page shows', async () => {
		const md = await alternateOf('/concepts/how-models-work/');
		expect(md).toContain('#### Checkpoint: Pick one\n\nStem of the choice?\n\n- Right one\n- Wrong one\n');
		expect(md).toContain('Stem of the multi-choice?\n\nSelect exactly 2.\n\n- A\n- B\n- C\n');
		expect(md).toContain(
			'Stem of the match?\n\nStatements:\n\n- Row one\n- Row two\n\nOptions:\n\n- Opt one\n- Opt two\n',
		);
		// Sorted by the text the reader sees: a step that starts with a code span sorts by its backtick.
		expect(md).toContain('Stem of the order?\n\n- `cat` beta\n- alpha\n- zeta\n');
		expect(md).toContain('Stem of the sort?\n\nBuckets:\n\n- Keep\n- Drop\n\nItems:\n\n- Item x\n- Item y\n');
		// The broken text is copied as written, its link included.
		expect(md).toContain('Stem of the repair?\n\n```text\nbad [x](/y/) text\n```\n');
		expect(md).toContain('#### Checkpoint: Guess it\n\nStem of the predict?\n\n#### Example');
		expect(md).toContain('#### Example: Shown\n\nRun this.\n\nOutput:\n\n```text\n42\n```\n');
	});
	it('makes links absolute, resolves fragments against the page, titles the habit without its id', async () => {
		const md = await alternateOf('/concepts/how-models-work/');
		expect(md).toContain(`See [the recap](${ROOT}/concepts/how-models-work/#recap) and [safety](${ROOT}/safety/).`);
		expect(md).toContain('#### Habit\n\nRead it first.\n');
		expect(md).not.toContain('read-first');
	});
	it('has the page and license lines, and lists the cited source under References', async () => {
		const md = await alternateOf('/concepts/how-models-work/');
		expect(md).toContain(`Page: ${ROOT}/concepts/how-models-work/\nLicense: CC BY-SA 4.0, `);
		expect(md).toContain('Tokens, as the course says (How agents think, Agent Engineer Course).');
		expect(md.endsWith('## References\n\n- How agents think, Agent Engineer Course, https://example.com/aec\n')).toBe(
			true,
		);
	});
});

describe('a course page alternate', () => {
	it('has the course prose and the plan by part, without the lesson graph', async () => {
		const md = await alternateOf('/safety/');
		expect(md).toBe(
			[
				'# Safety',
				'',
				'> Using AI safely.',
				'',
				`Page: ${ROOT}/safety/`,
				'License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/',
				'',
				'The course prose.',
				'',
				'## Risk',
				'',
				`- [Why agent safety is different](${ROOT}/safety/agent-risk/)`,
				`- [Deeper](${ROOT}/safety/deeper/)`,
				'',
				'## Later',
				'',
				'- Coming soon (planned)',
				'',
			].join('\n'),
		);
	});
	it('lists a flat course without part headings, a live lesson with its description', async () => {
		const md = coursePlanMarkdown(await getCourse('concepts'), site);
		expect(md).toBe(`- [How a language model works](${ROOT}/concepts/how-models-work/)`);
		const withDescription = coursePlanMarkdown(
			{
				id: 'x',
				area: 'x',
				entries: [
					{ id: 'x/a', title: 'A', description: 'Does a.', status: 'live', lesson: {} },
					{ id: 'x/b', title: 'B', status: 'planned' },
				] as never,
			},
			site,
		);
		expect(withDescription).toBe(`- [A](${ROOT}/x/a/): Does a.\n- B (planned)`);
	});
});

describe('a guide and the contributing page alternate', () => {
	it('has the title, the page Markdown with the lesson link rules, and its References', async () => {
		const md = await alternateOf('/guides/tutor/');
		expect(
			md.startsWith(`# How to study with the tutor\n\n> Install the tutor.\n\nPage: ${ROOT}/guides/tutor/\n`),
		).toBe(true);
		expect(md).toContain(
			`The tutor reads [a lesson](${ROOT}/safety/agent-risk/) (How agents think, Agent Engineer Course). See [Install](${ROOT}/guides/tutor/#install).`,
		);
		expect(md).toContain('## Install\n\n```sh\necho (@AEC-02)\n```\n');
		expect(md.endsWith('## References\n\n- How agents think, Agent Engineer Course, https://example.com/aec\n')).toBe(
			true,
		);
		expect(md).not.toMatch(/<script|not-content|<[A-Z]/);
	});
	it('renders the contributing page the same way', async () => {
		const md = await alternateOf('/contributing/');
		expect(md).toContain(`# Contributing\n\n> Building the site.\n\nPage: ${ROOT}/contributing/\n`);
		expect(md).toContain(`Read [the guide](${ROOT}/guides/tutor/).`);
		expect(md).not.toContain('## References');
	});
});

describe('the About page alternate', () => {
	it('shows each figure as its number, and leaves out the comments and the topic map', async () => {
		const md = await alternateOf('/about/');
		expect(md).toContain(`# About this project\n\n> Why the project exists.\n\nPage: ${ROOT}/about/\n`);
		expect(md).toMatch(/The site has \d+ areas \(How agents think, Agent Engineer Course\)\./);
		expect(md).not.toMatch(/source:|How to update|\{\/\*|<[A-Z]|^import /m);
		expect(md).toContain('## References');
	});
});

describe('a glossary alternate', () => {
	it('has its prose and one heading per concept by name, each with its definition and topic page', async () => {
		const md = await alternateOf('/glossary/');
		expect(md).toContain('# Glossary\n\n> Every concept.\n');
		expect(md).toContain('Generated from the topic definitions.');
		expect(md).toContain(
			[
				'## Context window (context-window)',
				'',
				'What the model can see.',
				'',
				`Topic: [Models](${ROOT}/topics/concepts/models/)`,
				'',
				'## Risk (risk)',
				'',
				'What can go wrong.',
				'',
				`Topic: [Risk](${ROOT}/topics/safety/risk/)`,
				'',
				'## Token (token)',
			].join('\n'),
		);
		expect(md).not.toMatch(/<script|<dl|<Glossary|import /);
	});
});

describe('a topic page alternate', () => {
	it('has the sections the page shows, from the data tree, and no Your reference', async () => {
		const md = await alternateOf('/topics/safety/depth/');
		expect(md).toContain('# Depth\n\n> d\n');
		expect(md).toContain('*Safety* · topic `safety/depth`');
		for (const h of ['## Concepts', '## Links', '## Lessons', '## Sources']) expect(md).toContain(`${h}\n`);
		expect(md).toContain(`## Lessons\n\n- [Deeper](${ROOT}/safety/deeper/) (tutorial)\n`);
		expect(md).not.toMatch(/Your reference|<script|not-content/);
	});
});

describe('a competency page alternate', () => {
	it('has the course, the topics, each objective with its behaviors, and the References', async () => {
		const md = await alternateOf('/competencies/safety/judges-output/');
		expect(md).toContain('# Judges agent output\n\n> Competency safety/judges-output\n');
		expect(md).toContain(`**Taught in:** the [Safety](${ROOT}/safety/) course`);
		expect(md).toContain(`**Draws on:** [Risk](${ROOT}/topics/safety/risk/)`);
		expect(md).toContain('## Learning objectives\n\n### Checks before trusting (base)\n');
		expect(md).toContain(
			'| Reads the diff before `git push` (How agents think, Agent Engineer Course). | A wrong line ships otherwise (Taste, Brilliant). | Runs the tests once more (How agents think, Agent Engineer Course). |',
		);
		expect(
			md.endsWith(
				'## References\n\n- How agents think, Agent Engineer Course, https://example.com/aec\n- Taste, Brilliant\n',
			),
		).toBe(true);
		expect(md).not.toMatch(/<script|not-content|<table/);
	});
	it('has the alignment rows that name one of its objectives', async () => {
		const md = await alternateOf('/competencies/concepts/explains-models/');
		expect(md).toContain('## Alignment\n\n| Framework | Code | Asks | Objectives here |');
		expect(md).toContain('| AI Fluency 4D | Discernment | Judge the output | o1 |');
		expect(md).toContain(
			`Served by: [How a language model works](${ROOT}/concepts/how-models-work/), [Deeper](${ROOT}/safety/deeper/)\n`,
		);
		expect(md).not.toContain('## References');
	});
});
