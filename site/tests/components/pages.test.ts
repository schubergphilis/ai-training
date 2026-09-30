/**
 * Renders the page-level components that read the content collections
 * (CourseGraph, CoursePlan, TopicMap, CompetencyMap, Settings, OverallProgress, CompetencyObjectives, ReviewIntro) against the fixture lessons in
 * tests/lib/content.ts. What the client scripts draw on top is covered by
 * the e2e suite; these tests check the server-rendered frame the scripts
 * bind to.
 */
import CompetencyCourse from '@components/CompetencyCourse.astro';
import CompetencyMap from '@components/CompetencyMap.astro';
import CompetencyObjectives from '@components/CompetencyObjectives.astro';
import CourseGraph from '@components/CourseGraph.astro';
import CoursePlan from '@components/CoursePlan.astro';
import LearnersReference from '@components/LearnersReference.astro';
import OverallProgress from '@components/OverallProgress.astro';
import References from '@components/References.astro';
import ReviewIntro from '@components/ReviewIntro.astro';
import Settings from '@components/Settings.astro';
import TopicMap from '@components/TopicMap.astro';
import TopicReference from '@components/TopicReference.astro';
import { areaOf, getAreas } from '@lib/areas';
import { createCitations, renderObjectives } from '@lib/citations';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bibliography, competencies } from '../lib/content';

vi.mock('astro:content', async () => (await import('../lib/content')).mockContent());

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

describe('CourseGraph', () => {
	it('renders one node per lesson, the edges from assumes, and the course facts', async () => {
		const html = await container.renderToString(CourseGraph, { props: { area: 'safety' } });
		expect(html).toContain('data-course="safety"');
		expect(html).toContain('data-node="safety/agent-risk"');
		expect(html).toContain('data-node="safety/deeper"');
		expect(html).not.toContain('data-node="concepts/how-models-work"');
		// deeper assumes agent-risk within the course; the cross-course edge is dropped.
		// The planned lesson's edge comes from its `after` in the plan.
		const edges = JSON.parse(/data-edges>([^<]*)</.exec(html)?.[1] ?? '[]');
		expect(edges).toEqual([
			{ from: 'safety/agent-risk', to: 'safety/deeper' },
			{ from: 'safety/deeper', to: 'safety/coming' },
		]);
		expect(html).toContain('2 lessons, 1 checkpoint, 1 more coming');
		expect(html).toContain('href="/ai-training/safety/review/"');
		expect(html).toContain('Review: nothing due yet');
	});
	it('renders a planned lesson as a coming node without a link, outside the progress node list', async () => {
		const html = await container.renderToString(CourseGraph, { props: { area: 'safety' } });
		expect(html).toMatch(/<span class="course-node" data-node="safety\/coming" data-state="coming"/);
		expect(html).not.toContain('href="/ai-training/safety/coming/"');
		expect(html).toContain('Coming soon');
		const nodes = JSON.parse(/data-nodes="([^"]*)"/.exec(html)?.[1]?.replace(/&quot;/g, '"') ?? '[]');
		expect(nodes.map((n: { id: string }) => n.id)).toEqual(['safety/agent-risk', 'safety/deeper']);
	});
	it('rejects an area without a course file', async () => {
		await expect(container.renderToString(CourseGraph, { props: { area: 'using-agents' } })).rejects.toThrow(
			/No course plan/,
		);
	});
	it('lists competencies as goals and prerequisites from other areas', async () => {
		const html = await container.renderToString(CourseGraph, { props: { area: 'concepts' } });
		expect(html).toContain('Explains what a model does');
		expect(html).toContain('href="/ai-training/competencies/concepts/explains-models/"');
		expect(html).toContain('Nothing; start here.');
		expect(html).toContain('1 lesson, 5 checkpoints');
	});
	it('rejects an unknown area', async () => {
		await expect(container.renderToString(CourseGraph, { props: { area: 'nope' } })).rejects.toThrow(/Unknown area/);
	});
});

