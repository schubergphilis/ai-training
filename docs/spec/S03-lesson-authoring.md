# Lesson authoring (S03)

**Purpose:** Fix the rules every lesson page follows: how its kind is chosen,
what it contains and declares, how examples, citations, terms, and prompts are
written, and how checkpoints, exercises, and widgets behave.

**Status:** Implemented - lesson anatomy, frontmatter, the checkpoint,
pitfall, exercise, recap, prompt and response components, widgets, the
example runner in CI, the citation plugin (`(@key)`, with a References
section appended to the citing page) and the term remark plugin (first
mention of a covered topic's concept) are in place (2026-09-20). The
bibliography is YAML at `site/src/data/bibliography.yaml`, and each entry
carries the S01 source type. Changed after the release 1
review: checkpoints are "at least one per served objective" instead of
exactly one, because tutorial mode also demands a `predict` for every
example that runs; and prompt blocks may be marked `illustrative` in
release 1 (see "Examples"). Checkpoints name the concept ids they
exercise (`concepts`, required) and an optional standalone `context`, and
the build writes every checkpoint to one `checkpoints.json` that CI checks
(2026-09-20, see "Checkpoints" and "Checkpoint export"). A `predict` is a
checkpoint only when predicting the output demonstrates a served objective;
a `Predict` without `objective` is an ungraded example whose output CI
still asserts (2026-09-20, see "Examples"). A lesson in the `foundations`
group keeps code fences, `Predict run` and terminal instructions off the
page, and `mise run data` checks it (2026-09-24, see "Foundations audience").
Checkpoints take a `phase` (`first`, `review` or `practice`) and a lesson
may have a "More practice" section between the exercise and the recap. The
export lists the alternates and `mise run checkpoints` checks them
(2026-09-24, see "Checkpoints", "Checkpoint props" and "More practice").

## Introduction

Terms are per the [project dictionary](S01-dictionary.md). The topics a
lesson covers and the objectives it serves and assumes come from the
[topic map](S02-topic-map.md). This spec is written for authors; the
components that render a lesson implement it.

## Choosing the page kind

A page has one of the four kinds. Choose the kind with the Diátaxis
compass: does the page serve **action** (doing) or **cognition** (knowing),
and does it serve **study** (acquiring a craft) or **work** (applying it)?

|               | Study         | Work        |
| ------------- | ------------- | ----------- |
| **Action**    | `tutorial`    | `how-to`    |
| **Cognition** | `explanation` | `reference` |

- Lessons are only ever `tutorial` or `explanation`; the choice is the
  lesson's **mode**.
- How-to and reference pages serve learners at work and stay outside
  courses and paths. The sidebar gets a how-to or reference section once
  there is a page to put in it.
- The topic map pages and the glossary are generated reference; authors do
  not write them by hand.

## Lesson anatomy

| Part              | Rule                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Length            | 10 to 25 minutes.                                                                                                                                                       |
| Opener            | Where we're going, in the present tense: "In this lesson we build...". Never `you will learn`.                                                                          |
| Sections          | H2s, each with a section kind. Body sections alternate teaching with pitfalls and checkpoints.                                                                          |
| Pitfall           | At least one, placed right after the teaching it belongs to. It gives the setup and what went wrong, then states the rule. Short in tutorial mode.                      |
| Checkpoints       | At least one per served objective. A checkpoint's `objective` names the one objective it evidences, and its `concepts` the concept ids it exercises.                    |
| Exercise          | One by default. A longer lesson may have more; the lesson file (S11) lists them.                                                                                        |
| More practice     | Optional, between the exercise and the recap: zero to three `practice` checkpoints. See "More practice".                                                                |
| Recap             | Numbered takeaways and the served objectives as "You can now...". Where to go next is the page footer's previous/next.                                                  |
| Habit             | Zero, one or two, after the recap. A small task in the learner's own work with a stable `id`. [S07](S07-habits.md) sets its schedule and storage.                       |
| Canonical example | The one example the learner's reference shows for the lesson: the `Predict` or `Prompt` block with `canonical`, or the first of either in source order. See "Examples". |

Objectives are frontmatter data that drive checkpoints, routing, and tutor
mode. They're never printed as a `you will learn` list; the opener and the
recap carry that role.

### Frontmatter

Since 2026-09-21 these fields are written in the lesson's data file,
`site/src/data/areas/<area>/lessons/<lesson>.yaml`, and the build copies
them onto the page (S11 "Lesson page"). The MDX file carries no frontmatter
of its own. The table describes the fields as the components see them.

| Field             | Holds                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`           | The display title                                                                                                                                                                                                                                            |
| `mode`            | `tutorial` or `explanation`                                                                                                                                                                                                                                  |
| `covers`          | The topic ids the lesson teaches                                                                                                                                                                                                                             |
| `serves`          | The learning objective ids the lesson teaches toward; each gets at least one checkpoint                                                                                                                                                                      |
| `assumes`         | The learning objective ids the lesson relies on, each pointing at the lesson section that teaches it                                                                                                                                                         |
| `extends-to`      | Where a confident learner goes next: the next lesson, a specialization topic, a short, or an `https://` URL under the `url` of a bibliography entry, for example a Claude Academy course. An external entry renders as a plain link marked "(external link)" |
| `sources-checked` | Optional. The day the sources were last checked, shown in the footer's review line with `review-by`. Starlight's `lastUpdated` is the page's last git commit date and moves on every edit. A lesson with `review-by` shows both lines, the review line first |
| `review-by`       | Optional. The date by which the sources must be checked again, for a lesson whose facts move (a law, a product). The footer shows it as a review line with `sources-checked`, next to "Last updated". The pair moves together, apart from `lastUpdated`      |

## Tutorial mode

Tutorial-mode lessons follow these rules:

- **Visible results early and often.** Every step produces something the
  learner can see.
- **Keep the narrative of the expected.** Show expected output and flag the
  likely signs of going wrong. Pitfall sections do this.
- **Minimize explanation.** Link to an explanation page or a short instead.
- **One path.** The lesson doesn't offer choices. Differentiation happens through routing between
  lessons, never through branches inside one.
- **Safe and repeatable.** A contrived setting the learner can reset.
- **Concrete and particular.** The general emerges from the specific.
- **Fixed rhythm.** One or two short paragraphs, then one example the
  learner runs or predicts. An example that reuses state from an earlier
  example says so.

## Explanation mode

Explanation-mode lessons may discuss, compare, and hold opinions. Their
checkpoints test understanding, not recall; `choice` and `scenario` are
allowed because nothing runs. The anatomy above still applies, including the
pitfall and the exercise.

## Examples

- **Every code example is real.** It runs, and its shown output is asserted
  in CI. An example that can't run (an agent transcript, a screenshot) is
  marked that way in the page. Until the example runner exists the rule still
  holds: an example that can't run says so.
- **An example that runs has its output asserted in CI, and only some
  examples are checkpoints** (decided 2026-09-20). The `Predict` component does
  both jobs. With an `objective` it is a `predict` checkpoint: use it when
  predicting the output demonstrates a served objective, as in a lesson
  that teaches the code being run. Without an `objective` it is an
  ungraded example: the page shows the command and its output, CI runs
  the fixture and asserts the output, and the block isn't a checkpoint
  anywhere: it has no progress record, review item, sidebar count, or
  export entry. Use the ungraded form for a command the learner runs to gather
  evidence when guessing its output would grade something the lesson
  doesn't serve, such as reading Python in a lesson about running an
  agent. The checkpoints of such a lesson test the served behaviors
  instead (a `scenario` on a permissions prompt, a `sort` on what goes in
  the brief). Before this date the rule read "prefer `predict` for any
  example that runs", which turned every shell command in a tutorial into
  a graded code-reading question. Use `choice` when the answer is a judgment
  or a decision.
- **Fixtures are Python.** Every runnable example under `site/examples/` is
  a `.py` script run with `python3`, with no bash fixtures (decided
  2026-09-20). One language and one interpreter keep the runner simple and
  keep bash idiom (`set -euo pipefail`, `trap`) out of the fixtures. The
  runner rejects any other file type.
- **Fixtures run on Python 3.9 and use the standard library only.** The
  fixture is what the learner runs, and the `predict` answer must match on
  their machine. A stock macOS `python3` is 3.9. A learner types
  `python3` and gets what the lesson shows without installing anything.
  The repo pins both the current Python and 3.9 in `.mise.toml`, CI runs
  every fixture on both and asserts the same stdout, and ruff checks the
  fixtures at the 3.9 target. No lesson asks for a `pip install`.
- **First `python3` on a fresh Mac may prompt for the Xcode command-line
  tools.** The lesson that first asks the learner to run `python3` says so,
  so the prompt reads as expected rather than as a failure.
- **Prompts and responses are recorded, never live.** A prompt block and
  its response block name the model and the month the response was
  recorded. Outputs live in the repo and are never fetched from a
  third-party playground or embed at view time. Live embeds die with their
  vendors and undated outputs age badly.
- **Illustrative transcripts are allowed in release 1, marked.** Until
  transcripts are recorded, an author may write one and set
  `model="illustrative" recorded="illustrative"`. The component must label
  the block as illustrative, and the page must say so in prose next to it
  ("the transcript is illustrative..."). A block that looks like a
  recording but isn't one is a defect.
- **One example per lesson is canonical.** The learner's reference (S02
  "Learner's reference") shows one example per finished lesson next to its
  recap takeaways. By default that is the first `Predict` or `Prompt` block
  in source order, whichever comes first, with the `Response` that follows a
  `Prompt`. An author who wants another block sets `canonical` on it, and
  at most one block per lesson carries it. The block is read from the
  lesson source at build time, so it needs no extra markup in the page.
