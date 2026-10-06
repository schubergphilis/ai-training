import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { allLessons, allTopics, courseLessonIds, readAreaTree, yamlFilesIn } from '../../scripts/lib/area-tree.mjs';
import {
	checkBehaviorCitations,
	checkBehaviorMarkdown,
	checkData,
	checkLessonTimes,
	checkSourceHrefs,
	FOUNDATIONS_EXEMPT,
	foundationsSurfaces,
	frontmatter,
	knownIds,
	lessonPages,
	propCitationMessage,
	propCitations,
	reportData,
	reviewDatePairError,
} from '../../scripts/lib/data.mjs';

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
}, 30000); // Deletes one temp tree per tree() call, which took over 10 s on a busy machine (#555).

const GROUPS = '- id: g\n  order: 1\n  name: G\n  audience: Everyone\n  description: d\n  areas: [a]\n';
const AREA = 'id: a\nname: A\ngroup: g\ndescription: d\n';
const TOPIC =
	'id: a/t\narea: a\nname: T\ndefinition: d\nconcepts:\n  - {id: c1, name: C1, definition: d}\n  - {id: c2, name: C2, definition: d}\nlinks: {prerequisites: [], related: [], specializations: []}\n';
const COMPETENCY =
	'id: a/c\narea: a\nstatement: s\ntopics: [a/t]\nobjectives:\n  - id: a/c/o\n    statement: s\n    level: base\n';
const ALIGNMENT = 'id: fw\nframework: FW\nrows:\n  - code: X\n    asks: y\n    objectives: [a/c/o]\n';
const COURSE = 'id: a\narea: a\nlessons: [a/x, a/p]\n';
const LIVE =
	'id: a/x\ntitle: X\ndescription: d\nmode: tutorial\ncovers: a/t\nserves: [a/c/o]\nintroduces: [c1]\nassumes:\n  - {objective: a/c/o, lesson: a/p, section: s}\nexercise: {kind: do, brief: b}\nsources: [AEC-01]\nminutes: 10\n';
const PLANNED =
	'id: a/p\ntitle: P\nmode: explanation\ncovers: a/t\nintroduces: [c2]\nassumes: [{objective: a/c/o}]\nafter: [a/x]\nexercise: {kind: judge, brief: b}\nminutes: 10\n';
const BIB = 'AEC-01:\n  type: course\n  title: t\n';
const PAGE = 'Body.\n';

/** A temp tree with one group, area, topic, competency, course, a live lesson `a/x` and a planned `a/p`. */
function tree(files: Record<string, string | null> = {}) {
	const root = mkdtempSync(join(tmpdir(), 'data-'));
	roots.push(root);
	const all: Record<string, string | null> = {
		'data/groups.yaml': GROUPS,
		'data/bibliography.yaml': BIB,
		'data/alignment/fw.yaml': ALIGNMENT,
		'data/areas/a/area.yaml': AREA,
		'data/areas/a/topics/t.yaml': TOPIC,
		'data/areas/a/competencies/c.yaml': COMPETENCY,
		'data/areas/a/courses/a.yaml': COURSE,
		'data/areas/a/lessons/x.yaml': LIVE,
		'data/areas/a/lessons/p.yaml': PLANNED,
		'content/a/x.mdx': PAGE,
		'content/a/index.mdx': 'Course intro.\n',
		'content/guides/other.mdx': '---\ntitle: Not a lesson\n---\n',
		...files,
	};
	for (const [rel, body] of Object.entries(all)) {
		if (body === null) continue;
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), body);
	}
	return root;
}

/** The repo's exemption list names real lessons, so the fixture tree runs with its own (empty by default). */
const check = (root: string, foundationsExempt = new Map<string, number>()) =>
	checkData(join(root, 'data'), join(root, 'content'), { foundationsExempt, examplesDir: join(root, 'examples') });

