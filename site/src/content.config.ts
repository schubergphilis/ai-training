import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import type { Loader } from 'astro/loaders';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { readAreaTree } from '../scripts/lib/area-tree.mjs';

const dataDir = new URL('./data/', import.meta.url).pathname;

/** A lowercase kebab-case slug, or slugs joined by `/` (spec S01 "Identifiers"). */
const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/, 'kebab-case id');

/** One objective a lesson relies on. `lesson` and `section` say where it is taught; both are set once the lesson is live. */
const assumesSchema = z
	.object({ objective: idSchema, lesson: idSchema.optional(), section: z.string().optional() })
	.strict();

/**
 * Where a confident learner goes next (spec S03 "Frontmatter", `extends-to`).
 * `href` is a root-relative page path or an `https://` URL. The MarkdownContent
 * override checks an `https://` href against the bibliography (`lib/extends-to.ts`).
 */
const extendsToSchema = z
	.object({
		label: z.string(),
		href: z.string().regex(/^(\/(?!\/)|https:\/\/)/, 'a root-relative path or an https:// URL'),
	})
	.strict();

/**
 * The one external course that covers every objective the lesson serves (spec
 * S11 "Lesson file", `covered-by`). `href` is an `https://` URL that the
 * TableOfContents override checks against the bibliography (`lib/extends-to.ts`).
 */
