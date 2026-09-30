import {
	alignmentRowsOf,
	type CompetencyPageData,
	competencyAlternate,
	glossaryEntries,
	glossaryMarkdown,
	type ObjectiveData,
	type TopicData,
	type TopicPageData,
	topicAlternate,
} from '@lib/reference-alternates';
import { describe, expect, it, vi } from 'vitest';

vi.mock('astro:content', async () => (await import('./content')).mockContent());

const site = 'https://schubergphilis.github.io';
const ROOT = 'https://schubergphilis.github.io/ai-training';

const bibliography = {
	K1: { type: 'course', title: 'One', container: 'Course', url: 'https://example.com/one' },
	K2: { type: 'reference', title: 'Two', container: null, url: null },
};

const topic: TopicData = {
	id: 'safety/risk',
	area: 'safety',
	name: 'Risk',
	definition: 'What can go wrong.',
	concepts: [{ id: 'blast-radius', name: 'Blast radius', definition: 'How far it reaches.' }],
	links: { prerequisites: ['concepts/models'], related: ['safety/injection'] },
	sources: ['K1', 'K2'],
};

const topicPage: TopicPageData = {
	topic,
	areaName: 'Safety',
	nameOf: (id) => ({ 'concepts/models': 'Models', 'safety/injection': 'Injection' })[id] ?? id,
	dependants: [],
	competencies: [{ id: 'safety/judges-output', statement: 'Judges agent output' }],
	lessons: [],
	bibliography,
};

describe('glossaryEntries and glossaryMarkdown', () => {
	it('sorts every concept by name and throws on a concept id used twice', () => {
		const other: TopicData = {
			...topic,
			id: 'x/y',
			name: 'Y',
			concepts: [{ id: 'a', name: 'Alpha', definition: 'A.' }],
		};
		expect(glossaryEntries([topic, other]).map((e) => e.id)).toEqual(['a', 'blast-radius']);
		expect(() => glossaryEntries([topic, { ...other, concepts: topic.concepts }])).toThrow(
			'Duplicate concept id blast-radius (in x/y)',
		);
	});
	it('keeps the concept id in each heading and links the topic page', () => {
		expect(glossaryMarkdown([topic], site)).toBe(
			`## Blast radius (blast-radius)\n\nHow far it reaches.\n\nTopic: [Risk](${ROOT}/topics/safety/risk/)`,
		);
	});
});

describe('topicAlternate', () => {
	it('renders the whole page, each section under its page heading', () => {
		expect(topicAlternate(topicPage, site)).toBe(
			[
				'# Risk',
				'',
				'> What can go wrong.',
				'',
				`Page: ${ROOT}/topics/safety/risk/`,
				'License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/',
				'',
				'*Safety* · topic `safety/risk`',
				'',
				'What can go wrong.',
				'',
				'## Concepts',
				'',
				`- **Blast radius**: How far it reaches. [glossary](${ROOT}/glossary/#blast-radius)`,
				'',
				'## Links',
				'',
				`- **Builds on:** [Models](${ROOT}/topics/concepts/models/)`,
				'- **Leads to:** nothing yet',
				`- **Related:** [Injection](${ROOT}/topics/safety/injection/)`,
				`- **Competencies drawing on it:** [Judges agent output](${ROOT}/competencies/safety/judges-output/)`,
				'',
				'## Lessons',
				'',
				'No lesson covers this topic yet.',
				'',
				'## Sources',
				'',
				'- `K1` [One](https://example.com/one), Course (course)',
				'- `K2` Two (reference)',
				'',
			].join('\n'),
		);
	});
	it('says so when nothing builds on it, no source is listed, and names an unknown source key', () => {
		const bare = topicAlternate(
			{
				...topicPage,
				topic: { ...topic, links: { prerequisites: [] }, sources: [] },
				competencies: [],
				dependants: [{ ...topic, id: 'safety/next', name: 'Next' }],
			},
			site,
		);
		expect(bare).toContain(`- **Builds on:** nothing\n- **Leads to:** [Next](${ROOT}/topics/safety/next/)\n\n`);
		expect(bare).not.toMatch(/Related|Competencies drawing/);
		expect(bare).toContain('## Sources\n\nOriginal material.\n');
		expect(topicAlternate({ ...topicPage, topic: { ...topic, sources: ['NOPE'] } }, site)).toContain(
			'- `NOPE` (unknown key)',
		);
	});
});

