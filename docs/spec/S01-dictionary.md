# Project dictionary (S01)

**Purpose:** Fix the words this project uses for its content, its knowledge
model, its interactions and its learners, so that pages, the sidebar, the
topic map, the progress record and tutor mode all mean the same thing by the
same name.

**Status:** In progress - page kinds, content units, section kinds, every
interaction type, comfort level (the `more` skills check included), progress,
review and review item, and tutor verbs are implemented (2026-09-20).
Checkpoint phases and alternates are implemented (2026-09-24). Deferred:
path, goal, quiz, project, and the learner's reference.

## Introduction

*AI Training* is an open training suite for getting started with AI,
published as a static site. It has two groups of material: **Foundations**,
written at one level for every knowledge worker, and **Engineering**, for
software engineers who have finished Foundations. Learner state is stored in the
browser only, and the site has no backend.

This spec is the project dictionary. All other specs, pages,
frontmatter fields, and component names use these terms. Each term has
one definition and a list of words not to use in its place. Rules about how
pages are written, how data is stored and what ships when live in later
specs.

## Rules

1. **One word per idea.** Synonyms listed under "don't use" are banned in
   content, code, frontmatter, and the sidebar.
2. **Skill is reserved for agent skills** (Claude Code skills, the Agent
   Skills specification), which are a subject taught here. A learner's
   ability is a **competency**, never a skill.

## Page kinds

A page has one of four kinds, after Diátaxis. Lessons are only ever
`tutorial` or `explanation`.

