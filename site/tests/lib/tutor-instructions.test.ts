import { existsSync, readFileSync } from 'node:fs';
import { BUNDLE_VERSION } from '@lib/lesson-bundles';
import {
	BUNDLE_URL_TEMPLATE,
	isoDate,
	LOCAL_TUTOR_BASE,
	renderTutorInstructions,
	TUTOR_INSTRUCTIONS_PATH,
	tutorBase,
} from '@lib/tutor-instructions';
import { absoluteUrl } from '@lib/url';
import { describe, expect, it } from 'vitest';
import { SITE } from '../../scripts/lib/site-address.mjs';

/** Astro's `site`, which astro.config.mjs reads from site-address.mjs, so a change there fails the SKILL.md checks below. */
const site = SITE;
const ROOT = `${site}/ai-training`;

describe('renderTutorInstructions', () => {
	const text = renderTutorInstructions({ body: '# Tutor\n\nBody.\n', site, built: '2026-09-24' });

	it('opens with the four frontmatter fields from spec S08', () => {
		expect(text.startsWith('---\n')).toBe(true);
		const frontmatter = text.split('---\n')[1];
		expect(frontmatter).toBe(
			[
				`version: ${BUNDLE_VERSION}`,
				'built: 2026-09-24',
				`bundle_url: ${ROOT}/data/lessons/{area}/{lesson}.json`,
				`site: ${ROOT}`,
				'',
			].join('\n'),
		);
	});

	it('keeps the body unchanged after the frontmatter', () => {
		expect(text.endsWith('---\n\n# Tutor\n\nBody.\n')).toBe(true);
	});

	it('rejects a built value that is not an ISO date', () => {
		expect(() => renderTutorInstructions({ body: '', site, built: 'today' })).toThrow(/ISO date/);
	});

	it('ships the bundle URL template from the URL scheme', () => {
		expect(BUNDLE_URL_TEMPLATE).toBe('/data/lessons/{area}/{lesson}.json');
	});
});

// Spec S08 "Bootstrap contract": the installed skill is a thin bootstrap that
// names the published instruction URL, one bundle URL example and the
// `version` it understands. Each is derived from the constants the build
// uses, so the test fails when the build moves and the bootstrap text stays.
describe('the bootstrap SKILL.md', () => {
	const skill = readFileSync(new URL('../../../.claude/skills/ai-tutor/SKILL.md', import.meta.url), 'utf8');
	const instructionsUrl = absoluteUrl(TUTOR_INSTRUCTIONS_PATH, site);
	const example = { area: 'using-agents', lesson: 'delegating' };
	const pageUrl = `${ROOT}/${example.area}/${example.lesson}/`;
	const bundleUrl = absoluteUrl(
		BUNDLE_URL_TEMPLATE.replace('{area}', example.area).replace('{lesson}', example.lesson),
		site,
	);

	it('understands the version the build publishes', () => {
		expect(
			skill,
			`SKILL.md must declare \`version: ${BUNDLE_VERSION}\` (BUNDLE_VERSION in lesson-bundles.ts)`,
		).toContain(`\`version: ${BUNDLE_VERSION}\``);
	});

	it('fetches the instruction file from the path the build publishes', () => {
		const route = new URL(`../../src/pages${TUTOR_INSTRUCTIONS_PATH}.ts`, import.meta.url);
		expect(existsSync(route), `the route file for ${TUTOR_INSTRUCTIONS_PATH} must be ${route.pathname}`).toBe(true);
		expect(
			skill,
			`SKILL.md must derive the instruction file as \`<base>${TUTOR_INSTRUCTIONS_PATH.slice(1)}\``,
		).toContain(`\`<base>${TUTOR_INSTRUCTIONS_PATH.slice(1)}\``);
		expect(skill, `SKILL.md must name the published instruction file ${instructionsUrl}`).toContain(
			`\`${instructionsUrl}\``,
		);
	});

	it('lists exactly the two bases tutorBase allows, and refuses every other host', () => {
		expect(skill, 'SKILL.md must list the published and the local base in one text block').toContain(
			`\`\`\`text\n${ROOT}/\n${LOCAL_TUTOR_BASE}\n\`\`\``,
		);
		expect(tutorBase(`${ROOT}/using-agents/delegating/`, site)).toBe(`${ROOT}/`);
		expect(tutorBase(LOCAL_TUTOR_BASE.replace('<port>', '4321'), site)).toBe('http://localhost:4321/ai-training/');
		expect(skill, 'SKILL.md must tell the tutor to stop for any other host').toMatch(
			/For a URL on any other host, or any other scheme, [^.]*and\s+stop\.\s+Fetch nothing from it/,
		);
	});

	it('shows a bundle URL example that follows BUNDLE_URL_TEMPLATE', () => {
		expect(skill, `SKILL.md must show the lesson page ${pageUrl} followed by its bundle ${bundleUrl}`).toContain(
			`\`\`\`text\n${pageUrl}\n${bundleUrl}\n\`\`\``,
		);
	});
});