describe('CompetencyObjectives and References', () => {
	const bib = Object.fromEntries(bibliography.map((e) => [e.id, e.data]));
	const objectivesOf = (id: string) => competencies.find((c) => c.data.id === id)?.data.objectives ?? [];
	it('renders citations in behaviors as numbered links and code spans as code, with no raw token', async () => {
		const citations = createCitations(bib, 'test');
		const objectives = renderObjectives(objectivesOf('safety/judges-output'), citations);
		const html = await container.renderToString(CompetencyObjectives, { props: { objectives } });
		expect(html).not.toContain('(@');
		expect(html).toContain(
			'Reads the diff before <code>git push</code> <a class="citation" data-key="AEC-02" href="#ref-1" title="AEC-02">[1]</a>.',
		);
		expect(html).toContain('href="#ref-2" title="Brilliant TAS">[2]</a>');
		// The list is the page's, rendered after Alignment, so the component emits no h2 of its own.
		expect(html).not.toContain('<h2');
	});
	it('renders the References list with the lesson-page markup and entry format', async () => {
		const citations = createCitations(bib, 'test');
		renderObjectives(objectivesOf('safety/judges-output'), citations);
		const html = await container.renderToString(References, { props: { references: citations.references() } });
		expect(html).toContain('<h2 id="references">References</h2>');
		expect(html).toContain('<ol class="references">');
		expect(html).toContain(
			'<li id="ref-1">A. Osmani. <a href="https://example.com/aec"><em>How agents think</em></a>.',
		);
		expect(html).toContain('Agent Engineer Course. Course. <code>AEC-02</code>');
		expect(html).toContain('<li id="ref-2"><em>Taste</em>. Brilliant. Reference. <code>Brilliant TAS</code>');
		expect(html.match(/<li id="ref-/g)).toHaveLength(2);
	});
	it('renders no References section when nothing cites', async () => {
		const citations = createCitations(bib, 'test');
		const objectives = renderObjectives(objectivesOf('concepts/explains-models'), citations);
		const html = await container.renderToString(CompetencyObjectives, { props: { objectives } });
		expect(html).toContain('Behaviors not written yet.');
		const refs = await container.renderToString(References, { props: { references: citations.references() } });
		expect(refs.trim()).toBe('');
	});
});

describe('TopicMap', () => {
	it('renders every topic in its area column with lesson coverage and prerequisite edges', async () => {
		const html = await container.renderToString(TopicMap, {});
		expect(html).toContain('data-topic="concepts/models"');
		// A topic without a live lesson is not started, like any other: the map has no planned or gap state.
		expect(html).toContain('data-topic="safety/governance" data-state="untouched"');
		expect(html).not.toContain('data-has-lesson');
		expect(html).not.toContain('data-planned');
		expect(html).toContain('<span data-k="untouched">not started</span>');
		expect(html).not.toContain('solid line');
		expect(html).toContain('href="/ai-training/topics/safety/risk/"');
		const edges = JSON.parse(/data-edges>([^<]*)</.exec(html)?.[1] ?? '[]');
		expect(edges).toEqual([{ from: 'concepts/models', to: 'safety/risk', cross: true }]);
		expect(html.match(/class="topic-col-title"/g)).toHaveLength(6);
	});
});

describe('CompetencyMap', () => {
	const box = (html: string, id: string) =>
		new RegExp(`<div class="competency-node" data-competency="${id}"[\\s\\S]*?</ul>([\\s\\S]*?)</div>`).exec(html);
	it('heads each area column with a link to its course and links each box and objective', async () => {
		const html = await container.renderToString(CompetencyMap, {});
		expect(html).toContain('class="not-content"');
		expect(html.match(/class="topic-col-title"/g)).toHaveLength(6);
		expect(html).toContain('<p class="topic-col-title"><a href="/ai-training/safety/">Safety</a></p>');
		expect(html).toContain(
			'<p class="topic-col-title"><a href="/ai-training/building-agents/">Building agents</a></p>',
		);
		expect(html).toContain(
			'<a class="competency-title" href="/ai-training/competencies/concepts/explains-models/">Explains what a model does</a>',
		);
		expect(html).toMatch(
			/<a class="competency-objective" href="\/ai-training\/competencies\/safety\/spots-injection\/#names-risk" data-objective="safety\/spots-injection\/names-risk"[^>]*>Names the risk <span class="competency-level">expert<\/span><\/a>/,
		);
		expect(html).toMatch(
			/href="\/ai-training\/competencies\/concepts\/explains-models\/#o1"[^>]*>Explains generation <span class="competency-level">base<\/span>/,
		);
	});
	it('orders a column by the course plan, before the statement', async () => {
		const html = await container.renderToString(CompetencyMap, {});
		// safety/coming serves spots-injection; no plan entry serves judges-output, so it goes last though it sorts first.
		expect(html.indexOf('data-competency="safety/spots-injection"')).toBeGreaterThan(0);
		expect(html.indexOf('data-competency="safety/spots-injection"')).toBeLessThan(
			html.indexOf('data-competency="safety/judges-output"'),
		);
	});
	it('names the topics from other areas only for a competency that draws on them', async () => {
		const html = await container.renderToString(CompetencyMap, {});
		expect(box(html, 'safety/spots-injection')?.[1]).toContain(
			'Draws on topics from other areas: <a href="/ai-training/topics/concepts/models/">Models</a>',
		);
		expect(box(html, 'safety/judges-output')?.[1]).not.toContain('Draws on');
		expect(box(html, 'concepts/explains-models')?.[1]).not.toContain('Draws on');
	});
	it('starts every box and objective as not started, with or without a lesson', async () => {
		const html = await container.renderToString(CompetencyMap, {});
		expect(html).toMatch(/data-objective="o1" data-state="untouched">/);
		// Nothing serves plans-defense, and it is not started like o1: the map has no planned or gap state.
		expect(html).toMatch(/data-objective="safety\/spots-injection\/plans-defense" data-state="untouched">/);
		expect(html).toMatch(/data-competency="safety\/judges-output" data-state="untouched">/);
		expect(html).not.toContain('data-has-lesson');
		expect(html).not.toContain('data-planned');
		expect(html).toContain('<span data-k="untouched">not started</span>');
		expect(html).not.toContain('solid line');
		const coverage = JSON.parse(/data-coverage="([^"]*)"/.exec(html)?.[1]?.replace(/&quot;/g, '"') ?? '[]');
		expect(coverage).toContainEqual({
			id: 'concepts/explains-models',
			objectives: [{ id: 'o1', lessons: ['concepts/how-models-work'] }],
		});
	});
});

describe('Competency page', () => {
	// The page renders CompetencyCourse with the area of the competency; StarlightPage needs the real
	// sidebar, so the test renders the component the page uses.
	const courseLine = async (id: string) => {
		const competency = competencies.find((c) => c.data.id === id)?.data;
		if (!competency) throw new Error(`no fixture competency ${id}`);
		const area = areaOf(await getAreas(), competency.area);
		return container.renderToString(CompetencyCourse, { props: { area } });
	};
	it('names the course that teaches the competency and links to its course page (#514)', async () => {
		expect(await courseLine('safety/spots-injection')).toContain(
			'<p data-competency-course><strong>Taught in:</strong> the <a href="/ai-training/safety/">Safety</a> course</p>',
		);
		expect(await courseLine('concepts/explains-models')).toContain(
			'<strong>Taught in:</strong> the <a href="/ai-training/concepts/">Concepts</a> course',
		);
	});
});

describe('ReviewIntro', () => {
	// The review page renders ReviewIntro; StarlightPage needs the real sidebar, so the test renders the component.
	const intro = async (area: string) => {
		const html = await container.renderToString(ReviewIntro, { props: { area } });
		return html
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	};
	it('separates the format names and keeps the spaces around the bold words (#517)', async () => {
		const text = await intro('concepts');
		const formats = /answer formats: ([^.]*)\./.exec(text)?.[1] ?? '';
		// The fixture's concepts lessons ask two or more kinds, whatever they are.
		const names = formats.split(', ');
		expect(names.length).toBeGreaterThanOrEqual(2);
		for (const name of names) expect(name).toMatch(/^[a-z-]+$/);
		expect(text).toContain('intervals. This course asks them');
		expect(text).toContain('. Hint gives a nudge. Give up shows the answer');
	});
	it('says so when the course has nothing to ask', async () => {
		expect(await intro('using-agents')).toContain('This course has no items to ask yet. Hint gives a nudge.');
	});
});

describe('Settings', () => {
	it('renders the comfort buttons and embeds the catalog for the schedule', async () => {
		const html = await container.renderToString(Settings, {});
		expect(html).toContain('data-comfort="less"');
		expect(html).toContain('data-comfort="more"');
		expect(html).toContain('data-schedule');
		const catalog = JSON.parse(/data-catalog="([^"]*)"/.exec(html)?.[1]?.replace(/&quot;/g, '"') ?? '[]');
		expect(catalog.map((c: { area: string }) => c.area)).toContain('safety');
		expect(catalog[0].lessons[0].checkpoints[0].title).toBe('What the model does');
	});
});