describe('checkData', () => {
	it('passes a consistent tree and counts lessons and pages', () => {
		expect(check(tree())).toEqual({ errors: [], warnings: [], lessons: 2, pages: 1 });
	});
	it('reports a missing areas directory', () => {
		const root = tree();
		rmSync(join(root, 'data/areas'), { recursive: true });
		expect(check(root).errors[0]).toMatch(/does not exist/);
	});
	it('reports groups and areas that disagree', () => {
		const twice = check(
			tree({
				'data/groups.yaml': `${GROUPS.replace('[a]', '[a, a, b]')}- id: h\n  order: 1\n  name: H\n  areas: []\n`,
			}),
		).errors;
		expect(twice).toContain('src/data/groups.yaml: area a is listed twice');
		expect(twice).toContain('src/data/groups.yaml: group h has the same order as another group');
		expect(twice).toContain('src/data/groups.yaml: area b has no src/data/areas/b/');
		const { errors } = check(
			tree({ 'data/areas/a/area.yaml': AREA.replace('id: a', 'id: z').replace('group: g', 'group: h') }),
		);
		expect(errors).toContain('src/data/areas/a/area.yaml: id is "z", expected a (the directory)');
		expect(errors).toContain('src/data/areas/a/area.yaml: group is "h", but groups.yaml lists it under g');
		const orphan = check(tree({ 'data/groups.yaml': '[]\n' })).errors;
		expect(orphan).toContain('src/data/areas/a/area.yaml: no group in src/data/groups.yaml lists a');
		expect(check(tree({ 'data/areas/a/area.yaml': null })).errors).toContain('src/data/areas/a/area.yaml: missing');
	});
	it('reports a topic, competency or alignment file whose ids or references are off', () => {
		const { errors } = check(
			tree({
				'data/areas/a/topics/t.yaml': TOPIC.replace('id: a/t', 'id: a/u').replace('area: a', 'area: b'),
				'data/areas/a/topics/t2.yaml': TOPIC.replace('id: a/t', 'id: a/t2').replace('name: T', 'name: T2'),
				'data/areas/a/competencies/c.yaml': COMPETENCY.replace('id: a/c\n', 'id: a/d\n')
					.replace('area: a', 'area: b')
					.replace('topics: [a/t]', 'topics: [a/nope]'),
				'data/alignment/fw.yaml': ALIGNMENT.replace('id: fw', 'id: other').replace('[a/c/o]', '[a/c/o, a/c/nope]'),
			}),
		);
		expect(errors).toContain('src/data/areas/a/topics/t.yaml: id is "a/u", expected a/t');
		expect(errors).toContain('src/data/areas/a/topics/t.yaml: area is "b", expected a');
		expect(errors).toContain('src/data/areas/a/topics/t2.yaml: concept c1 is also defined in a/u');
		expect(errors).toContain('src/data/areas/a/competencies/c.yaml: id is "a/d", expected a/c');
		expect(errors).toContain('src/data/areas/a/competencies/c.yaml: area is "b", expected a');
		expect(errors).toContain('src/data/areas/a/competencies/c.yaml: topics "a/nope" is not a topic id');
		expect(errors).toContain('src/data/areas/a/competencies/c.yaml: objective "a/c/o" is not under a/d/');
		expect(errors).toContain('src/data/alignment/fw.yaml: id is "other", expected fw (the file name)');
		expect(errors).toContain('src/data/alignment/fw.yaml X: objective "a/c/nope" is not an objective id');
	});
	it("reports a course that is not the area's, lists an unknown lesson, or lists one twice, and a lesson in no course", () => {
		const { errors } = check(
			tree({
				'data/areas/a/courses/a.yaml':
					'id: b\narea: b\nparts:\n  - title: One\n    lessons: [a/x, a/nope]\n  - title: Two\n    lessons: [a/x]\n',
			}),
		);
		expect(errors).toContain('src/data/areas/a/courses/a.yaml: id is "b", expected a (the file name)');
		expect(errors).toContain('src/data/areas/a/courses/a.yaml: area is "b", expected a');
		expect(errors).toContain(
			'src/data/areas/a/courses/a.yaml: lists a/nope, which has no file under src/data/areas/a/lessons/',
		);
		expect(errors).toContain('src/data/areas/a/courses/a.yaml: a/x is also listed in src/data/areas/a/courses/a.yaml');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: no course under src/data/areas/a/courses/ lists it');
		expect(check(tree({ 'data/areas/a/courses/a.yaml': null })).errors).toContain(
			'src/data/areas/a/courses/: no course file',
		);
	});
	it('reports a lesson whose references are off', () => {
		const other = TOPIC.replace(/a\//g, 'b/').replace('area: a', 'area: b').replace('c1', 'c3').replace('c2', 'c4');
		const { errors } = check(
			tree({
				'data/groups.yaml': GROUPS.replace('[a]', '[a, b]'),
				'data/areas/b/area.yaml': AREA.replace('id: a', 'id: b'),
				'data/areas/b/topics/t.yaml': other,
				'data/areas/b/courses/b.yaml': 'id: b\narea: b\nlessons: [b/y]\n',
				'data/areas/b/lessons/y.yaml': PLANNED.replace('id: a/p', 'id: b/y')
					.replace('after: [a/x]', 'after: []')
					.replace('covers: a/t', 'covers: b/t')
					.replace('[c2]', '[c4]'),
				'data/areas/a/lessons/p.yaml': PLANNED.replace('id: a/p', 'id: a/q')
					.replace('covers: a/t', 'covers: b/t')
					.replace('[c2]', '[c1, zz]')
					.replace('after: [a/x]', 'after: [a/gone]')
					.replace('[{objective: a/c/o}]', '[{objective: a/c/nope}]')
					.replace('minutes: 10', 'minutes: 10\nserves: [a/c/nope]\nsources: [Nope]'),
			}),
		);
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: id is "a/q", expected a/p');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: covers b/t, a topic of another area');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: serves "a/c/nope" is not an objective id');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: assumes "a/c/nope" is not an objective id');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: after "a/gone" is not a lesson of this area');
		// Lesson files are read in name order, so p (id a/q) introduces c1 first and x is the repeat.
		expect(errors).toContain('src/data/areas/a/lessons/x.yaml: introduces c1, which a/q also introduces');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: introduces "zz" is not a concept id');
		expect(errors).toContain('src/data/areas/a/lessons/p.yaml: sources "Nope" is not a bibliography key');
		expect(
			check(tree({ 'data/areas/a/lessons/p.yaml': PLANNED.replace('covers: a/t', 'covers: a/nope') })).errors,
		).toContain('src/data/areas/a/lessons/p.yaml: covers "a/nope" is not a topic id');
	});
	it('fails a page that cites a key its plan file does not list, and passes one whose citations all match', () => {
		const { errors } = check(
			tree({ 'content/a/x.mdx': 'Cited (@AEC-01) and again (@AEC-01), then (@Claude Code permission modes).\n' }),
		);
		expect(errors).toEqual([
			'src/content/docs/a/x.mdx: cites "Claude Code permission modes", which its plan file\'s sources list lacks',
		]);
		expect(check(tree({ 'content/a/x.mdx': 'Cited (@AEC-01) and again (@ AEC-01 ).\n' })).errors).toEqual([]);
	});
	it('fails a page whose token holds two keys, wrapped or not, and says to write one key per token', () => {
		expect(check(tree({ 'content/a/x.mdx': 'Cited (@AEC-01,\n@AEC-01).\n' })).errors).toEqual([
			'src/content/docs/a/x.mdx: citation key "AEC-01, @AEC-01" contains "@". Write one key per token: (@a) (@b).',
		]);
	});
	it('warns, without failing, about a concept no lesson introduces', () => {
		const r = check(tree({ 'data/areas/a/lessons/p.yaml': PLANNED.replace('introduces: [c2]', 'introduces: []') }));
		expect(r.errors).toEqual([]);
		expect(r.warnings).toEqual(['src/data/areas/a: no lesson introduces the concept c2 (a/t)']);
	});
	it('reports a live lesson without a description or with an assumes entry lacking lesson and section', () => {
		const { errors } = check(
			tree({
				'data/areas/a/lessons/x.yaml': LIVE.replace('description: d\n', '').replace(', lesson: a/p, section: s', ''),
			}),
		);
		expect(errors).toEqual([
			'src/data/areas/a/lessons/x.yaml: the lesson is live, so it needs a description',
			'src/data/areas/a/lessons/x.yaml: assumes a/c/o without the lesson and section that teach it, which a live lesson needs',
		]);
	});
	it('checks an assumes section against the slugs of the named page, for a planned lesson too', () => {
		const planned = PLANNED.replace(
			'[{objective: a/c/o}]',
			'[{objective: a/c/o, lesson: a/x, section: what-it-doesnt-fix}]',
		);
		// The frontmatter is not a heading, so the sections listed in the error are the two `## ` ones.
		const front = '---\nsidebar:\n  order: 1\n---\n';
		const good = `${front}## Intro\n\n## What it doesn't fix\n`;
		expect(check(tree({ 'data/areas/a/lessons/p.yaml': planned, 'content/a/x.mdx': good })).errors).toEqual([]);
		const bad = check(
			tree({ 'data/areas/a/lessons/p.yaml': planned, 'content/a/x.mdx': `${front}## Intro\n\n## What it fixes\n` }),
		);
		expect(bad.errors).toEqual([
			'src/data/areas/a/lessons/p.yaml: assumes section "what-it-doesnt-fix", which is not a "## " heading of a/x; its sections are: intro, what-it-fixes',
		]);
	});
	it('skips an assumes section whose lesson has no page yet', () => {
		// The fixture's live a/x assumes section s of a/p, which has no page.
		expect(check(tree()).errors).toEqual([]);
	});
	it('reports a lesson that sets sources-checked or review-by without the other, and passes both or neither', () => {
		const both = `${LIVE}sources-checked: 2026-09-20\nreview-by: 2027-03-20\n`;
		expect(check(tree({ 'data/areas/a/lessons/x.yaml': both })).errors).toEqual([]);
		expect(check(tree({ 'data/areas/a/lessons/x.yaml': `${LIVE}sources-checked: 2026-09-20\n` })).errors).toEqual([
			'src/data/areas/a/lessons/x.yaml: sets sources-checked without review-by, which spec S11 pairs with it',
		]);
		expect(check(tree({ 'data/areas/a/lessons/p.yaml': `${PLANNED}review-by: 2027-03-20\n` })).errors).toEqual([
			'src/data/areas/a/lessons/p.yaml: sets review-by without sources-checked, which spec S11 pairs with it',
		]);
		const same = `${LIVE}sources-checked: 2026-09-20\nreview-by: 2026-09-20\n`;
		expect(check(tree({ 'data/areas/a/lessons/x.yaml': same })).errors).toEqual([
			'src/data/areas/a/lessons/x.yaml: review-by 2026-09-20 is not after sources-checked 2026-09-20',
		]);
	});
	it('reports a lesson page without a lesson file, and frontmatter that the data owns', () => {
		const { errors } = check(
			tree({
				'content/a/y.mdx': PAGE,
				'content/a/x.mdx':
					'---\ntitle: X\nmode: tutorial\nsources-checked: 2026-09-20\nlastUpdated: 2026-10-01\nsidebar:\n  order: 1\n---\n\nBody.\n',
				'content/a/index.mdx': '---\ntitle: Course\n---\n',
			}),
		);
		expect(errors).toEqual([
			'src/content/docs/a/x.mdx: frontmatter sets title, mode, sources-checked, lastUpdated, which the lesson file owns',
			'src/content/docs/a/y.mdx: lesson page without a lesson file at src/data/areas/a/lessons/y.yaml',
			'src/content/docs/a/index.mdx: frontmatter sets title, which area.yaml owns',
		]);
	});
});