| Kind          | Serves           | In a course? | Progress? | Definition                                                                                                                       |
| ------------- | ---------------- | ------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tutorial`    | action, study    | yes (lesson) | yes       | The learner does something and sees results early and often. It follows one path only. It explains little and links out instead. |
| `explanation` | cognition, study | yes (lesson) | yes       | Discusses a topic, makes connections, may weigh alternatives and hold opinions. Checkpoints test understanding, not recall.      |
| `how-to`      | action, work     | no           | no        | A recipe for an already competent learner toward a real goal. It may branch and has no checkpoints. Title starts with "How to".  |
| `reference`   | cognition, work  | no           | no        | Austere description, structured like the thing it describes. The topic map pages and the glossary are generated reference.       |

## Content units

These describe what the site contains. Nesting is strict: group > area >
course > lesson > section.

| Term              | Definition                                                                                                                                                                                                                                                                                 | Don't use                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Site**          | The whole thing: *AI Training*.                                                                                                                                                                                                                                                            | portal, academy, suite                 |
| **Group**         | One of two top-level sidebar groups: **Foundations**, written at one level for everyone, and **Engineering**, written for software engineers at two comfort levels.                                                                                                                        | part, half, tier                       |
| **Area**          | One of six subjects. Owns competencies in the topic map and one course today, with room for more later (see "Identifiers").                                                                                                                                                                | topic, module, track, domain           |
| **Course**        | An ordered sequence of lessons inside one area, with stated goals, an end quiz, and optionally a project. Its page is the **lesson graph**. The lessons may be grouped in parts.                                                                                                           | module, training, class                |
| **Part**          | A titled slice of a course: an ordered run of its lessons, usually the lessons covering one topic. A course is either flat or divided into parts.                                                                                                                                          | unit, module, chapter, section         |
| **Lesson**        | One page, 10 to 25 minutes, of kind `tutorial` or `explanation`. The unit of progress and of tutor mode. See "Lesson".                                                                                                                                                                     | chapter, unit, page, module            |
| **Section**       | An H2 of a lesson. A section has a kind. See "Section kinds".                                                                                                                                                                                                                              | screen, step, slide                    |
| **Pitfall**       | A section showing a realistic failure mode right after the teaching it belongs to. It gives the setup and what went wrong, then states the rule.                                                                                                                                           | watch-out, warning, gotcha, caution    |
| **Checkpoint**    | A graded interaction inside a lesson, mapped to one learning objective. See "Checkpoint".                                                                                                                                                                                                  | question, quiz, test, assessment       |
| **Exercise**      | A hands-on task the learner does outside the page, then self-grades against a model answer. One per lesson by default, more in a longer lesson. See "Exercise".                                                                                                                            | assignment, homework, task, variant    |
| **Habit**         | A small task the learner does in their own work, outside the site, and marks done or skipped. Offered after a lesson is finished and brought back on a short fixed schedule. Distinct from an exercise, which is done in the lesson. See "Habit".                                          | micro-habit, nudge, challenge          |
| **Project**       | A larger exercise closing a course, which comes with a specification and a walkthrough.                                                                                                                                                                                                    | capstone, assignment                   |
| **Quiz**          | The end-of-course set of checkpoint questions. Pass means all objectives touched with at most one miss.                                                                                                                                                                                    | exam, test                             |
| **Recap**         | The closing section of a lesson: numbered takeaways, sources, what comes next. See "Recap and the learner's reference".                                                                                                                                                                    | summary, conclusion, `TL;DR`           |
| **Short**         | An optional standalone page of kind `explanation`, going deeper on one concept, linked from a lesson, not in the course sequence. Where `more` depth lives.                                                                                                                                | appendix, deep dive, aside             |
| **Walkthrough**   | A worked example, step by step, either as a section or as the guided solution of a project.                                                                                                                                                                                                | demo                                   |
| **Widget**        | An interactive teaching element with no grade (explorer, simulator, builder).                                                                                                                                                                                                              | interactive, applet, demo              |
| **Prompt block**  | A prompt shown to the learner, paired with a **response block** holding the recorded model response. Both name the model and the month recorded. In release 1 both may instead be marked `illustrative`: written by the author, labeled that way by the component and in the page's prose. | chat transcript, example               |
| **Path**          | An ordered list of lessons across courses for one audience or goal. See "Path".                                                                                                                                                                                                            | track, journey, roadmap, curriculum    |
| **Comfort level** | `less` or `more` comfortable: a learner setting that changes routing, not content. See "Comfort level".                                                                                                                                                                                    | difficulty, beginner/advanced, variant |

### Lesson

- One page, 10 to 25 minutes. Its **mode** is `tutorial` or `explanation`.
- Opens with where we're going, has sections in the body and a recap at
  the end.
- **Covers** one topic and teaches one to five of its concepts. **Serves**
  the learning objectives it teaches toward and **assumes** the objectives it
  relies on. **Extends to** where a confident learner goes next.

### Section kinds

| Kind         | Purpose                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `teaching`   | Exposition. May hold widgets, reflections, terms, prompt blocks, and runnable examples. |
| `pitfall`    | A realistic failure mode right after the teaching it belongs to.                        |
| `checkpoint` | One graded interaction, mapped to one learning objective.                               |
| `exercise`   | The lesson's hands-on task, done outside the page.                                      |
| `recap`      | Numbered takeaways, "You can now..." objectives, sources, what comes next.              |

### Checkpoint

- One graded interaction of one of the interaction types below, mapped to
  exactly one learning objective.

- Can be **passed** or **skipped**. Skipping is recorded and isn't a pass.

- Has a **phase**, which says where the learner meets it:

  | Phase      | Where it is asked                                                                                                                                    |
  | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `first`    | In the lesson body. The default. Counts toward finishing the lesson.                                                                                 |
  | `review`   | On the review page, in place of a `first` checkpoint with the same objective. Hidden on the lesson page.                                             |
  | `practice` | In the lesson's **More practice** section, after the exercise. Graded and recorded, but the lesson can be finished without it and it isn't reviewed. |

- An **alternate** is a checkpoint in the `review` or `practice` phase. It
  shares its objective with at least one `first` checkpoint of the same
  lesson, and those checkpoints are its **siblings**. Don't use: variant,
  version, copy.

- Once its lesson is finished, a `first` checkpoint becomes a **review
  item**. An alternate never becomes one of its own.

### Exercise

- Done outside the page: in a terminal, an editor, or a chat. The learner
  self-grades against a model answer. Honor system.
- One per lesson by default, and a longer lesson may have more (decided
  2026-09-21). Each is written once and may end with a one-line **stretch
  goal** for confident learners. An exercise has no variants.

### Habit

- Done in the learner's own work, at a moment the habit text names. No
  model answer, no grade.
- Zero, one or two per lesson, declared by the author. The learner marks
  each occurrence **done** or **skipped**, and both count the same.
- Comes back on a short fixed schedule after the lesson is finished, then
  retires. The schedule and the storage are set in a later spec.

### Recap and the learner's reference

- The recap closes a lesson with numbered takeaways, the served objectives
  stated as "You can now...", the sources cited on the page, and what comes
  next.
- The learner's **reference** is a client-side view of the topic reference
  pages filtered to the lessons the learner has finished, showing each
  lesson's recap and its canonical example. It unlocks with progress.

### Comfort level

A learner setting, `less` or `more` comfortable. It changes **routing**, the
order and extras a learner is offered, never the content of a page.
Foundations has no comfort levels.

| Level  | Routing effect                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `less` | Inserts the sections that teach a lesson's assumed objectives ahead of the lesson. Keeps the tutor hint-heavy. Reviews come back sooner.  |
| `more` | Offers a skills check at the start of a lesson (one checkpoint per served objective), skips objectives already passed, offers extensions. |

### Path

- An ordered list of lesson ids across courses for one audience or goal.
  Examples: *Knowledge worker*, *Engineer*, *Agent builder*.
- Rendered as a map with three lanes and a "you are here" marker. Paths are
  advisory, and nothing is ever locked.

| Lane      | Holds                                              |
| --------- | -------------------------------------------------- |
| behind    | Lessons teaching assumed objectives not yet passed |
| on target | The path's next lesson                             |
| ahead     | Extensions from finished lessons                   |

## Knowledge model

These describe what the site teaches, independent of how it is laid out.
Topics and concepts are the nodes and edges of the **topic map**; they say
what's taught. Competencies, learning objectives, and behaviors say what a
learner can do afterwards. They're kept outside the map and point into it.
The **competency map** is the page that lists every competency and its
objectives, grouped by the course that teaches them.

| Term                   | Definition                                                                                                                                                                                                     | Don't use                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Concept**            | A named idea a learner can understand and explain (for example *context window* or *prompt injection*). The smallest node. Belongs to exactly one topic. Has a one-paragraph definition and a glossary anchor. | idea, notion                       |
| **Term**               | The marked first mention of a concept in a lesson. Shows the concept's definition on hover and links to its glossary anchor. Later mentions are plain text.                                                    | keyword, tooltip                   |
| **Topic**              | A named cluster of two to eight concepts inside an area, for example *Prompting*, *Tool use*. A noun. The unit a lesson covers and the node that holds links. Has its own reference page.                      | subject, module, theme, competency |
| **Competency**         | Something a learner can *do*, stated as a verb phrase, for example *Verifies AI output before relying on it*. Draws on one or more topics, possibly across areas. Owns three to six learning objectives.       | skill, capability, ability, topic  |
| **Learning objective** | A verb-phrase node under a competency, for example *Writes a task brief with goal, context and done-criteria*, tagged with one level. Owns behaviors. What lessons serve and assume and checkpoints prove.     | goal, outcome, aim, standard       |
| **Behavior**           | One observable statement under a learning objective, written as a triple: claim, why, example. The unit a checkpoint question or a tutor question tests.                                                       | indicator, criterion, skill        |
| **Level**              | `base` or `expert`, tagged on a learning objective. See "Levels".                                                                                                                                              | grade, rank, seniority, maturity   |
| **Goal**               | A learner-chosen destination expressed as a competency at a level, for example "Building agents: base". Paths are the routes to goals.                                                                         | objective, target                  |
| **Link**               | A typed edge between topics. See "Links".                                                                                                                                                                      | dependency, relation, tag          |
| **Source**             | An external resource a lesson or competency points to, typed `book`, `course`, `paper`, `reference` or `video`. Carries license notes when the material may not be copied.                                     | link, resource, reading            |
| **Alignment**          | A row mapping an external framework's item (framework, code, what it asks) to the learning objectives here that address it. Kept per competency.                                                               | standard, crosswalk, mapping       |

### Levels

| Level    | Meaning                                                                         |
| -------- | ------------------------------------------------------------------------------- |
| `base`   | Can do it with guidance and knows the vocabulary.                               |
| `expert` | Does it reliably, explains the trade-offs, and can set the practice for others. |

### Behavior triple

| Part        | Form                                                        |
| ----------- | ----------------------------------------------------------- |
| **Claim**   | One sentence stating what a competent person does or knows. |
| **Why**     | A short reason the claim matters.                           |
| **Example** | One concrete instance (ideally a before and an after).      |

### Links

| Type             | Meaning                                 |
| ---------------- | --------------------------------------- |
| `prerequisite`   | Learn the target topic first            |
| `related`        | See also                                |
| `specialization` | A narrower, deeper version of the topic |

Concepts inherit their topic's links.

## Interaction types

Checkpoint kinds available to authors. Names are the component names.

| Type           | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `predict`      | Show real code or a real command, ask the learner to type what it evaluates to or outputs, then run it to grade. Wrong: mark only; Hint gives a diagnostic nudge, never the answer. Unlimited retries. A checkpoint only when predicting the output demonstrates a served objective; without an objective the same component shows the example ungraded, its output still asserted in CI (S03 "Examples"). Honor-system variant: predict what the agent does, then run it and self-grade. |
| `choice`       | Single-select multiple choice. Rationale per option; wrong picks show their own rationale, never the answer. Unlimited retries. Use it when the answer is a judgment or a decision.                                                                                                                                                                                                                                                                                                       |
| `multi-choice` | Select exactly N correct items with no false positives.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `match`        | Assign one option to each statement row. Per-row feedback, rationale on full pass.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sort`         | Place chips into labeled buckets by drag-and-drop, or click-to-select then click-a-bucket. Keyboard operable.                                                                                                                                                                                                                                                                                                                                                                             |
| `order`        | Put steps in sequence by drag-and-drop or with up and down arrows. A `sort` with one ordered bucket.                                                                                                                                                                                                                                                                                                                                                                                      |
| `scenario`     | A short situation plus a decision as `choice`, with consequences shown per option.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `repair`       | Fix a broken artifact in a textarea, reveal the model answer, then `self-grade`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `self-grade`   | After a reveal: pass, partial, retry. Only pass counts.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `reflection`   | Free text prompt, saved locally, never graded. It belongs in a `teaching` section and isn't a checkpoint.                                                                                                                                                                                                                                                                                                                                                                                 |