- **Prompting walkthroughs follow one arc:** the naive attempt, the failure
  it produces, one change at a time (technique, order, wording), then
  compare.

## Citations and terms

- **Sources are cited by key.** `(@key)` in Markdown resolves against
  one bibliography file in the repo and renders as a numbered reference.
  A page that cites gets a References section after its content, one entry
  per cited key, and an unknown key fails the build. The full sources list
  of a topic is on the topic page. Concept definitions, recaps, and
  behaviors cite papers and vendor documentation this way, never as bare
  inline URLs.
- **A paper is a source of type `paper`.** Its key is the first author's
  surname and the year (`Liu 2024`), its `author` names the authors (the
  first three and "and N others" past that), its `container` is the venue
  with volume, year and pages, and its `url` is the publisher's or the ACL
  Anthology page, with the arXiv page only when no published version
  exists. The reference list renders these fields as it does for any other
  source, so the entry shows authors, venue, year and a stable link.
- **The first mention of a concept is a term.** A remark plugin marks it in
  Markdown rather than a component, so plain Markdown stays plain. The term
  renders the concept's glossary definition on hover and links to its
  glossary anchor. Later mentions are plain text.

## Checkpoints

- A hint is a diagnostic question or nudge, never the answer.
- The answer is never revealed inside a lesson. Wrong `choice` picks show
  their own rationale; wrong `predict` answers are only marked wrong.
