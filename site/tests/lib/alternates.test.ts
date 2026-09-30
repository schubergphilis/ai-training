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
	it('lists each course page with a page and each live lesson, and no other page', async () => {
		expect((await alternateSources()).map((s) => s.path)).toEqual([
			'/safety/',
			'/concepts/how-models-work/',
			'/safety/agent-risk/',
			'/safety/deeper/',
		]);
		expect(await alternatePaths()).toEqual(
			new Set(['/safety/', '/concepts/how-models-work/', '/safety/agent-risk/', '/safety/deeper/']),
		);
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
