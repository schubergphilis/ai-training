import { type DocFixture, docs } from './content';

/**
 * A lesson with one checkpoint of each kind that shows a stem, a widget, an ungraded example, a hidden
 * review alternate and a citation. Every hint, `why` and answer holds a word no other text has, so the
 * test can see that none of them reaches the alternate.
 */
const lessonBody = `import { Choice, MultiChoice } from '@components/lesson';
import Sampler from '@components/widgets/Sampler.astro';

Tokens, as the course says (@AEC-02). See [the recap](#recap) and [safety](/safety/).

<Sampler />

<Choice id="c1" objective="o1" title="Pick one" hint="HINTWORD" concepts={['token']}
  options={[{ text: 'Right one', correct: true, why: 'WHYWORD' }, { text: 'Wrong one', why: 'WHYWORD' }]}>
Stem of the choice?
</Choice>

<Choice id="c1r" phase="review" objective="o1" title="Hidden" hint="HINTWORD" concepts={['token']}
  options={[{ text: 'Hidden right', correct: true }]}>
Stem of the hidden alternate (@Brilliant TAS)?
</Choice>

<MultiChoice id="m1" objective="o1" title="Pick two" hint="HINTWORD" concepts={['token']}
  options={[{ text: 'A', correct: true }, { text: 'B', correct: true }, { text: 'C' }]}>
Stem of the multi-choice?
</MultiChoice>

<Match id="ma" objective="o1" title="Match them" hint="HINTWORD" concepts={['token']}
  options={['Opt one', 'Opt two']} rows={[{ statement: 'Row one', option: 1 }, { statement: 'Row two', option: 0 }]}>
Stem of the match?
</Match>

<Order id="or" objective="o1" title="Order them" hint="HINTWORD" concepts={['token']} steps={['zeta', '\`cat\` beta', 'alpha']}>
Stem of the order?
</Order>

<Sort id="so" objective="o1" title="Sort them" hint="HINTWORD" concepts={['token']}
  buckets={['Keep', 'Drop']} items={[{ text: 'Item x', bucket: 1 }, { text: 'Item y', bucket: 0 }]}>
Stem of the sort?
</Sort>

<Repair id="re" objective="o1" title="Fix it" hint="HINTWORD" concepts={['token']} broken="bad [x](/y/) text" model="ANSWERWORD">
Stem of the repair?
</Repair>

<Predict id="pr" objective="o1" title="Guess it" hint="HINTWORD" concepts={['token']} answer="ANSWERWORD" run="x.py">
Stem of the predict?
</Predict>

<Predict id="ex" title="Shown" answer="42" run="y.py">
Run this.
</Predict>

<Habit id="read-first">
Read it first.
</Habit>
`;

const lesson: DocFixture = {
	id: 'concepts/how-models-work',
	data: {
		title: 'How a language model works',
		description: 'What a model does.',
		mode: 'explanation',
		covers: 'concepts/models',
		serves: ['o1'],
	},
	body: lessonBody,
};
const coursePage: DocFixture = {
	id: 'safety',
	data: { title: 'Safety', description: 'Using AI safely.' },
	body: 'import CoursePlan from \'@components/CoursePlan.astro\';\n\nThe course prose.\n\n<CourseGraph area="safety" />\n\n<CoursePlan area="safety" />\n',
};
const agentRisk = { ...(docs.find((d) => d.id === 'safety/agent-risk') as DocFixture) };
agentRisk.data = { ...agentRisk.data, description: 'What changes.' };
const deeper = { ...(docs.find((d) => d.id === 'safety/deeper') as DocFixture) };
// Serves o1 too, so two lessons share one objective on the explains-models competency alternate.
deeper.data = { ...deeper.data, description: 'Go deeper.', serves: ['o1'] };

/** A guide with a root-relative link, a fragment link, a citation and a fenced block whose token stays as written. */
const guide: DocFixture = {
	id: 'guides/tutor',
	data: { title: 'How to study with the tutor', description: 'Install the tutor.' },
	body: 'The tutor reads [a lesson](/safety/agent-risk/) (@AEC-02). See [Install](#install).\n\n## Install\n\n```sh\necho (@AEC-02)\n```\n',
};
const contributing: DocFixture = {
	id: 'contributing',
	data: { title: 'Contributing', description: 'Building the site.' },
	body: 'Read [the guide](/guides/tutor/).\n',
};
const glossary: DocFixture = {
	id: 'glossary',
	data: { title: 'Glossary', description: 'Every concept.' },
	body: "import Glossary from '@components/Glossary.astro';\n\nGenerated from the topic definitions.\n\n<Glossary />\n",
};
/** The About page (#762): a source comment, a figure, the topic map and a citation. */
const about: DocFixture = {
	id: 'about',
	data: { title: 'About this project', description: 'Why the project exists.' },
	body: "import AboutFigure from '@components/AboutFigure.astro';\nimport TopicMap from '@components/TopicMap.astro';\n\n{/* source: groups.yaml */}\n\nThe site has <AboutFigure of=\"areas\" /> areas (@AEC-02).\n\n<TopicMap />\n",
};
/** A docs page that S12 gives no alternate. */
const progress: DocFixture = {
	id: 'progress',
	data: { title: 'Your progress', description: 'What you finished.' },
	body: "import OverallProgress from '@components/OverallProgress.astro';\n\n<OverallProgress />\n",
};

/**
 * The docs of the alternate tests: the lesson above, a course page, the two safety lessons of `content.ts`,
 * a guide, the contributing page, the About page, the glossary, and the progress page, which has no alternate.
 */
export const alternateDocs: DocFixture[] = [
	lesson,
	coursePage,
	agentRisk,
	deeper,
	guide,
	contributing,
	about,
	glossary,
	progress,
];