describe('OverallProgress', () => {
	it('renders the bar, the hidden due-lines list and the continue link inside a not-content container', async () => {
		const html = await container.renderToString(OverallProgress, { props: { landing: true } });
		expect(html).toMatch(/<div class="not-content overall[^"]*" data-overall data-landing="true"/);
		expect(html).toMatch(/<ul class="overall-due[^"]*" data-due-lines hidden><\/ul>/);
		expect(html).toContain('href="/ai-training/concepts/how-models-work/"');
		expect(html).toContain('href="/ai-training/map/"');
		expect(html).not.toContain('data-text');
	});
	it('renders the summary line on the progress page layout', async () => {
		const html = await container.renderToString(OverallProgress, {});
		expect(html).toContain('data-text');
		expect(html).not.toContain('href="/ai-training/map/"');
	});
});

describe('TopicReference', () => {
	it('renders, hidden, the takeaways and the canonical example of every covering lesson', async () => {
		const html = await container.renderToString(TopicReference, { props: { topicId: 'concepts/models' } });
		expect(html).toContain('data-reference="concepts/models"');
		expect(html).toMatch(
			/<section class="reference-lesson" data-reference-lesson="concepts\/how-models-work" data-unlocked="false"/,
		);
		expect(html).toContain(
			'Unlocks when you finish <a href="/ai-training/concepts/how-models-work/">How a language model works</a>.',
		);
		expect(html).toContain('<div class="reference-body" data-reference-body hidden>');
		expect(html).toContain('<li>Tokens, <strong>not</strong> words.</li>');
		// The first Predict (the honor one) is the canonical example: it has no body and no answer.
		expect(html).toContain('href="/ai-training/concepts/how-models-work/#honor"');
		expect(html).not.toContain('reference-answer');
	});
	it('renders a prompt and its response, and says when no lesson covers the topic', async () => {
		const html = await container.renderToString(TopicReference, { props: { topicId: 'safety/injection' } });
		expect(html).toContain('data-reference-lesson="safety/agent-risk"');
		// The Prompt and Response components themselves, so the caption matches the lesson page.
		expect(html).toContain('<figure class="prompt-block" data-illustrative="true">');
		expect(html).toContain('Prompt (illustrative, not a recorded transcript)');
		expect(html).toContain('<ul><li>Keep every date.</li><li>Add nothing.</li></ul>');
		expect(html).toContain('<figure class="response-block"><figcaption>Response</figcaption>');
		expect(html).toContain('This lesson has no recap takeaways yet.');
		// safety/deeper covers nothing, and safety/risk has only a planned lesson.
		expect(html).not.toContain('data-reference-lesson="safety/deeper"');
		const none = await container.renderToString(TopicReference, { props: { topicId: 'safety/risk' } });
		expect(none).toContain('No lesson covers this topic yet');
	});
});