describe('competency behavior markdown', () => {
	const behaviors = (example: string) =>
		`${COMPETENCY}    behaviors:\n      - claim: Reads (@AEC-01).\n        why: w\n        example: ${JSON.stringify(example)}\n`;
	const error = (form: string) =>
		`src/data/areas/a/competencies/c.yaml: objective a/c/o behavior 1 example uses ${form}, which the competency page does not render`;
	it('fails underscore emphasis, naming the objective, cell and form', () => {
		expect(check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('Reads _the log_ first.') })).errors).toEqual([
			error('underscore emphasis'),
		]);
		expect(check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('Reads __the log__.') })).errors).toEqual([
			error('underscore emphasis'),
		]);
	});
	it('fails strong or emphasis that spans a citation', () => {
		expect(check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('**Reads (@AEC-01)** first.') })).errors).toEqual(
			[error('strong or emphasis around a citation')],
		);
		expect(check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('*Reads (@AEC-01)* first.') })).errors).toEqual([
			error('strong or emphasis around a citation'),
		]);
	});
	it('fails a link with a title', () => {
		expect(
			check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('See [the map](/map/ "Map").') })).errors,
		).toEqual([error('link with a title')]);
	});
	it('passes snake_case in a code span, an underscore in a URL, a lone underscore and the supported forms', () => {
		const ok = behaviors(
			'Calls `search_customers` at https://example.com/a_b, writes _ alone, **reads** (@AEC-01), *em*, [m](/map/).',
		);
		expect(check(tree({ 'data/areas/a/competencies/c.yaml': ok })).errors).toEqual([]);
		const root = tree();
		expect(checkBehaviorMarkdown(readAreaTree(join(root, 'data')), (f) => f)).toEqual([]);
	});
});

