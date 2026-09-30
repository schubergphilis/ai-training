# Specs (000)

This document is the entry point for the *AI Training* specifications.

Specs are the durable design record of the site: what it contains, what it
teaches, how lessons are written, how learning is recorded and reviewed, and
what ships. Each spec reads on its own.

## Spec index

| #   | Title                                                       | Purpose                                                                                                                                                                                                                                             | Status                                                                                                                                                  |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | [Project dictionary](S01-dictionary.md)                     | Fix the words this project uses for its content, its knowledge model, its interactions and its learners, so that every page, data file and component means the same thing by the same name.                                                         | In progress - core terms implemented 2026-09-20; path, goal, quiz, project, learner's reference deferred                                                |
| S02 | [Topic map and competencies](S02-topic-map.md)              | Name what the site teaches (topics and concepts, with prerequisite links) and what a learner should be able to do afterwards (competencies, objectives, behaviors). Say how the map differentiates between learners.                                | In progress - data, map, topic and competency pages, lesson graph, behaviors and alignment rows implemented 2026-09-20; drawer, lanes, quizzes deferred |
| S03 | [Lesson authoring](S03-lesson-authoring.md)                 | Fix the rules every lesson page follows: page kind, anatomy and frontmatter, examples, citations, terms and prompts, checkpoints, exercises, and widgets.                                                                                           | In progress - anatomy, components, example runner implemented 2026-09-20; citation and term plugins deferred                                            |
| S04 | [Progress record](S04-progress-record.md)                   | Define the learner's progress record: what it stores, where it lives, how it is versioned, and how it moves between browsers.                                                                                                                       | In progress - record, export, import, reset 2026-09-20; version 3 with habits 2026-09-24; goals and quizzes have no UI                                  |
| S05 | [Spaced review](S05-spaced-review.md)                       | Define how the site brings a learner back to what they learned, without a backend: which items are reviewed, on what schedule, where reviews surface, and what's stored.                                                                            | In progress - schedule, review page, controls, due counts implemented 2026-09-20; alternates 2026-09-24; failed-twice routing deferred                  |
| S07 | [Habits](S07-habits.md)                                     | Define the habit layer: small tasks a learner does in their own work after finishing a lesson, on what days the site brings them back, where they surface, and what the progress record stores about them.                                          | Implemented 2026-09-24 (#67) - component, record version 3, review and progress pages, tutor opener                                                     |
| S08 | [Tutor skill](S08-tutor-skill.md)                           | Define how a learner gets the tutor into their own agent and how the tutor gets the lesson: a thin installed skill that fetches its instructions and a per-lesson bundle from the published site, with the GitHub Pages deploy as the publish step. | In progress - bundles implemented 2026-09-24 (#68); instruction file, page block and getting-started page not yet                                       |
| S09 | [Area authoring](S09-area-authoring.md)                     | Fix how a group and an area are declared as data: the top of the data tree, which file holds which fact, what derives from the directory tree, and what the check rejects.                                                                          | Implemented (2026-09-21)                                                                                                                                |
| S10 | [Competency authoring](S10-competency-authoring.md)         | Fix how a competency, its objectives and behaviors, and the alignment rows are written as data: one file per competency inside its area, one file per framework for the rows.                                                                       | Implemented (2026-09-21)                                                                                                                                |
| S11 | [Course and lesson plan authoring](S11-course-authoring.md) | Fix how a course and every lesson in it are declared as data: the course file that orders lessons flat or in parts, the lesson file that holds the plan and the page frontmatter, and what the check rejects.                                       | Implemented (2026-09-21)                                                                                                                                |
| S12 | [Agent-readable site](S12-agent-readable-site.md)           | Fix what the published site offers an AI agent: a Markdown alternate of each content page, `llms.txt` and `llms-full.txt`, the data tree as JSON under `/data/`, and the stance on crawlers.                                                        | Implemented (2026-10-01) - Markdown alternates (#499), `llms.txt` and `llms-full.txt` (#500), data tree as JSON (#501)                                  |
| S13 | [Interactive components](S13-interactive-components.md)     | Record which interactive components recent Claude Academy lessons use, map each mechanic to what this site has or could build, and rank at most five components to build first.                                                                     | Draft                                                                                                                                                   |
| S14 | [Visual identity](S14-visual-identity.md)                   | Fix how the site looks next to the organization site and the learning platform that deep links to its lessons, and which parts of the brand the open repository takes and leaves out.                                                               | Implemented (2026-09-30)                                                                                                                                |

S06 (Release 1) was an implementation plan rather than a design record. It
was removed on 2026-09-20 when release 1 shipped, and its number is retired.

## Naming scheme

- Spec files are named `SNN-<slug>.md`, for example `S01-dictionary.md`.
- Numbers are assigned in order, starting at 1, zero-padded to two digits.
  Once a spec is past `Draft`, its number is never reused or changed.
- The slug is lowercase kebab-case and may change if the title changes.
- This index is `000-specs.md`.

## Reading order and cross-references

- Specs are numbered in dependency order. A spec may refer to a
  lower-numbered spec and must not refer forward to a higher-numbered one.
  When a later spec needs a term or rule, it links back; when an earlier
  spec would need a later detail, it states only what it needs and leaves
  the detail to the later spec without naming it.
- Specs use the terms of [S01 Project dictionary](S01-dictionary.md).
  The dictionary defines words; rules about writing, storing, and shipping
  belong in the later specs.
- Cross-references are relative links with the spec's title, for example
  `[project dictionary](S01-dictionary.md)`. Inside tables, use the number:
  `[S01](S01-dictionary.md)`.
- Specs must not depend on a plan, an issue or an
  exploration note to be understood. Copy the rule, concept, or idea into
  the spec. Describe a mechanism as this project does it, not as the source
  it was borrowed from does it.

## Structure of a spec

1. `# Title (SNN)`
2. `**Purpose:**` one or two sentences saying what the spec decides.
3. `**Status:**` per the convention below.
4. `## Introduction`: the context a reader needs and the earlier specs it
   builds on.
5. The body: headers and subheaders; tables and lists are preferred over
   long paragraphs. A worked example wherever a rule is easy to misread.
6. `## Related specs`: links back to the lower-numbered specs relied on
   (omitted in S01).
7. `## Open questions`: numbered, each with the current leaning.
8. `## Out of scope`, optional.

## Status convention

The `**Status:**` line uses one of these forms. The matching row in the
index above mirrors the same string.

| Form                                            | Meaning                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Draft`                                         | Design still in flux                                                                   |
| `In progress - <what has shipped>`              | Partial implementation; say what has shipped and what's deferred                       |
| `Accepted - <note>`                             | Design accepted, no code yet                                                           |
| `Implemented (YYYY-MM-DD)`                      | Shipped; the date is the commit date of the last implementing commit                   |
| `Superseded by [SNN](SNN-slug.md) (YYYY-MM-DD)` | Replaced by a later spec; keep the file and add a short "Superseded" note near the top |

## How to add a spec

1. Check `docs/spec/` for a spec that already covers the feature. Amend it
   rather than adding a new one.
2. Pick the next free number and create `SNN-<slug>.md` following the structure
   above.
3. Add a row to the spec index in this file.
4. Commit with a `docs(spec):` prefix.