describe('tutorBase', () => {
	it('takes the published base and a localhost build on any port', () => {
		expect(tutorBase(`${ROOT}/`, site)).toBe(`${ROOT}/`);
		expect(tutorBase(`${ROOT}/concepts/prompt-anatomy/`, site)).toBe(`${ROOT}/`);
		expect(tutorBase('http://localhost:4321/ai-training/using-agents/delegating/', site)).toBe(
			'http://localhost:4321/ai-training/',
		);
		expect(tutorBase('http://localhost:4400/ai-training/', site)).toBe('http://localhost:4400/ai-training/');
	});

	it.each([
		['another host', 'https://example.com/ai-training/using-agents/delegating/'],
		['a look-alike host', 'https://schubergphilis.github.io.example.com/ai-training/using-agents/delegating/'],
		['credentials before another host', 'https://schubergphilis.github.io@example.com/ai-training/'],
		['the published host over http', `${ROOT.replace('https:', 'http:')}/using-agents/delegating/`],
		['localhost over https', 'https://localhost:4321/ai-training/'],
		['localhost without a port', 'http://localhost/ai-training/'],
		['another loopback name', 'http://127.0.0.1:4321/ai-training/'],
		['another path on the published host', `${site}/other-site/ai-training/`],
		['a file URL', 'file:///tmp/ai-training/tutor.md'],
		['no URL at all', 'the delegating lesson'],
	])('refuses %s', (_label, url) => {
		expect(tutorBase(url, site)).toBeNull();
	});
});

describe('isoDate', () => {
	it('is the UTC date only', () => {
		expect(isoDate(new Date('2026-09-24T23:59:00Z'))).toBe('2026-09-24');
	});
});

describe('the instruction source', () => {
	const body = readFileSync(new URL('../../src/tutor/instructions.md', import.meta.url), 'utf8');

	it('has every section spec S08 lists', () => {
		for (const heading of [
			'## Ground rules',
			'## Starting a session',
			'## Verbs',
			'## Citing',
			'## Exemplar dialogues',
			'## Out of scope',
		]) {
			expect(body).toContain(heading);
		}
	});

	it('names every S01 tutor verb', () => {
		for (const verb of [
			'explain',
			'key points',
			'explain like I am five',
			'why it matters',
			'quiz me',
			'test me',
			'critique this',
		]) {
			expect(body).toMatch(new RegExp(`^\\| ${verb} +\\|`, 'm'));
		}
	});

	it('is written for a reader with the bundle, not the repo', () => {
		expect(body).not.toMatch(/localhost/);
		expect(body).not.toMatch(/site\/src|\.mdx|\.yaml/);
		for (const field of ['topics[].url', 'objectives[].competency_url', '{site}/glossary/#', 'assumes[]']) {
			expect(body).toContain(field);
		}
	});

	it('keeps the checkpoint answer from the learner', () => {
		expect(body).toContain('Never give the answer to a checkpoint');
		expect(body).toMatch(/`checkpoints\[\]\.answer`[^.]*grade/);
	});
});