describe('competency behavior citations', () => {
	const behaviors = (example: string) =>
		`${COMPETENCY}    behaviors:\n      - claim: Reads (@AEC-01).\n        why: w\n        example: ${JSON.stringify(example)}\n`;
	it('fails a behavior that cites a key the bibliography lacks, naming the objective, cell and key', () => {
		const { errors } = check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('See (@AEC-O1) too.') }));
		expect(errors).toEqual([
			'src/data/areas/a/competencies/c.yaml: objective a/c/o behavior 1 example cites "AEC-O1", which is not a bibliography key',
		]);
	});
	it('passes behaviors whose keys all exist, and a competency without behaviors', () => {
		expect(check(tree({ 'data/areas/a/competencies/c.yaml': behaviors('And (@ AEC-01 ).') })).errors).toEqual([]);
		expect(check(tree()).errors).toEqual([]);
		const root = tree();
		expect(checkBehaviorCitations(readAreaTree(join(root, 'data')), (f) => f)).toEqual([]);
	});
});

describe('citations in component props', () => {
	const choice = (why: string) =>
		[
			'Text cites (@AEC-01) and renders.', // 1
			'', // 2
			'<Choice id="q" title="T"', // 3
			'  options={[', // 4
			"    { text: 'A', correct: true },", // 5
			`    { text: 'B', why: ${JSON.stringify(why)} },`, // 6
			'  ]}>', // 7
			'Stem (@AEC-01)?', // 8: children are text, which the plugin renders
			'</Choice>', // 9
			'',
		].join('\n');
	it('fails a (@ token in a checkpoint option, naming the line, tag, prop path and token', () => {
		expect(propCitations(choice('Wrong (@AEC-01). More.'), 'p')).toEqual([
			{ line: 4, tag: 'Choice', prop: 'options[1].why', token: '(@AEC-01)' },
		]);
		const { errors } = check(tree({ 'content/a/x.mdx': choice('Wrong (@AEC-01). More.') }));
		expect(errors).toEqual([
			'src/content/docs/a/x.mdx:4: <Choice> prop options[1].why holds the citation (@AEC-01), which the page shows as literal text because citations in props are not rendered. Name the source in words, or cite it in the page text',
		]);
	});
	it('fails a token in a quoted prop, on a course page, on a raw HTML element and one without its closing parenthesis', () => {
		const src = [
			'<Pitfall title="Read (@AEC-01)">', // 1
			'Body.', // 2
			'</Pitfall>', // 3
			'', // 4
			'<abbr title="see (@AEC-01 and more">x</abbr>', // 5
			'', // 6
			'<Pitfall title="Run ``a ` b`` then (@AEC-01) and `c`">', // 7: the double run closes only on a double run
			'Body.', // 8
			'</Pitfall>', // 9
			'',
		].join('\n');
		expect(propCitations(src, 'p')).toEqual([
			{ line: 1, tag: 'Pitfall', prop: 'title', token: '(@AEC-01)' },
			{ line: 5, tag: 'abbr', prop: 'title', token: '(@AEC-01 and more' },
			{ line: 7, tag: 'Pitfall', prop: 'title', token: '(@AEC-01)' },
		]);
		const { errors } = check(tree({ 'content/a/index.mdx': '<Recap hint="(@AEC-01)">\nDone.\n</Recap>\n' }));
		expect(errors).toEqual([
			propCitationMessage('src/content/docs/a/index.mdx', { line: 1, tag: 'Recap', prop: 'hint', token: '(@AEC-01)' }),
		]);
	});
	it('fails a token in each checkpoint string prop: consequence, why, context, hint and rationale', () => {
		const src = [
			'<Scenario id="s" hint="Think (@AEC-01)." context="After (@AEC-02)."', // 1
			'  options={[', // 2
			"    { text: 'A', correct: true, consequence: 'It works (@AEC-03).' },", // 3
			"    { text: 'B', consequence: 'It fails.', why: 'Because (@AEC-04).' },", // 4
			'  ]}>', // 5
			'Stem?', // 6
			'</Scenario>', // 7
			'', // 8
			"<Match id=\"m\" rationale=\"See (@AEC-05).\" options={['b']} rows={[{ text: 'a', answer: 'b' }]}>", // 9
			'Stem?', // 10
			'</Match>', // 11
			'',
		].join('\n');
		expect(propCitations(src, 'p')).toEqual([
			{ line: 1, tag: 'Scenario', prop: 'hint', token: '(@AEC-01)' },
			{ line: 1, tag: 'Scenario', prop: 'context', token: '(@AEC-02)' },
			{ line: 2, tag: 'Scenario', prop: 'options[0].consequence', token: '(@AEC-03)' },
			{ line: 2, tag: 'Scenario', prop: 'options[1].why', token: '(@AEC-04)' },
			{ line: 9, tag: 'Match', prop: 'rationale', token: '(@AEC-05)' },
		]);
		const { errors } = check(tree({ 'content/a/x.mdx': src }));
		expect(errors).toContain(
			propCitationMessage('src/content/docs/a/x.mdx', {
				line: 2,
				tag: 'Scenario',
				prop: 'options[0].consequence',
				token: '(@AEC-03)',
			}),
		);
		expect(errors.filter((e) => e.includes('which the page shows as literal text'))).toHaveLength(5);
	});
	it('passes clean props, a token in a code span, a Predict answer, a non-literal prop and a tag inside a fence', () => {
		expect(propCitations(choice('Wrong, as the vendor page says. More.'), 'p')).toEqual([]);
		expect(check(tree({ 'content/a/x.mdx': choice('Wrong, as the vendor page says.') })).errors).toEqual([]);
		const src = [
			'<Choice id="q" options={[{ text: \'Write `(@key)` in the text\', correct: true }]}>', // code span
			'Stem?',
			'</Choice>',
			'',
			'<Predict answer="(@AEC-01)">', // expected output, shown as code
			'Run it.',
			'</Predict>',
			'',
			'<Repair id="r" broken="See (@AEC-01)" model="Cite (@AEC-01) in text">', // both shown verbatim
			'Fix it.',
			'</Repair>',
			'',
			'<Pitfall title="Write ``a ` (@AEC-01)`` as code">', // a double-backtick span with a backtick inside
			'Body.',
			'</Pitfall>',
			'',
			'<Widget data={items} />', // not a literal, so not readable before render
			'',
			'```text',
			'<Pitfall title="(@AEC-01)">',
			'```',
			'',
		].join('\n');
		expect(propCitations(src, 'p')).toEqual([]);
	});
	it('names the page when it does not parse', () => {
		expect(() => propCitations('<Choice options={[}>\n', 'src/x.mdx')).toThrow(/^src\/x\.mdx: /);
	});
});

