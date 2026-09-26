/**
 * A stand-in for `astro:content`. `getViteConfig` does not sync the content
 * layer, so `getCollection()` returns nothing under Vitest. A test that
 * needs lessons calls `vi.mock('astro:content', () => mockContent())` with
 * the fixtures below (or its own).
 */
import { vi } from 'vitest';

export interface DocFixture {
	id: string;
	body?: string;
	data: {
		title: string;
		mode?: 'tutorial' | 'explanation';
		assumes?: { objective: string; lesson: string; section: string }[];
		covers?: string;
		serves?: string[];
	};
}

export interface TopicFixture {
	id: string;
	data: {
		id: string;
		area: string;
		name: string;
		definition?: string;
		concepts: { id: string; name: string; definition: string }[];
		links: { prerequisites: string[] };
	};
}

export const docs: DocFixture[] = [
	{ id: 'index', data: { title: 'Home' } },
	{ id: 'concepts/index', data: { title: 'Concepts' } },
	{
		id: 'concepts/how-models-work',
		data: { title: 'How a language model works', mode: 'explanation', covers: 'concepts/models', serves: ['o1'] },
		body: `
<Choice id="what-the-model-does" objective="o1" title="What the model does" hint="h"
  concepts={['token', 'context-window']} context="The lesson shows a widget."
  options={[{ text: 'a', correct: true }, { text: 'b > c', why: 'No.' }]}>
Stem.
</Choice>
<Predict id="honor" objective="o1" title="Run it" hint="h" concepts={['token']}>
</Predict>
<Predict id="graded" objective="o1" title="Graded" hint="h" concepts={['token']} answer="1 > 0" run="x.sh" revision={2}>

What does this print?

\`\`\`python
print(1 > 0)
\`\`\`

</Predict>
<Predict id="shown" title="Shown" answer="2" run="y.py">

Run this and compare.

\`\`\`python
print(2)
\`\`\`

</Predict>
<Repair id="fix" objective="o1" title="Fix" hint="h" concepts={['token']} broken="a" model="b">
</Repair>
<Order id="opt-out" objective="o1" title="Order" hint="h" concepts={['token']} review={false} steps={['b', 'a']}>
</Order>

<Recap>

1. Tokens, **not** words (@AEC-02).
2. One token at a time, from a *distribution* the
   model scores. See \`temperature\`.

</Recap>
`,
	},
	{
		id: 'safety/agent-risk',
		data: {
			title: 'Why agent safety is different',
			mode: 'tutorial',
			assumes: [{ objective: 'o1', lesson: 'concepts/how-models-work', section: 's' }],
			covers: 'safety/injection',
			serves: [],
		},
		body: `
<Scenario id="s1" objective="o1" title="S" hint="h" concepts={['risk']} options={[]}>
</Scenario>
<Prompt model="illustrative" recorded="illustrative">
Summarize the memo.

- Keep every date.
- Add nothing.
</Prompt>
<Response>
**Title**

Body of the response.
</Response>
`,
	},
	{
		id: 'safety/deeper',
		data: {
			title: 'Deeper',
			mode: 'tutorial',
			covers: 'safety/depth',
			serves: [],
			assumes: [
				{ objective: 'o1', lesson: 'safety/agent-risk', section: 's' },
				{ objective: 'o1', lesson: 'concepts/how-models-work', section: 's' },
			],
		},
		body: `
## Going deeper

<Recap>
1. Go one level deeper.
</Recap>

<Habit id="go-one-level-deeper">
The next time you *review* a change, go one level deeper.
</Habit>
`,
	},
];