const competency: CompetencyPageData = {
	id: 'safety/judges-output',
	statement: 'Judges agent output',
	area: { slug: 'safety', name: 'Safety' },
	topics: [
		{ id: 'safety/risk', name: 'Risk' },
		{ id: 'concepts/models', name: 'Models' },
	],
	objectives: [
		{
			id: 'safety/judges-output/checks',
			statement: 'Checks before trusting',
			level: 'base',
			behaviors: [
				{ claim: 'Reads `a | b` (@K2).', why: 'See [risk](/topics/safety/risk/)\n(@K1).', example: 'Runs `(@K1)`.' },
			],
			servedBy: [{ id: 'safety/agent-risk', title: 'Why agent safety is different' }],
		},
		{ id: 'safety/judges-output/later', statement: 'Later', level: 'expert', behaviors: [], servedBy: [] },
	],
	alignment: [],
	bibliography,
};

describe('competencyAlternate', () => {
	it('renders the objectives as tables, cites in page order and lists the References', () => {
		const md = competencyAlternate(competency, site);
		expect(md).toContain(
			[
				'*Safety* · competency `safety/judges-output`',
				'',
				`**Taught in:** the [Safety](${ROOT}/safety/) course`,
				'',
				`**Draws on:** [Risk](${ROOT}/topics/safety/risk/), [Models](${ROOT}/topics/concepts/models/)`,
				'',
				'## Learning objectives',
				'',
				'### Checks before trusting (base)',
				'',
				'| Claim | Why | Example |',
				'| ----- | --- | ------- |',
				`| Reads \`a \\| b\` (Two). | See [risk](${ROOT}/topics/safety/risk/) (One, Course). | Runs \`(@K1)\`. |`,
				'',
				`Served by: [Why agent safety is different](${ROOT}/safety/agent-risk/)`,
				'',
				'### Later (expert)',
				'',
				'*Behaviors not written yet.*',
				'',
				'No lesson serves this objective yet.',
				'',
				'## References',
				'',
				'- Two',
				'- One, Course, https://example.com/one',
				'',
			].join('\n'),
		);
		expect(md).not.toContain('## Alignment');
	});
	it('has an alignment table with each row cut to its own objectives', () => {
		const alignment = alignmentRowsOf(
			[
				{
					framework: 'F',
					rows: [
						{ code: 'C1', asks: 'Ask one', objectives: ['safety/judges-output/checks', 'other/x/y'] },
						{ code: 'C2', asks: 'Ask two', objectives: ['other/x/y'] },
					],
				},
			],
			new Set(['safety/judges-output/checks', 'safety/judges-output/later']),
		);
		expect(alignment).toEqual([
			{ framework: 'F', code: 'C1', asks: 'Ask one', objectives: ['safety/judges-output/checks'] },
		]);
		expect(competencyAlternate({ ...competency, alignment }, site)).toContain(
			'## Alignment\n\n| Framework | Code | Asks | Objectives here |\n| --------- | ---- | ---- | --------------- |\n| F | C1 | Ask one | checks |\n\n## References',
		);
	});
	it('throws on an unknown citation key, as the page build does', () => {
		const bad = {
			...competency,
			objectives: [
				{ ...(competency.objectives[0] as ObjectiveData), behaviors: [{ claim: '(@NOPE)', why: '', example: '' }] },
			],
		};
		expect(() => competencyAlternate(bad, site)).toThrow(/NOPE/);
	});
});