describe('extends-to and covered-by hrefs', () => {
	const bib = `${BIB}  url: https://example.com/course/\n`;
	const withHrefs = (extendsTo: string, coveredBy?: string) =>
		`${LIVE}extends-to:\n  - {label: Next, href: ${JSON.stringify(extendsTo)}}\n${
			coveredBy ? `covered-by: {label: Course, href: ${JSON.stringify(coveredBy)}}\n` : ''
		}`;
	it('passes a page path, and an https URL under a bibliography url, in both fields', () => {
		const root = tree({
			'data/bibliography.yaml': bib,
			'data/areas/a/lessons/x.yaml': withHrefs('/a/p/', 'https://example.com/course/week-1'),
		});
		expect(check(root).errors).toEqual([]);
		expect(
			check(
				tree({ 'data/bibliography.yaml': bib, 'data/areas/a/lessons/x.yaml': withHrefs('https://example.com/course') }),
			).errors,
		).toEqual([]);
	});
	it('fails an external href that no bibliography entry covers, naming the file, field and href', () => {
		const { errors } = check(
			tree({
				'data/bibliography.yaml': bib,
				'data/areas/a/lessons/x.yaml': withHrefs('https://other.example/page', 'https://example.com.evil/x'),
			}),
		);
		expect(errors).toEqual([
			'src/data/areas/a/lessons/x.yaml: extends-to href https://other.example/page does not start with the url of any entry in bibliography.yaml',
			'src/data/areas/a/lessons/x.yaml: covered-by href https://example.com.evil/x does not start with the url of any entry in bibliography.yaml',
		]);
	});
	it('fails a covered-by page path and an extends-to href that is neither form', () => {
		const { errors } = check(tree({ 'data/areas/a/lessons/x.yaml': withHrefs('http://example.com/', '/a/p/') }));
		expect(errors).toEqual([
			'src/data/areas/a/lessons/x.yaml: extends-to href must be a root-relative path or an https:// URL, got http://example.com/',
			'src/data/areas/a/lessons/x.yaml: covered-by href must be an https:// URL, got /a/p/',
		]);
		expect(checkSourceHrefs(readAreaTree(join(tree(), 'data')), (f) => f)).toEqual([]);
	});
	it('fails an entry without an href in either field, naming the entry', () => {
		const { errors } = check(
			tree({
				'data/areas/a/lessons/x.yaml': `${LIVE}extends-to:\n  - {label: Next}\ncovered-by: {label: Course}\n`,
			}),
		);
		expect(errors).toEqual([
			'src/data/areas/a/lessons/x.yaml: extends-to entry "Next" has no href',
			'src/data/areas/a/lessons/x.yaml: covered-by has no href',
		]);
	});
});

