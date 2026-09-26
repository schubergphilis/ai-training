import { isoDate, renderTutorInstructions } from '@lib/tutor-instructions';
import type { APIRoute } from 'astro';
import body from '../../tutor/instructions.md?raw';

/**
 * The tutor instruction file (spec S08 "Published instruction file"), served
 * under the base path at `TUTOR_INSTRUCTIONS_PATH` (`@lib/tutor-instructions`),
 * which this file's own path must match. The installed tutor
 * skill (`.claude/skills/ai-tutor/SKILL.md`) fetches it before it says anything
 * to the learner, and then a lesson bundle from `/data/lessons/`. Nothing in
 * the browser reads it.
 */
export const GET: APIRoute = () => {
	// `site` from astro.config.mjs; the frontmatter's URLs are absolute, so it is required.
	const site: string | undefined = import.meta.env.SITE;
	if (!site) throw new Error('the tutor instruction file needs `site` in astro.config.mjs for absolute URLs');
	const text = renderTutorInstructions({
		body,
		site: new URL(site).origin,
		built: isoDate(new Date()),
	});
	return new Response(text, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