export const topics: TopicFixture[] = [
	{
		id: 'concepts/models',
		data: {
			id: 'concepts/models',
			area: 'concepts',
			name: 'Models',
			concepts: [
				{ id: 'token', name: 'Token', definition: 'A chunk of text.' },
				{ id: 'context-window', name: 'Context window', definition: 'What the model can see.' },
			],
			links: { prerequisites: [] },
		},
	},
	{
		id: 'safety/risk',
		data: {
			id: 'safety/risk',
			area: 'safety',
			name: 'Risk',
			concepts: [{ id: 'risk', name: 'Risk', definition: 'What can go wrong.' }],
			links: { prerequisites: ['concepts/models'] },
		},
	},
	// Covered by safety/agent-risk (its Prompt block is the canonical example); no plan entry names it.
	{
		id: 'safety/injection',
		data: { id: 'safety/injection', area: 'safety', name: 'Injection', concepts: [], links: { prerequisites: [] } },
	},
	// Covered by safety/deeper, which has no Prompt block and no checkpoints.
	{
		id: 'safety/depth',
		data: {
			id: 'safety/depth',
			area: 'safety',
			name: 'Depth',
			definition: 'd',
			concepts: [],
			links: { prerequisites: [] },
		},
	},
	// No lesson covers it and no plan entry names it: the topic map's gap state.
	{
		id: 'safety/governance',
		data: { id: 'safety/governance', area: 'safety', name: 'Governance', concepts: [], links: { prerequisites: [] } },
	},
];

/** The groups and areas (spec S09): the six real areas, so area-order assertions hold. */
export const groups = [
	{
		id: 'foundations',
		data: {
			id: 'foundations',
			order: 1,
			name: 'Foundations',
			audience: 'Everyone',
			description: 'For everyone.',
			areas: ['concepts', 'safety', 'using-agents'],
		},
	},
	{
		id: 'engineering',
		data: {
			id: 'engineering',
			order: 2,
			name: 'Engineering',
			audience: 'Software engineers',
			description: 'For engineers.',
			areas: ['coding-with-agents', 'customizing-agents', 'building-agents'],
		},
	},
];
const area = (id: string, name: string, group: string) => ({
	id: `${id}/area`,
	data: { id, name, group, description: `${name}.` },
});
export const areas = [
	area('concepts', 'Concepts', 'foundations'),
	area('safety', 'Safety', 'foundations'),
	area('using-agents', 'Using agents', 'foundations'),
	area('coding-with-agents', 'Coding with agents', 'engineering'),
	area('customizing-agents', 'Customizing agents', 'engineering'),
	area('building-agents', 'Building agents', 'engineering'),
];

export interface CourseFixture {
	id: string;
	data: {
		id: string;
		area: string;
		'plan-issue'?: number;
		notes?: string;
		lessons?: string[];
		parts?: { title: string; notes?: string; lessons: string[] }[];
	};
}

export interface LessonPlanFixture {
	id: string;
	data: {
		id: string;
		title: string;
		description?: string;
		mode: 'tutorial' | 'explanation';
		covers: string;
		serves: string[];
		introduces: string[];
		assumes: { objective: string; lesson?: string; section?: string }[];
		'extends-to': { label: string; href: string }[];
		'covered-by'?: { label: string; href: string };
		after: string[];
		shorts: string[];
		exercise?: { kind: 'do' | 'judge'; brief: string };
		exercises?: { kind: 'do' | 'judge'; brief: string }[];
		sources: string[];
		issue?: number;
		minutes: number;
		notes?: string;
	};
}

const plan = (over: Partial<LessonPlanFixture['data']> & { id: string; title: string }): LessonPlanFixture => ({
	id: over.id.replace('/', '/lessons/'),
	data: {
		mode: 'tutorial',
		covers: 'safety/risk',
		serves: [],
		introduces: [],
		assumes: [],
		'extends-to': [],
		after: [],
		shorts: [],
		exercise: { kind: 'do', brief: 'Do it.' },
		sources: [],
		minutes: 15,
		...over,
	},
});

/** Course plans matching `docs`, plus one planned lesson in safety. The safety course has parts. */
export const courses: CourseFixture[] = [
	{
		id: 'concepts/courses/concepts',
		data: { id: 'concepts', area: 'concepts', lessons: ['concepts/how-models-work'] },
	},
	{
		id: 'safety/courses/safety',
		data: {
			id: 'safety',
			area: 'safety',
			'plan-issue': 31,
			parts: [
				{ title: 'Risk', lessons: ['safety/agent-risk', 'safety/deeper'] },
				{ title: 'Later', notes: 'One planned lesson.', lessons: ['safety/coming'] },
			],
		},
	},
];