describe('foundations audience', () => {
	const FOUNDATIONS = GROUPS.replace('id: g', 'id: foundations');
	const AREA_F = AREA.replace('group: g', 'group: foundations');
	const RULE = 'which a foundations lesson may not show (spec S03 "Foundations audience")';
	it('lists every banned surface with its line, and skips code spans and fences of other languages', () => {
		const src = [
			'Open a terminal and run `python3 x.py`.', // 1: the word, but the code span is skipped
			'', // 2
			'```text', // 3: a text fence hides its body
			'python3 x.py', // 4
			'git clone foo', // 5
			'```', // 6
			'', // 7
			'```sh', // 8
			'ls', // 9
			'```', // 10
			'', // 11
			'<Predict run="a/b.py" answer="1">', // 12
			'', // 13
			'</Predict>', // 14
			'', // 15
			'<Predict answer="one">', // 16: no run, so an example that says it cannot run
			'', // 17
			'</Predict>', // 18
			'', // 19
			'~~~json', // 20
			'{}', // 21
			'~~~', // 22
			'Then `git clone` it, or Git Clone it. A terminal-like pane is fine, a Terminal is not.', // 23
			'', // 24
			'```text', // 25: a Predict quoted inside a text fence is shown, not run
			'<Predict run="hidden/in-fence.py" answer="x">', // 26
			'```', // 27
			'', // 28
			'{/* <Predict run="hidden/in-comment.py" answer="x"> is a note to the author */}', // 29
			'', // 30
			'<Predict run="c/d.py" answer="2" />', // 31: after the skipped ones, the line still maps
		].join('\n');
		expect(foundationsSurfaces(src)).toEqual([
			{ line: 1, surface: 'the word "terminal"' },
			{ line: 8, surface: '```sh fence' },
			{ line: 12, surface: '<Predict run="a/b.py">' },
			{ line: 20, surface: '```json fence' },
			{ line: 23, surface: 'the word "Git Clone"' },
			{ line: 31, surface: '<Predict run="c/d.py">' },
		]);
		expect(foundationsSurfaces('A JSON reply in a `json` span, a Python fan, and a bus terminal.\n')).toEqual([
			{ line: 1, surface: 'the word "terminal"' },
		]);
		expect(foundationsSurfaces('```Python\nprint(1)\n```\n```BASH\nls\n```\n```shell\nls\n```\n')).toEqual([
			{ line: 1, surface: '```python fence' },
			{ line: 4, surface: '```bash fence' },
			{ line: 7, surface: '```shell fence' },
		]);
		// Aliases of the listed languages count as the language, and an unlisted one passes.
		expect(foundationsSurfaces('```py\n1\n```\n```zsh\nls\n```\n```console\n$ ls\n```\n```yaml\na: 1\n```\n')).toEqual([
			{ line: 1, surface: '```py fence' },
			{ line: 4, surface: '```zsh fence' },
			{ line: 7, surface: '```console fence' },
		]);
	});
	it('fails a foundations lesson page that shows one, and passes the same page in another group', () => {
		const page = 'Body.\n\n```sh\nls\n```\n';
		const root = tree({ 'data/groups.yaml': FOUNDATIONS, 'data/areas/a/area.yaml': AREA_F, 'content/a/x.mdx': page });
		expect(check(root).errors).toEqual([`src/content/docs/a/x.mdx:3: \`\`\`sh fence, ${RULE}`]);
		expect(check(tree({ 'content/a/x.mdx': page })).errors).toEqual([]);
	});
	it('passes an exempt lesson that still shows one, and fails a stale or unknown exemption', () => {
		const shown = tree({
			'data/groups.yaml': FOUNDATIONS,
			'data/areas/a/area.yaml': AREA_F,
			'content/a/x.mdx': 'Body.\n\n```sh\nls\n```\n',
		});
		expect(check(shown, new Map([['a/x', 999]])).errors).toEqual([]);
		const clean = tree({ 'data/groups.yaml': FOUNDATIONS, 'data/areas/a/area.yaml': AREA_F });
		expect(check(clean, new Map([['a/x', 999]])).errors).toEqual([
			'src/content/docs/a/x.mdx: is exempt from the foundations audience rule for #999 but shows no banned surface, so remove its FOUNDATIONS_EXEMPT line in scripts/lib/data.mjs',
		]);
		expect(check(clean, new Map([['a/gone', 998]])).errors).toEqual([
			'scripts/lib/data.mjs: FOUNDATIONS_EXEMPT lists a/gone (#998), which is not a foundations lesson page, so remove the line',
		]);
	});
	describe('proofs (#497)', () => {
		const withProofs = (proofs: string) => LIVE.replace('minutes: 10\n', `minutes: 10\nproofs: ${proofs}\n`);
		const fixture = { 'examples/a/x/price.py': 'print(1)\n', 'examples/a/x/notes.txt': 'data\n' };
		const foundations = { 'data/groups.yaml': FOUNDATIONS, 'data/areas/a/area.yaml': AREA_F, ...fixture };
		it('passes a foundations lesson whose proofs name .py files under site/examples/', () => {
			const root = tree({ ...foundations, 'data/areas/a/lessons/x.yaml': withProofs('[a/x/price.py]') });
			expect(check(root).errors).toEqual([]);
		});
		it('fails proofs on a lesson outside the foundations group', () => {
			const root = tree({ ...fixture, 'data/areas/a/lessons/x.yaml': withProofs('[a/x/price.py]') });
			expect(check(root).errors).toEqual([
				'src/data/areas/a/lessons/x.yaml: proofs is only for a lesson in the foundations group (spec S09 "Groups"), and this area is in "g"; an engineering page shows its fixture with <Predict run=...>',
			]);
		});
		it('names the missing group when groups.yaml lists none for the area', () => {
			const root = tree({
				...fixture,
				'data/groups.yaml': '[]\n',
				'data/areas/a/lessons/x.yaml': withProofs('[a/x/price.py]'),
			});
			expect(check(root).errors).toContain(
				'src/data/areas/a/lessons/x.yaml: proofs is only for a lesson in the foundations group (spec S09 "Groups"), and this area is in no group of src/data/groups.yaml; an engineering page shows its fixture with <Predict run=...>',
			);
		});
		it('fails a proof that is not a .py file under site/examples/', () => {
			const root = tree({
				...foundations,
				'data/areas/a/lessons/x.yaml': withProofs(
					'[a/x/notes.txt, a/x/gone.py, ../a/x/price.py, /a/x/price.py, a/./x/price.py, a/x, 3]',
				),
			});
			const where = 'src/data/areas/a/lessons/x.yaml: proofs';
			expect(check(root).errors).toEqual([
				`${where} "a/x/notes.txt" is not a .py fixture path`,
				`${where} "a/x/gone.py" is not a file under site/examples/`,
				`${where} "../a/x/price.py" is not a plain path relative to site/examples/`,
				`${where} "/a/x/price.py" is not a plain path relative to site/examples/`,
				`${where} "a/./x/price.py" is not a plain path relative to site/examples/`,
				`${where} "a/x" is not a .py fixture path`,
				`${where} 3 is not a .py fixture path`,
			]);
		});
		it('fails proofs that is not a list', () => {
			const root = tree({ ...foundations, 'data/areas/a/lessons/x.yaml': withProofs('a/x/price.py') });
			expect(check(root).errors).toEqual(['src/data/areas/a/lessons/x.yaml: proofs is not a list of fixture paths']);
		});
	});
	it('names an issue for every exemption in the repo list', () => {
		for (const [id, issue] of FOUNDATIONS_EXEMPT) {
			expect(id).toMatch(/^(concepts|safety|using-agents)\/[a-z-]+$/);
			expect(issue).toBeGreaterThan(0);
		}
	});
});