- Grading is all-or-nothing with unlimited retries. Only a pass counts.
- Skip is always available, is recorded, and is visibly distinct from a
  pass.
- Every checkpoint is keyboard operable and announces its feedback to
  assistive technology.
- A checkpoint's id is its section id. Authors keep section slugs stable
  once published, because progress and review items hang off them. The
  right-hand "On this page" menu lists the checkpoints and the ungraded
  examples of the page in two groups after the headings, each entry a link
  to its section id (decided 2026-09-24, #220), and each title shows the same
  hover permalink a heading has. Each entry and each permalink is `#<id>`,
  so an id is unique across the checkpoints and examples of a page, and the
  checkpoint reader rejects a page that repeats one.
- A checkpoint is a standalone item as well as a section. It names the
  concepts it exercises, and where its stem depends on the page it has a
  one-paragraph context. A review page or a tutor can then ask it outside
  the lesson.
- A `choice`, `scenario` or `multi-choice` item isn't answerable from the
  look of its options. The options are of similar length and specificity,
  every distractor is a plausible misconception with its own `why` or
  `consequence`, no option is "all of the above" or "none of the above",
  a hedge (`usually`, `may`, `depends`) never appears in the key alone,
  and the key's position varies across a lesson. CI (`mise run checkpoints`) fails an item on four cues: `longest` (the key is more
  than 40 percent longer than the longest distractor, or for `multi-choice` the
  mean key is that much longer than the mean distractor), `hedge` (only the
  key hedges), `echo` (only the key repeats a content word of the stem)
  and `fixed-position` (in a lesson with four or more `choice`/`scenario`
  items, one index holds the key in more than three quarters of them,
  counting every item, and an exempt item is never a hit).
  `guessable="reason"` exempts an item. The check prints every reason and
  fails on an exemption that no cue needs, so a stale one is removed.
- A checkpoint has a `phase` (S01 "Checkpoint"). A `first` checkpoint is
  the lesson's own and renders where the author puts it. A `review`
  alternate is written in the same page and is in the page's markup but
  hidden: it has no `data-checkpoint` attribute, so nothing on the lesson
  page binds it, counts it, numbers it or lists it in the "On this page"
  menu, and the review page takes it from there. A `practice` alternate
  renders in the "More practice" section.
- Siblings are matched by objective: an alternate's siblings are the
  `first` checkpoints of its lesson with the same `objective`, and the
  review page may ask a `review` alternate for any of them. Nothing else
  ties an alternate to one checkpoint, and its position in the source
  doesn't matter to the site.