export const lessonPlans: LessonPlanFixture[] = [
	plan({
		id: 'concepts/how-models-work',
		title: 'How a language model works',
		mode: 'explanation',
		covers: 'concepts/models',
		serves: ['o1'],
		minutes: 20,
	}),
	plan({ id: 'safety/agent-risk', title: 'Why agent safety is different', serves: ['o1'], minutes: 20 }),
	plan({
		id: 'safety/deeper',
		title: 'Deeper',
		exercises: [
			{ kind: 'do', brief: 'A.' },
			{ kind: 'judge', brief: 'B.' },
		],
		exercise: undefined,
	}),
	// Serves an objective no live lesson serves: the competency map's "lesson coming" state.
	plan({
		id: 'safety/coming',
		title: 'Coming soon',
		issue: 42,
		after: ['safety/deeper'],
		serves: ['safety/spots-injection/names-risk'],
	}),
];

export const competencies = [
	{
		id: 'concepts/competencies/explains-models',
		data: {
			id: 'concepts/explains-models',
			area: 'concepts',
			statement: 'Explains what a model does',
			topics: ['concepts/models'],
			objectives: [{ id: 'o1', statement: 'Explains generation', level: 'base', behaviors: [] }],
		},
	},
	{
		id: 'safety/competencies/judges-output',
		data: {
			id: 'safety/judges-output',
			area: 'safety',
			statement: 'Judges agent output',
			topics: ['safety/risk'],
			objectives: [
				{
					id: 'o2',
					statement: 'Checks before trusting',
					level: 'base',
					behaviors: [
						{
							claim: 'Reads the diff before `git push` (@AEC-02).',
							why: 'A wrong line ships otherwise (@Brilliant TAS).',
							example: 'Runs the tests once more (@AEC-02).',
						},
					],
				},
			],
		},
	},
	// Draws on a topic from another area. One objective only the planned safety/coming serves ("lesson coming"),
	// and one no lesson serves ("no lesson planned"). It sorts before judges-output by course order, not by statement.
	{
		id: 'safety/competencies/spots-injection',
		data: {
			id: 'safety/spots-injection',
			area: 'safety',
			statement: 'Spots prompt injection',
			topics: ['safety/injection', 'concepts/models'],
			objectives: [
				{ id: 'safety/spots-injection/names-risk', statement: 'Names the risk', level: 'expert', behaviors: [] },
				{ id: 'safety/spots-injection/plans-defense', statement: 'Plans a defense', level: 'base', behaviors: [] },
			],
		},
	},
];

export const bibliography = [
	{
		id: 'AEC-02',
		data: {
			type: 'course',
			title: 'How agents think',
			container: 'Agent Engineer Course',
			author: 'A. Osmani',
			url: 'https://example.com/aec',
		},
	},
	{ id: 'Brilliant TAS', data: { type: 'reference', title: 'Taste', container: 'Brilliant', author: null, url: null } },
];

export const alignment = [
	{
		id: 'ai-fluency-4d',
		data: {
			id: 'ai-fluency-4d',
			framework: 'AI Fluency 4D',
			rows: [{ code: 'Discernment', asks: 'Judge the output', objectives: ['o1', 'other/x/y'] }],
		},
	},
];

export function mockContent(
	overrides: {
		docs?: DocFixture[];
		topics?: TopicFixture[];
		courses?: CourseFixture[];
		lessonPlans?: LessonPlanFixture[];
	} = {},
) {
	const collections: Record<string, unknown[]> = {
		// The docs schema defaults `serves` to [], so the fixture does too.
		docs: (overrides.docs ?? docs).map((d) => ({ ...d, data: { serves: [], ...d.data } })),
		topics: overrides.topics ?? topics,
		courses: overrides.courses ?? courses,
		lessonPlans: overrides.lessonPlans ?? lessonPlans,
		groups,
		areas,
		competencies,
		alignment,
		bibliography,
	};
	return {
		getCollection: vi.fn(async (name: string) => collections[name] ?? []),
	};
}