describe('LearnersReference', () => {
	it("embeds the catalog with each lesson's topics and renders the empty state hidden", async () => {
		const html = await container.renderToString(LearnersReference, {});
		expect(html).toContain('class="not-content learners-reference"');
		expect(html).toContain('data-reference-empty hidden');
		expect(html).toContain('href="/ai-training/progress/"');
		const catalog = JSON.parse(/data-catalog="([^"]*)"/.exec(html)?.[1]?.replace(/&quot;/g, '"') ?? '[]');
		expect(catalog.map((c: { area: string }) => c.area)).toHaveLength(6);
		expect(catalog[0].lessons[0]).toEqual({
			id: 'concepts/how-models-work',
			title: 'How a language model works',
			topics: [{ id: 'concepts/models', name: 'Models' }],
		});
	});
});

describe('CoursePlan', () => {
	it('renders one row per lesson in course order, a heading row per part, folded under a counted summary', async () => {
		const html = await container.renderToString(CoursePlan, { props: { area: 'safety' } });
		expect(html).toMatch(/<details class="course-plan not-content" data-course-plan="safety"/);
		expect(html).toContain('<summary>Lesson plan (3 lessons, 2 live)</summary>');
		const rows = [...html.matchAll(/data-plan-entry="([^"]+)"/g)].map((m) => m[1]);
		expect(rows).toEqual(['safety/agent-risk', 'safety/deeper', 'safety/coming']);
		const parts = [...html.matchAll(/data-plan-part="([^"]+)"/g)].map((m) => m[1]);
		expect(parts).toEqual(['Risk', 'Later']);
		expect(html).toContain('<td>tutorial</td>');
		expect(html).toContain('<td>do, judge</td>');
		// A flat course has no part rows.
		const flat = await container.renderToString(CoursePlan, { props: { area: 'concepts' } });
		expect(flat).not.toContain('data-plan-part');
	});
	it('links a live row to its page and leaves a planned row as text', async () => {
		const html = await container.renderToString(CoursePlan, { props: { area: 'safety' } });
		expect(html).toContain('<a href="/ai-training/safety/agent-risk/">Why agent safety is different</a>');
		expect(html).toContain('<small class="course-plan-id">safety/agent-risk</small>');
		expect(html).not.toContain('href="/ai-training/safety/coming/"');
		expect(html).toMatch(/data-plan-entry="safety\/coming" data-status="planned"/);
		expect(html).toContain('Coming soon');
	});
	it('links covers to the topic, serves to the competency anchor, and shows the issue and after titles', async () => {
		const html = await container.renderToString(CoursePlan, { props: { area: 'safety' } });
		expect(html).toContain('<a href="/ai-training/topics/safety/risk/" title="safety/risk">risk</a>');
		expect(html).toContain(
			'<a class="course-plan-objective" href="/ai-training/competencies/concepts/explains-models/#o1" title="o1">o1</a>',
		);
		expect(html).toContain('<a href="https://github.com/schubergphilis/ai-training/issues/42">#42</a>');
		expect(html.match(/github\.com\/schubergphilis\/ai-training\/issues\//g)).toHaveLength(1);
		expect(html).toContain('<td>Deeper</td>');
	});
	it("shows a live lesson's estimate from its page and a planned lesson's target, each labeled", async () => {
		const html = await container.renderToString(CoursePlan, { props: { area: 'safety' } });
		// safety/agent-risk has a 20-minute target, and its short fixture page rounds to 5 minutes.
		const row = (id: string) =>
			new RegExp(`data-plan-entry="${id.replace('/', '\\/')}"[\\s\\S]*?</tr>`).exec(html)?.[0] ?? '';
		expect(row('safety/agent-risk')).toContain(
			'<td data-minutes="estimate">5 <small class="course-plan-minutes">estimate</small></td>',
		);
		expect(row('safety/coming')).toContain(
			'<td data-minutes="target">15 <small class="course-plan-minutes">target</small></td>',
		);
	});
	it('rejects an area without a course file', async () => {
		await expect(container.renderToString(CoursePlan, { props: { area: 'using-agents' } })).rejects.toThrow(
			/No course plan/,
		);
	});
});
