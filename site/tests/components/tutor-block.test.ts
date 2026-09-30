/**
 * Renders the "Open in tutor" block (spec S08 "Lesson page block") with
 * Astro's Container API. The MarkdownContent override passes the absolute
 * lesson URL, so the test checks the command line and the guide link with
 * the base path.
 */
import TutorBlock from '@components/lesson/TutorBlock.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

const lessonUrl = 'https://schubergphilis.github.io/ai-training/coding-with-agents/first-session/';

describe('TutorBlock', () => {
	it('renders the /ai-tutor line for the lesson with a copy button', async () => {
		const html = await container.renderToString(TutorBlock, { props: { lessonUrl } });
		expect(html).toContain('data-tutor-block');
		expect(html).toContain('class="tutor-block not-content"');
		expect(html).toContain(`<code>/ai-tutor ${lessonUrl}</code>`);
		expect(html.match(/class="tutor-copy" data-copy="/g)).toHaveLength(1);
		expect(html).toContain(`data-copy="/ai-tutor ${lessonUrl}"`);
		expect(html).toContain('aria-label="Copy the /ai-tutor line"');
	});
	it('links the "Study with the tutor" guide with the base path, and leaves the install detail to it', async () => {
		const html = await container.renderToString(TutorBlock, { props: { lessonUrl } });
		expect(html).toContain('<a href="/ai-training/guides/tutor/">Study with the tutor</a>');
		expect(html).not.toContain('npx skills add');
		expect(html).not.toContain('route-card');
	});
});
