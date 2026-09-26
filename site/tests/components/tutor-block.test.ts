/**
 * Renders the "Open in tutor" block (spec S08 "Lesson page block") with
 * Astro's Container API. The MarkdownContent override passes the absolute
 * lesson URL, so the test checks the two command lines, the settings link
 * and the guide link, each with the base path.
 */
import TutorBlock from '@components/lesson/TutorBlock.astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

const lessonUrl = 'https://lsimons.github.io/ai-training/coding-with-agents/first-session/';

describe('TutorBlock', () => {
	it('renders the install command and the /ai-tutor line for the lesson, each with a copy button', async () => {
		const html = await container.renderToString(TutorBlock, { props: { lessonUrl } });
		expect(html).toContain('data-tutor-block');
		expect(html).toContain('class="route-card tutor-block not-content"');
		expect(html).toContain('<code>npx skills add lsimons/ai-training --skill ai-tutor -g</code>');
		expect(html).toContain(`<code>/ai-tutor ${lessonUrl}</code>`);
		expect(html).toContain(`<code>Use the ai-tutor skill on ${lessonUrl}</code>`);
		expect(html.match(/class="tutor-copy" data-copy="/g)).toHaveLength(2);
		expect(html).toContain(`data-copy="/ai-tutor ${lessonUrl}"`);
	});
	it('links the settings page and the getting-started guide with the base path', async () => {
		const html = await container.renderToString(TutorBlock, { props: { lessonUrl } });
		expect(html).toContain('<a href="/ai-training/settings/">settings</a>');
		expect(html).toContain('<a href="/ai-training/guides/tutor/">');
		expect(html).toContain("The tutor can't read the progress stored in this browser.");
		// Astro drops the newline after a closing tag, so the link and the word after it stay on one source line.
		expect(html).toContain('on the <a href="/ai-training/settings/">settings</a> page and paste the file');
		expect(html).toContain('aria-label="Copy the install command"');
		expect(html).toContain('aria-label="Copy the /ai-tutor line"');
	});
});