## Learners and roles

| Term            | Definition                                                                                                                                                                                 | Don't use               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| **Learner**     | The person using the site.                                                                                                                                                                 | student, user, reader   |
| **Author**      | Someone writing or editing lessons.                                                                                                                                                        | teacher, instructor     |
| **Tutor**       | Claude acting in tutor mode inside the learner's own agent (Claude Code or opencode), reading the lesson from the published site. It gives hints and withholds answers. See "Tutor verbs". | assistant, duck, bot    |
| **Maintainer**  | Someone with commit rights on this repo.                                                                                                                                                   | admin, owner            |
| **Progress**    | The learner's local record of lessons, checkpoints, quizzes, review schedule, comfort level and goals, kept in the browser, and exportable as one file.                                    | state, history, profile |
| **Review**      | A short session of review items due today. Reached from the course page or tutor mode. Items are checkpoints from finished lessons, re-asked. Has **Give Up**, which lessons don't.        | recap, test, drill      |
| **Review item** | One checkpoint in the review schedule, with a stage on a fixed interval ladder and a learner-adjustable frequency.                                                                         | card, flashcard         |

### Tutor verbs

The tutor offers a fixed set of verbs scoped to the current topic or lesson.
Each answer is grounded in the concept definitions and behaviors of that
node, never in general knowledge alone, and cites the node's reference page.