describe('helpers', () => {
	it('reviewDatePairError is null for both or neither date and names the missing one otherwise', () => {
		expect(reviewDatePairError({})).toBeNull();
		expect(reviewDatePairError(undefined)).toBeNull();
		expect(reviewDatePairError({ 'sources-checked': '2026-09-20', 'review-by': '2027-03-20' })).toBeNull();
		expect(reviewDatePairError({ 'sources-checked': '2026-09-20' })).toMatch(/without review-by/);
		expect(reviewDatePairError({ 'review-by': '2027-03-20' })).toMatch(/without sources-checked/);
		expect(reviewDatePairError({ 'sources-checked': '2026-09-20', 'review-by': '2026-09-19' })).toMatch(/not after/);
		expect(reviewDatePairError({ 'sources-checked': 'soon', 'review-by': '2027-03-20' })).toBeNull();
	});
	it('frontmatter parses the YAML block and returns {} without one', () => {
		expect(frontmatter('---\ntitle: X\n---\n\nBody.\n')).toEqual({ title: 'X' });
		expect(frontmatter('# no frontmatter\n')).toEqual({});
		expect(frontmatter('---\n\n---\n')).toEqual({});
	});
	it('lessonPages lists <area>/<lesson>.mdx under a known area only', () => {
		const root = tree({ 'content/a/notes.md': PAGE, 'content/a/deep/x.mdx': PAGE });
		expect([...lessonPages(join(root, 'content'), new Set(['a'])).keys()]).toEqual(['a/x']);
		expect(lessonPages(join(root, 'nowhere'), new Set(['a'])).size).toBe(0);
	});
	it('knownIds collects topic and objective ids', () => {
		const { topicIds, objectiveIds } = knownIds(join(tree(), 'data'));
		expect([...topicIds]).toEqual(['a/t']);
		expect([...objectiveIds]).toEqual(['a/c/o']);
	});
	it('readAreaTree lists areas in group order, then unlisted directories, and tolerates a bare tree', () => {
		const root = tree({
			'data/groups.yaml': `- id: z\n  order: 2\n  name: Z\n  areas: [c]\n${GROUPS.replace('[a]', '[b, a]')}`,
			'data/areas/b/area.yaml': AREA.replace('id: a', 'id: b'),
			'data/areas/c/area.yaml': AREA.replace('id: a', 'id: c'),
			'data/areas/d/area.yaml': AREA.replace('id: a', 'id: d'),
		});
		const t = readAreaTree(join(root, 'data'));
		// Groups sort by `order`, so g (order 1) comes before z (order 2), and no group names d.
		expect(t.areas.map((a) => a.dir)).toEqual(['b', 'a', 'c', 'd']);
		expect(allTopics(t).map((x) => x.id)).toEqual(['a/t']);
		expect(allLessons(t).map((x) => x.id)).toEqual(['a/p', 'a/x']);
		expect([...t.bibliographyKeys]).toEqual(['AEC-01']);
		const bare = readAreaTree(join(root, 'nowhere'));
		expect(bare).toEqual({
			groups: [],
			areas: [],
			alignment: [],
			bibliographyKeys: new Set(),
			bibliographySources: new Map(),
		});
		expect(yamlFilesIn(join(root, 'nowhere'))).toEqual([]);
	});
	it('courseLessonIds reads the flat list or the parts, and nothing from neither', () => {
		expect(courseLessonIds({ lessons: ['a/x'] })).toEqual(['a/x']);
		expect(
			courseLessonIds({
				parts: [
					{ title: 'P', lessons: ['a/x'] },
					{ title: 'Q', lessons: ['a/y'] },
				],
			}),
		).toEqual(['a/x', 'a/y']);
		expect(courseLessonIds({})).toEqual([]);
	});
});