const coveredBySchema = z
	.object({
		label: z.string(),
		href: z.string().regex(/^https:\/\//, 'an https:// URL'),
	})
	.strict();

/** The hands-on task of a lesson, as the plan states it (spec S11 "Lesson file"). */
const exerciseSchema = z.object({ kind: z.enum(['do', 'judge']), brief: z.string() }).strict();

/**
 * The fields a lesson page carries in the `docs` collection. They come from the
 * lesson's YAML file (`areas/<area>/lessons/<lesson>.yaml`), copied onto the
 * docs entry by `lessonDocsLoader` below. Pages other than lessons have none of
 * them, and `title` is optional here only so a lesson page can leave it to the
 * YAML: the loader fails the build on any page that ends up without one.
 */
const lessonDocsFields = z.object({
	title: z.string().optional(),
	mode: z.enum(['tutorial', 'explanation']).optional(),
	/** The one topic id the lesson covers. */
	covers: idSchema.optional(),
	serves: z.array(idSchema).optional(),
	assumes: z.array(assumesSchema).optional(),
	'extends-to': z.array(extendsToSchema).optional(),
	'covered-by': coveredBySchema.optional(),
	/** The day the page's sources were last checked, shown in the review line with `review-by` (spec S03). */
	'sources-checked': z.date().optional(),
	/** The date by which the page's sources must be checked again (spec S03). */
	'review-by': z.date().optional(),
});

/** Every lesson plan field (spec S11 "Lesson file"). Strict, so a misspelled key fails the build. */
const lessonPlanSchema = z
	.object({
		id: idSchema,
		title: z.string(),
		/** One sentence for search and social cards. Required once the lesson is live (checked by `mise run data`). */
		description: z.string().optional(),
		mode: z.enum(['tutorial', 'explanation']),
		covers: idSchema,
		serves: z.array(idSchema).default([]),
		/** Concept ids first taught in this lesson. */
		introduces: z.array(idSchema).default([]),
		assumes: z.array(assumesSchema).default([]),
		'extends-to': z.array(extendsToSchema).default([]),
		'covered-by': coveredBySchema.optional(),
		/** Lesson ids in the same area this lesson comes after in the lesson graph, until it is live. */
		after: z.array(idSchema).default([]),
		/** Titles of the shorts the lesson would link to for depth. */
		shorts: z.array(z.string()).default([]),
		exercise: exerciseSchema.optional(),
		exercises: z.array(exerciseSchema).min(2).optional(),
		/** Bibliography keys the lesson draws on. */
		sources: z.array(z.string()).default([]),
		/** The lesson's GitHub issue number. */
		issue: z.number().int().positive().optional(),
		/** Target length in minutes; keep lessons short. */
		minutes: z.number().int().positive(),
		/** The day the sources were last checked, paired with `review-by`. Not Starlight's `lastUpdated`, which is about the page. */
		'sources-checked': z.coerce.date().optional(),
		'review-by': z.coerce.date().optional(),
		/**
		 * Fixture paths under site/examples/ that back a foundations page, which may not carry a
		 * `<Predict run=...>` (spec S03 "Foundations audience"). `mise run examples` runs each one and
		 * fails when it prints a line no `text` fence on the page shows; `mise run data` rejects the
		 * field on a lesson outside the foundations group.
		 */
		proofs: z.array(z.string()).optional(),
		/** Free prose for authors: rationale, a content sketch, pointers to issues. Never rendered. */
		notes: z.string().optional(),
	})
	.strict()
	.refine((l) => Boolean(l.exercise) !== Boolean(l.exercises), {
		message: 'a lesson has either `exercise` or `exercises`, not both and not neither',
	});

export type LessonPlanData = z.infer<typeof lessonPlanSchema>;

/**
 * Starlight's docs loader, then every lesson page and course page gets its
 * frontmatter from the data tree: a lesson from `areas/<area>/lessons/<lesson>.yaml`,
 * a course page (`<area>/index.mdx`) from `areas/<area>/area.yaml`. The MDX
 * files carry no frontmatter of their own (spec S11 "Lesson page").
 */
function lessonDocsLoader(): Loader {
	const inner = docsLoader();
	return {
		name: 'lesson-docs-loader',
		async load(context) {
			await inner.load(context);
			const tree = readAreaTree(dataDir);
			// A page that also carries one of these fields in its own frontmatter is
			// rejected by `mise run data`, which reads the MDX; the store entry here may
			// already hold a copy from an earlier load, so it can't tell the two apart.
			const patch = async (id: string, fields: Record<string, unknown>) => {
				const entry = context.store.get(id);
				if (!entry) return;
				const data = await context.parseData({ id, data: { ...entry.data, ...fields }, filePath: entry.filePath });
				// The store ignores a `set` whose digest matches the stored entry, so the
				// digest covers the merged data as well as the file.
				context.store.set({ ...entry, data, digest: context.generateDigest({ file: entry.digest, data }) });
			};
			for (const a of tree.areas) {
				if (a.area) {
					// Starlight gives `<area>/index.mdx` the id `<area>`.
					await patch(a.dir, { title: a.area.name, description: a.area.description });
				}
				for (const { data: l } of a.lessons) {
					const lesson = lessonPlanSchema.parse(l);
					const fields: Record<string, unknown> = {
						title: lesson.title,
						description: lesson.description,
						mode: lesson.mode,
						covers: lesson.covers,
						serves: lesson.serves,
						assumes: lesson.assumes,
						'extends-to': lesson['extends-to'],
						'covered-by': lesson['covered-by'],
						'sources-checked': lesson['sources-checked'],
						'review-by': lesson['review-by'],
					};
					for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
					await patch(lesson.id, fields);
				}
			}
			for (const [id, entry] of context.store.entries()) {
				if (!(entry.data as { title?: string }).title) {
					throw new Error(
						`src/content/docs/${id}: page has no title. A lesson page gets it from its lesson YAML, any other page from its frontmatter.`,
					);
				}
			}
		},
	};
}

const conceptSchema = z.object({ id: idSchema, name: z.string(), definition: z.string() }).strict();

const objectiveSchema = z
	.object({
		id: idSchema,
		statement: z.string(),
		level: z.enum(['base', 'expert']),
		behaviors: z.array(z.object({ claim: z.string(), why: z.string(), example: z.string() }).strict()).default([]),
	})
	.strict();

export const collections = {
	docs: defineCollection({ loader: lessonDocsLoader(), schema: docsSchema({ extend: lessonDocsFields }) }),
	/**
	 * Starlight reads this collection for UI-string overrides on every page. Declaring it (even
	 * empty) stops Astro warning that it "does not exist or is empty". Files go in src/content/i18n/.
	 */
	i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
	/** site/src/data/groups.yaml: the two sidebar groups and the area order (spec S09 "Groups"). */
	groups: defineCollection({
		loader: file('./src/data/groups.yaml'),
		schema: z
			.object({
				id: idSchema,
				/** Display order. Collections come back in no fixed order, so the file says it. */
				order: z.number().int().positive(),
				name: z.string(),
				audience: z.string(),
				description: z.string(),
				areas: z.array(idSchema).min(1),
			})
			.strict(),
	}),
	/** site/src/data/areas/<area>/area.yaml (spec S09 "Area file"). */
	areas: defineCollection({
		loader: glob({ pattern: '*/area.yaml', base: './src/data/areas' }),
		schema: z
			.object({
				id: idSchema,
				name: z.string(),
				group: idSchema,
				description: z.string(),
				notes: z.string().optional(),
			})
			.strict(),
	}),
	/** site/src/data/areas/<area>/topics/<topic>.yaml (spec S02 "Storage"). */
	topics: defineCollection({
		loader: glob({ pattern: '*/topics/*.yaml', base: './src/data/areas' }),
		schema: z
			.object({
				id: idSchema,
				area: idSchema,
				name: z.string(),
				definition: z.string(),
				concepts: z.array(conceptSchema),
				links: z
					.object({
						prerequisites: z.array(idSchema).default([]),
						related: z.array(idSchema).default([]),
						specializations: z.array(idSchema).default([]),
					})
					.strict(),
				sources: z.array(z.string()).default([]),
			})
			.strict(),
	}),
	/** site/src/data/areas/<area>/competencies/<competency>.yaml (spec S10 "Competency file"). */
	competencies: defineCollection({
		loader: glob({ pattern: '*/competencies/*.yaml', base: './src/data/areas' }),
		schema: z
			.object({
				id: idSchema,
				area: idSchema,
				statement: z.string(),
				topics: z.array(idSchema).default([]),
				objectives: z.array(objectiveSchema).min(1),
				notes: z.string().optional(),
			})
			.strict(),
	}),
	/** site/src/data/alignment/<framework>.yaml (spec S10 "Alignment"). */
	alignment: defineCollection({
		loader: glob({ pattern: '*.yaml', base: './src/data/alignment' }),
		schema: z
			.object({
				id: idSchema,
				framework: z.string(),
				rows: z
					.array(z.object({ code: z.string(), asks: z.string(), objectives: z.array(idSchema).min(1) }).strict())
					.min(1),
			})
			.strict(),
	}),
	/** site/src/data/areas/<area>/courses/<course>.yaml (spec S11 "Course file"). */
	courses: defineCollection({
		loader: glob({ pattern: '*/courses/*.yaml', base: './src/data/areas' }),
		schema: z
			.object({
				id: idSchema,
				area: idSchema,
				/** The GitHub issue the plan was written in. */
				'plan-issue': z.number().int().positive().optional(),
				notes: z.string().optional(),
				/** The flat form: lesson ids in course order. */
				lessons: z.array(idSchema).min(1).optional(),
				/** The parted form: titled slices of the course, each with its lesson ids in order. */
				parts: z
					.array(
						z.object({ title: z.string(), notes: z.string().optional(), lessons: z.array(idSchema).min(1) }).strict(),
					)
					.min(1)
					.optional(),
			})
			.strict()
			.refine((c) => Boolean(c.lessons) !== Boolean(c.parts), {
				message: 'a course has either `lessons` or `parts`, not both and not neither',
			}),
	}),
	/** site/src/data/areas/<area>/lessons/<lesson>.yaml (spec S11 "Lesson file"). */
	lessonPlans: defineCollection({
		loader: glob({ pattern: '*/lessons/*.yaml', base: './src/data/areas' }),
		schema: lessonPlanSchema,
	}),
	/** site/src/data/bibliography.yaml, keyed by citation key. `type` per spec S01 "Source". */
	bibliography: defineCollection({
		loader: file('./src/data/bibliography.yaml'),
		schema: z.object({
			type: z.enum(['book', 'course', 'paper', 'reference', 'video']),
			title: z.string(),
			container: z.string().nullable().optional(),
			author: z.string().nullable().optional(),
			license: z.string().nullable().optional(),
			url: z.string().nullable().optional(),
		}),
	}),
};