- Authoring rules, which no check enforces: an alternate asks about the
  idea that every `first` checkpoint on its objective shares, so it fits
  whichever of them it replaces, and it goes after the last of them in
  the source. An objective whose `first` checkpoints test different ideas
  gets an alternate on the shared idea, or its checkpoints get separate
  objectives.
- Every graded `first` checkpoint should be matched by a `review`
  alternate where the objective allows it: an objective has at least as
  many gradable `review` alternates as reviewable `first` checkpoints,
  each of a different interaction type than the checkpoints where that
  fits. A review then tests the idea rather than recognition of one
  wording. A `review` alternate is gradable in a review, which rules out a
  `repair`, an honor-system `predict` and `review={false}`.
- `mise run checkpoints` fails a `practice` alternate without a `first`
  sibling, a `review` alternate without a reviewable `first` sibling (the
  review page would never ask it) and a `review` alternate that isn't
  gradable. It warns, without failing, per lesson, on each objective with
  fewer `review` alternates than reviewable `first` checkpoints.
  Alternates pass the same guessability check as every item.

### Checkpoint props

Every checkpoint kind takes these. Kind-specific props (`options`,
`steps`, `buckets`, `answer`, `broken` and so on) are in the authoring
guide.

| Prop        | Required | Holds                                                                                                                                                                            |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | yes      | Stable slug, unique in the page. The section id and the progress key.                                                                                                            |
| `objective` | yes      | The one learning objective id the checkpoint evidences.                                                                                                                          |
| `concepts`  | yes      | The S02 concept ids the checkpoint exercises, at least one, from any topic. The build fails on an unknown id. Rendered as `data-concepts`.                                       |
| `title`     | yes      | The heading.                                                                                                                                                                     |
| `hint`      | yes      | A diagnostic question or nudge, never the answer.                                                                                                                                |
| `context`   | no       | One plain paragraph that makes the item readable outside its lesson. Hidden on the lesson page, shown above the stem on the review page, included in the export.                 |
| `review`    | no       | `false` opts the checkpoint out of review (spec S05). Default `true`.                                                                                                            |
| `revision`  | no       | Bumped when the answer changes, which resets outdated review items (spec S05). Default 1. An alternate's `revision` resets nothing: the item is keyed on the `first` checkpoint. |
| `guessable` | no       | `"<cue>: reason"`: the cues a `choice`, `scenario` or `multi-choice` item may trip, and why. The check prints it and fails on a named cue that doesn't trip.                     |
| `phase`     | no       | `first`, `review` or `practice` (S01 "Checkpoint"). Default `first`. A `practice` checkpoint sits inside `<MorePractice>`, and every other one outside it.                       |

Difficulty has no tag. The `objective` has a level in S02, so difficulty
is derivable.

## Checkpoint export

The build writes every checkpoint of every lesson to one file,
`data/checkpoints.json` under the site base, from the content collections.
The browser doesn't read it. A consumer outside the page, first the tutor,
reads it to ask a checkpoint as a standalone item.

- One object, `{ "version": 1, "items": [...] }`, items in lesson order
  then page order. `version` changes when a field changes meaning.