describe('checkLessonTimes (spec S03 "Lesson time")', () => {
	/** 180 words of prose take one minute at the estimate's prose rate. */
	const minutesOfProse = (m: number) => `${Array.from({ length: 180 * m }, () => 'word').join(' ')}\n`;
	it('warns, without failing, when reading, checkpoints and widgets alone are over 25 minutes', () => {
		const long = `${minutesOfProse(26)}\n<Exercise>\nTen minutes is enough.\n</Exercise>\n`;
		const result = check(tree({ 'content/a/x.mdx': long }));
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([
			'src/content/docs/a/x.mdx: reading, checkpoints and widgets come to about 26 minutes without the exercise, over the 25 of spec S03 "Length"; trim or split the lesson',
		]);
	});
	it('leaves the exercise out: 20 minutes of reading and a 30-minute exercise pass', () => {
		const withExercise = `${minutesOfProse(20)}\n<Exercise>\nThirty minutes.\n</Exercise>\n`;
		expect(check(tree({ 'content/a/x.mdx': withExercise })).warnings).toEqual([]);
	});
	it('fails a page with a component the estimate has no rule for', () => {
		const { errors } = check(tree({ 'content/a/x.mdx': 'Body.\n\n<Carousel />\n' }));
		expect(errors).toEqual([
			expect.stringMatching(/^src\/content\/docs\/a\/x\.mdx: <Carousel> has no rule in the lesson time estimate/),
		]);
	});
	it('skips a page with no lesson file, which checkData reports on its own', () => {
		const root = tree({ 'content/a/orphan.mdx': '<Carousel />\n' });
		expect(checkLessonTimes(join(root, 'content'), ['a/x'])).toEqual({ errors: [], warnings: [] });
		expect(check(root).errors).toEqual([expect.stringMatching(/a\/orphan\.mdx: lesson page without a lesson file/)]);
	});
});

describe('reportData (the mise run data output)', () => {
	const capture = () => {
		const lines: { log: string[]; warn: string[]; error: string[] } = { log: [], warn: [], error: [] };
		const out = {
			log: (m: string) => lines.log.push(m),
			warn: (m: string) => lines.warn.push(m),
			error: (m: string) => lines.error.push(m),
		};
		return { lines, out };
	};
	it('prints each warning and exits 0', () => {
		const { lines, out } = capture();
		const code = reportData({ errors: [], warnings: ['w1', 'w2'], lessons: 2, pages: 1 }, out);
		expect(code).toBe(0);
		expect(lines.warn).toEqual(['data: warning: w1', 'data: warning: w2']);
		expect(lines.log).toEqual(['data: 2 lesson plans, 1 lesson page, all consistent (2 warnings)']);
		expect(lines.error).toEqual([]);
	});
	it('prints each error and a count, and exits 1', () => {
		const { lines, out } = capture();
		expect(reportData({ errors: ['e1'], warnings: [], lessons: 1, pages: 1 }, out)).toBe(1);
		expect(lines.error).toEqual(['data: e1', 'data: 1 problem']);
		expect(lines.log).toEqual([]);
	});
	it('prints a clean run without a warning count', () => {
		const { lines, out } = capture();
		expect(reportData({ errors: [], warnings: [], lessons: 1, pages: 1 }, out)).toBe(0);
		expect(lines.log).toEqual(['data: 1 lesson plan, 1 lesson page, all consistent']);
	});
});