| Verb                     | Does                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| *explain*                | Explains the node from its concept definitions                                                                                                   |
| *key points*             | Lists the node's behaviors as short claims                                                                                                       |
| *explain like I am five* | Re-explains with an everyday analogy                                                                                                             |
| *why it matters*         | States the why of the node's behaviors                                                                                                           |
| *quiz me*                | Asks the node's checkpoints, one at a time                                                                                                       |
| *test me*                | Asks open questions and grades free-text answers against the behaviors                                                                           |
| *critique this*          | Writes a deliberately imperfect answer for a served objective. The learner critiques it against the behaviors, and the tutor grades the critique |

## Identifiers

Each unit is identified by a lowercase kebab-case **slug**. Slugs never
change once published, but display names may. The project doesn't use short codes.

| Unit       | Identifier                                 | Example                                 |
| ---------- | ------------------------------------------ | --------------------------------------- |
| Area       | `<area>`                                   | `safety`                                |
| Course     | `<area>`, the same as its area             | `using-agents`                          |
| Lesson     | `<area>/<lesson>`, equal to the page route | `using-agents/delegating`               |
| Section    | `<lesson id>#<section slug>`               | `using-agents/delegating#fix-the-brief` |
| Checkpoint | Its section id                             | as above                                |
| Topic      | `<area>/<topic>`, a noun slug              | `concepts/prompting`                    |
| Competency | `<area>/<competency>`, verb-led            | `safety/verifies-output`                |
| Objective  | `<competency id>/<objective>`, verb-led    | `safety/verifies-output/checks-claims`  |
| Concept    | `<concept>`; global and unique             | `context-window`                        |

Each area has one course, so a course id is its area id and a lesson id has
two segments (decided 2026-09-20, issue #24). The day an area needs a second
course, the id scheme gains a `<course>` segment and progress records are
migrated with a record version bump per S04. The data files follow the ids:
an area's topics, competencies, courses and lessons are files under
`site/src/data/areas/<area>/`, named by the last segment of their id.

## Open questions

1. Whether `how-to` pages should record `read` progress after all, so a path
   can include one. Leaning: no, because paths hold lessons only.
2. Whether "Foundations" and "Engineering" appear in URLs or only in the
   sidebar. Leaning: sidebar only, and area slugs remain flat.
3. Whether a lesson can belong to more than one path. Leaning: yes, because paths
   are lists of lesson ids, nothing more.
