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
deeper.data = { ...deeper.data, description: 'Go deeper.' };

/** The docs of the alternate tests: the lesson above, a course page, and the two safety lessons of `content.ts`. */
export const alternateDocs: DocFixture[] = [lesson, coursePage, agentRisk, deeper];