- Each item has `id`, `lesson`, `kind`, `objective`, `concepts`, `context`
  (`null` when absent), `stem` (the children as Markdown source, with each `(@key)` citation
  outside code rendered as the lesson bundle's `prose` renders it, S08),
  `options`, `answer`, `hint`, `reviewable`, `revision`, `guessable`
  (the exemption reason, `null` when absent) and `phase`. Alternates are
  items like any other, in page order. `reviewable` is whether finishing
  the lesson schedules a `first` item, whether the review page can serve a
  `review` item, and always `false` for a `practice` item.
- `options` is what the learner is shown and `answer` the correct response,
  in the form of the kind: `choice` and `scenario` list the option texts
  and the correct text; `multi-choice` lists the option texts and the
  correct texts; `match` has the options and the statements, and the answer
  pairs each statement with its option; `order` lists the steps sorted
  alphabetically, and the answer is the steps in order; `sort` has the
  buckets and the item texts, and the answer pairs each item with its
  bucket; `predict` has no options and the answer string (`null` for the
  honor-system variant); `repair` has the broken text as options and the
  model answer as answer.
- CI checks the built file: it parses, every checkpoint in every lesson
  page appears once, no item lacks a page, every field is present with its
  type, and every concept id is a concept in the topic YAML. The same
  check runs the guessability heuristics of "Checkpoints" over the `choice`,
  `scenario` and `multi-choice` items, and the alternate rules of
  "Checkpoints": every `practice` item has a `first` item with the same
  objective in its lesson, every `review` item has a reviewable one, and
  every `review` item is `reviewable`.

## Exercises

- Done outside the page: in a terminal, an editor, or a chat.
- Runs in a contrived, resettable setting (a fixture repository, a
  sandbox), never in the learner's own project.
- The learner self-grades against a model answer. Honor system.
- One per lesson by default, and a longer lesson may have more. Each is
  written once, optionally ending with a one-line stretch goal. No variants
  per comfort level.
- Small, and it produces something the learner can look at: a screenshot,
  a diff, a short table, a few lines of text. Uptake of optional exercises
  drops sharply with size, so an exercise that asks for a matrix or a
  one-pager is a stretch goal, never the exercise.
- The text says what to produce and how big it is, then in one sentence
  why: what the learner can do afterwards, or what it protects them from.
  It closes with one reflection question, which is also what the model
  answer speaks to.
- An exercise is either a *do* (run, build, try, automate) or a *judge*
  (compare, measure, assess, red-team). Both are the one `Exercise` kind.
  The distinction is authoring guidance, so a course doesn't end up with
  only one flavor by accident.

## More practice

A lesson may offer extra checkpoints for a learner who wants more than the
body asks for. They're in one `<MorePractice>` block, which renders as a
"More practice" H2 section.

- The block comes after the `<Exercise>` and before the `<Recap>`, once per
  page at most, and holds one to three checkpoints, each with
  `phase="practice"`. The page build fails on a `practice` checkpoint
  outside the block, a checkpoint of another phase inside it, an empty
  block, a second block, or a block before the exercise or after the recap.
- A `practice` checkpoint serves an objective of the lesson that a `first`
  checkpoint also serves. It is graded like any checkpoint, with a Hint and
  unlimited retries, and without Skip, because nothing waits on it.
- Its result is recorded in the progress record under its own key. It never
  counts toward finishing the lesson, toward any progress figure, or toward
  the routing cards, and it never becomes a review item.
- The lesson bundle's prose shows the section as a `## More practice`
  heading with its checkpoints, and leaves out the hidden `review`
  alternates.

## Foundations audience

The `foundations` group (S09 "Groups": the `concepts`, `safety` and
`using-agents` areas) is written for every knowledge worker, and a
lesson in it must be one a reader can follow without programming and without
a terminal, git or a developer tool (decided 2026-09-24, #236).
Any hands-on step is a browser widget on the page or a plain-language
prompt the learner pastes into a chat assistant. Engineering areas keep
the freedom the rest of this spec gives them.

A runnable fixture under `site/examples/` may still back a claim as CI
proof (see "Examples"). The foundations page keeps it out of sight: the
learner never sees its name and is never asked to run it. The page may
quote a command or a file name in an inline code span, and may show
output in a `text` fence.

`mise run data` (`site/scripts/lib/data.mjs`, `checkFoundationsAudience`)
fails a foundations lesson page that contains any of these, and reports
the file, the line and what it matched:

- a `<Predict run=...>` tag;
- a fenced block tagged `sh`, `bash`, `shell`, `python` or `json`, or an
  alias a highlighter accepts for the same language (`zsh`, `console`,
  `py`);
- the words `terminal`, `python3` or `git clone`, in any casing, outside
  an inline code span or a fence.

A `<Predict run=...>` inside a `text` fence or an MDX comment is quoted,
not run, and passes.

`FOUNDATIONS_EXEMPT` in `data.mjs` lists the lessons written before the
rule, one line each with the issue that rewrites it (#237, #238 and #284
as of 2026-09-24). Every entry is one full lesson id. The list shrinks to
zero as those land: a listed lesson that the check would pass is a stale
entry, and the check fails on it until the line is removed.

## Widgets

- A widget teaches and never grades.
- Widgets sit in a `class="not-content"` container so the page styles do
  not apply to them.
- Widget scripts never emit a literal `</script>` or `</pre>` inside a JS
  string, because it breaks the Markdown formatter and the renderer.

## Related specs

- [S01 Project dictionary](S01-dictionary.md): page kinds, section kinds,
  interaction types, term, prompt block.
- [S02 Topic map and competencies](S02-topic-map.md): the topic and
  objective ids a lesson declares, and how `assumes` and `extends-to` route.

## Open questions

1. Whether explanation-mode lessons may skip the exercise when the topic
   has nothing to do by hand. Leaning: no; a reflection-style exercise is
   still an exercise.
2. ~~Where the bibliography file is stored and in what format (BibTeX or
   YAML).~~ Decided 2026-09-20: YAML at `site/src/data/bibliography.yaml`,
   keyed as in S02 "Source material", validated as a content collection.
