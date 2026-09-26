# Interactive components (S13)

**Purpose:** Record which interactive components recent Claude Academy
lessons use, map each mechanic to what this site has or could build, and
rank at most five components to build first.

**Status:** Draft

## Introduction

This site has two families of interactive parts. A checkpoint is graded
and has one of the kinds in [S01 "Interaction
types"](S01-dictionary.md#interaction-types). A widget teaches and never
grades ([S03 "Widgets"](S03-lesson-authoring.md#widgets)). Three widgets
exist today: `Sampler` (next-token sampling with a temperature slider),
`InstructionsBuilder` (tick facts about a project and see the
instructions file it produces) and `FormatChecker` (paste an assistant's
answer and see which items a strict import would reject).

Lessons in the `foundations` group can't show terminal work (S03
"Foundations audience"), so their hands-on step is a widget or a prompt
the learner pastes into a chat assistant. Those lessons need more widgets
than the engineering areas do, and this spec says where they could come
from.

Claude Academy is a citation source only (S02 "Source material"). Its
text, quiz questions, images and data are never copied. This spec
follows the same rule for its interface. It describes mechanics in our
own words: what the learner does and what the page does in reply. It
doesn't name Academy prose, questions, options, labels, characters or
example companies.

## Survey

### Method

The survey read 15 lessons from three courses. The human-agent teams
course exists only on Claude Academy and is marked beta. The other two
were chosen because most of their lessons have a widget. Every lesson
was read from a saved copy of its public page, captured on 2026-09-19.
L1 to L4 were saved from `academy.claude.com`. L5 to L15 were saved
from the same courses on Anthropic's earlier course site,
`anthropic.skilljar.com`, and the table gives their `academy.claude.com`
addresses. The copy keeps each widget's controls, labels and
before-state as text, but it doesn't run the widget. The L4 widget
was also opened live, without an account, on 2026-09-26.

So the survey records what a widget shows before the learner acts, what
inputs it takes and what the lesson says it does in reply. It could
observe reload and return-visit behavior only where the page states it.
Where the page is silent, the table says "not stated". The lessons of the
third course embed each widget in a frame that the saved copy didn't
load, so for those lessons the mechanics come from the lesson's own
sentence about the widget.

No page needed an account to show its widgets. A course quiz needs one,
so quizzes are out of this survey. A lesson page says that signing in
saves which lessons are complete.

### Lessons

| #   | Course                                      | Lesson URL                                                                                                | Read                        |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| L1  | Building effective human-agent teams (beta) | `https://academy.claude.com/courses/building-effective-human-agent-teams/why-multiplayer-ai-matters`      | 2026-09-19                  |
| L2  | Building effective human-agent teams (beta) | `https://academy.claude.com/courses/building-effective-human-agent-teams/how-multiplayer-agents-differ`   | 2026-09-19                  |
| L3  | Building effective human-agent teams (beta) | `https://academy.claude.com/courses/building-effective-human-agent-teams/what-a-strong-team-looks-like`   | 2026-09-19                  |
| L4  | Building effective human-agent teams (beta) | `https://academy.claude.com/courses/building-effective-human-agent-teams/organizational-checklist`        | 2026-09-19, live 2026-09-26 |
| L5  | AI capabilities and limitations             | `https://academy.claude.com/courses/ai-capabilities-and-limitations/next-token-prediction`                | 2026-09-19                  |
| L6  | AI capabilities and limitations             | `https://academy.claude.com/courses/ai-capabilities-and-limitations/try-it-out`                           | 2026-09-19                  |
| L7  | AI capabilities and limitations             | `https://academy.claude.com/courses/ai-capabilities-and-limitations/try-it-out-31vzkl2dgi907`             | 2026-09-19                  |
| L8  | AI capabilities and limitations             | `https://academy.claude.com/courses/ai-capabilities-and-limitations/try-it-out-q7hdjm9twcbt`              | 2026-09-19                  |
| L9  | AI capabilities and limitations             | `https://academy.claude.com/courses/ai-capabilities-and-limitations/try-it-out-y02xgkpa6wa7`              | 2026-09-19                  |
| L10 | AI capabilities and limitations             | `https://academy.claude.com/courses/ai-capabilities-and-limitations/when-properties-collide`              | 2026-09-19                  |
| L11 | Deploying Claude Enterprise with confidence | `https://academy.claude.com/courses/deploying-claude-enterprise-with-confidence/owners-and-intake`        | 2026-09-19                  |
| L12 | Deploying Claude Enterprise with confidence | `https://academy.claude.com/courses/deploying-claude-enterprise-with-confidence/prerequisites`            | 2026-09-19                  |
| L13 | Deploying Claude Enterprise with confidence | `https://academy.claude.com/courses/deploying-claude-enterprise-with-confidence/one-organization-or-many` | 2026-09-19                  |
| L14 | Deploying Claude Enterprise with confidence | `https://academy.claude.com/courses/deploying-claude-enterprise-with-confidence/managing-spend`           | 2026-09-19                  |
| L15 | Deploying Claude Enterprise with confidence | `https://academy.claude.com/courses/deploying-claude-enterprise-with-confidence/adoption-signals`         | 2026-09-19                  |

### Components

One row per mechanic. "Gates" says whether the rest of the lesson waits
for the learner to act.

| #   | Mechanic                                      | Lessons       | Before acting                                                               | Inputs                                                                          | Response                                                                                                      | State and reload                                           | Return visit | Result                                                            | Gates                 |
| --- | --------------------------------------------- | ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ | ----------------------------------------------------------------- | --------------------- |
| C1  | Narrated scene player                         | L1 to L4      | A drawing with numbered scenes and a play button                            | Play and pause, previous and next scene, a scrubber, narration on or off, speed | Plays the scenes in order, with a switch between a summary and a transcript                                   | Not stated                                                 | Not stated   | The drawing itself                                                | No                    |
| C2  | Parameter explorer                            | L1, L13       | Counters with their starting values and a drawing                           | A slider, a two-way switch, a three-way choice                                  | Every counter and the drawing update on each change                                                           | Not stated; has a reset button                             | Not stated   | Two or three numbers with labels                                  | No                    |
| C3  | Switch a factor off                           | L2            | Three switches, all on, and a five-step timeline, all good                  | Turn any switch off or on                                                       | Each step of the timeline is marked good or bad from the switches                                             | Not stated                                                 | Not stated   | The marked timeline, one line per step                            | No                    |
| C4  | Assign, then run                              | L3            | Four jobs, each set to the most manual level, and an empty day log          | One of three levels per job, then a run button                                  | Fills a five-day log, each day marked with one of three outcomes                                              | Not stated; has a reset button                             | Not stated   | The log with a legend for the three outcomes                      | No                    |
| C5  | Rating scale to prompt                        | L4            | Five statements with a five-point agreement scale, and a prompt with blanks | One rating per statement                                                        | Fills each rating into the prompt as it is given, and asks for all five before the prompt is complete         | The page says nothing is saved                             | Starts empty | A prompt, and a button that opens it in the vendor's chat product | No                    |
| C6  | Prompt card                                   | L1 to L3      | A prompt with bracketed blanks for the learner's own facts                  | None on the page                                                                | A button opens the prompt in the vendor's chat product                                                        | None                                                       | Same         | The chat product, outside the lesson                              | No                    |
| C7  | Reflection questions                          | L1 to L4, L10 | Two questions at the end of the lesson                                      | None                                                                            | None                                                                                                          | None                                                       | Same         | None                                                              | No                    |
| C8  | Commit a guess, then compare                  | L5            | A scale with a few stops and a lock button                                  | One stop, then lock                                                             | Shows where the guess sits against a typical placement                                                        | Not stated                                                 | Not stated   | The guess and the reference on one scale                          | Yes                   |
| C9  | Next-word game                                | L6            | A sentence start and three candidate words                                  | Pick a word, or start over                                                      | Appends the word and offers the next candidates, later with percentages                                       | Not stated                                                 | Not stated   | The growing sentence                                              | No                    |
| C10 | Build a table step by step                    | L6            | An empty table and a button to add the next input                           | Add one input at a time, or 1, 10, 50 or all at once                            | Adds rows and updates five counters                                                                           | Not stated                                                 | Not stated   | The table and the counters                                        | No                    |
| C11 | Pick a rule, then open the controls           | L6            | Six candidate rules as a single choice, controls hidden                     | One rule, then a button that shows the controls                                 | Shows sliders and a three-way choice that change the sampling, and says which control matches the picked rule | Not stated                                                 | Not stated   | Generated text and a mapping from rule to control                 | Yes, for the controls |
| C12 | Place points on a plane                       | L7            | A grid with two labeled axes and three item chips                           | Select a chip and click a spot; later place a query and set a count             | Draws each point; highlights the nearest items to the query; a third axis in a view the learner can rotate    | Not stated                                                 | Not stated   | The plotted points and the nearest items                          | No                    |
| C13 | Timed recall test                             | L8            | A start button and an empty text box                                        | Watch words appear one at a time, then type what you recall                     | Counts correct words, lists invented ones, and charts recall by position                                      | Not stated; a replay button is marked as spoiling the test | Not stated   | A score out of the total, a list, a chart                         | No                    |
| C14 | Choose an instruction, see the literal result | L9            | Three instruction tabs and a source text                                    | Pick a tab, then press a button                                                 | Shows the literal result of the instruction, then what the writer meant                                       | Not stated                                                 | Not stated   | Two texts side by side per instruction                            | No                    |
| C15 | Drag two cards together                       | L10           | Four cards, each naming one property                                        | Drag any two cards close to each other                                          | Shows the kind of failure that the two properties cause together                                              | Not stated                                                 | Not stated   | A short description of the combined failure                       | No                    |
| C16 | Questionnaire to flags                        | L11           | Questions about the learner's organization                                  | One answer per question                                                         | Flags which of the course's decisions need extra care                                                         | Not stated                                                 | Not stated   | A list of flagged decisions                                       | No                    |
| C17 | Status list to copy out                       | L12           | Six items with no status                                                    | Mark each item done or not yet                                                  | Builds a status summary                                                                                       | Not stated                                                 | Not stated   | A summary the learner copies into their own notes                 | No                    |
| C18 | Choose a response, play it forward            | L14           | A starting situation and a few responses                                    | One response                                                                    | Plays a month forward and shows the effect of that response                                                   | Not stated                                                 | Not stated   | The outcome of the picked response                                | No                    |
| C19 | Trace a number to its causes                  | L15           | A dashboard reading                                                         | Pick the reading to trace                                                       | Lists every cause that could produce it                                                                       | Not stated                                                 | Not stated   | A list of causes                                                  | No                    |

### Notes on the components

**C1, narrated scene player.** Every lesson of the human-agent teams
course opens with one. It is an animated diagram with a transcript, used
in place of a short video. The learner only watches it.

**C2 and C3, explorers.** The learner changes an input and every output
changes at once. There is no right setting. The lesson text before the
widget says what to watch for, and the outputs make the point without a
grade.

**C4, assign then run.** The learner makes a set of choices first and
sees the effect of all of them together. The per-day outcome is feedback
on each choice, and the widget doesn't mark the whole run right or wrong.

**C5, rating scale to prompt (L4).** The learner rates five statements
about their own team on a five-point scale. Each rating is written into
a prompt under the scale as soon as it is given, and a rated statement
shows its number in place of a blank. The prompt refers to the
statements with the lowest ratings. Until all five are rated, a line
under the scale asks for the rest. A button opens the finished prompt in
the vendor's chat product. The page says there is no score and nothing
is saved. The result is the prompt, which the learner takes into a
conversation with the assistant.

```text
+-----------------------------------------------------------+
| statement 1        ( )1  ( )2  ( )3  (•)4  ( )5           |
| statement 2        ( )1  (•)2  ( )3  ( )4  ( )5           |
| ...                                                       |
|  rate the rest to finish the prompt                       |
+-----------------------------------------------------------+
| prompt:  ... statement 1: 4 ... statement 2: 2 ...        |
|          statement 3: - ...                               |
|                                   [ open in assistant ]   |
+-----------------------------------------------------------+
```

**C6 and C7, prompt cards and reflection.** L1 to L3 end with an
exercise that is a prompt card, and L1 to L4 and L10 end with two
reflection questions. The reflection has no text box, so it is a heading
and two questions.

**C8, commit a guess.** The only mechanic in the survey that gates the
page: the rest of the lesson is hidden until the learner locks a guess.
The widget compares the guess with a typical answer and marks nothing
wrong, so a far guess only tells the learner how far off they were.

**C9 to C11, the sampling lesson.** One lesson builds the idea in steps: a
game with suggested words, a table that fills one input at a time, a
choice of rule before the controls appear, and then the controls. The
choice before the controls works like a prediction. The learner commits
to an idea, then sees which control implements it.

**C12, placing points.** The learner places items by what they are about,
then places a question the same way, and the widget highlights the
nearest items. The learner's own placement is the input, so the result
depends on their judgment and has no key.

**C13, timed recall.** The learner is the test subject. The score is real,
it measures the learner's memory, and the chart shows the pattern the
lesson then explains for models.

**C14 and C15, reveal pairs.** Each shows one of a fixed set of outcomes
for a choice the learner makes. There is no wrong choice. Every choice
leads to a reveal.

**C16 to C19, decision workspaces.** The third course is about decisions a
reader makes for their own organization. Its widgets take the reader's
answers about that organization and show a recommendation, a status
summary or the effect of a change. The answers are the reader's facts,
so nothing is graded.

## Catalog

Each mechanic gets one of three fates: it maps to something this site has,
it becomes a new graded checkpoint kind, or it becomes a new ungraded
widget. A new graded kind has to have one defensible answer, fit the
`phase` prop (`first`, `review`, `practice`), have a form of `options`
and `answer` in the checkpoint export, and be gradable on the review
page. A mechanic whose result depends on the learner's own facts or
judgment can't meet that, and it becomes a widget.

| #   | Mechanic                              | Fate                     | Here                                                                                                                                                    |
| --- | ------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Narrated scene player                 | Not built                | A figure with a caption does this job here. An animation adds a script and a transcript to maintain for little learning.                                |
| C2  | Parameter explorer                    | New widget               | `Explorer`, see "Recommendation".                                                                                                                       |
| C3  | Switch a factor off                   | New widget               | `Explorer`, with switches as inputs and a list of marked lines as output.                                                                               |
| C4  | Assign, then run                      | Existing kind            | `Match`: each job is a row, the levels are the options, and each row's `why` is the outcome. Graded when one assignment is defensible.                  |
| C5  | Rating scale to prompt                | New widget               | `SelfCheck`, see "Recommendation". A generalization of `InstructionsBuilder`.                                                                           |
| C6  | Prompt card                           | Existing block           | The `Prompt` block. A copy button is the only gap. A link that opens a vendor's chat product stays out, because a lesson here works with any assistant. |
| C7  | Reflection questions                  | Existing type, not built | S01 `reflection`: free text saved locally, never graded. See "Recommendation".                                                                          |
| C8  | Commit a guess, then compare          | New graded kind          | `Estimate`, see "Recommendation". Graded, because the reference here is a fact with a tolerance and not a typical answer.                               |
| C9  | Next-word game                        | Existing widget          | `Sampler`. A mode that appends the picked token and samples the next one would cover the game.                                                          |
| C10 | Build a table step by step            | Not built                | A table in the page, filled in the order the prose explains it.                                                                                         |
| C11 | Pick a rule, then open the controls   | Existing kind and widget | A `Choice` for the rule (the prediction), then `Sampler` for the controls. No gate: this site doesn't fold a page behind a checkpoint.                  |
| C12 | Place points on a plane               | New widget               | `Plot`: place items and a query on two labeled axes and see the nearest items. Fifth in the ranking.                                                    |
| C13 | Timed recall test                     | Not built                | It measures the learner, not the idea. A `Predict`-style guess about where a model loses a fact in a long input tests the idea directly.                |
| C14 | Choose an instruction, see the result | Existing block           | `Prompt` and `Response` pairs, one per instruction, marked illustrative.                                                                                |
| C15 | Drag two cards together               | Existing kind            | `Match`: each failure is a row, and the options are the pairs.                                                                                          |
| C16 | Questionnaire to flags                | New widget               | `SelfCheck`, with a list of flagged items in place of a prompt.                                                                                         |
| C17 | Status list to copy out               | New widget               | `SelfCheck`, with a two-level scale and a summary to copy.                                                                                              |
| C18 | Choose a response, play it forward    | Existing kind            | `Scenario`: each response is an option with its consequence.                                                                                            |
| C19 | Trace a number to its causes          | Existing kind            | `MultiChoice`: which of these causes could produce the reading.                                                                                         |

## Recommendation

Build them in this order.

1. **`SelfCheck` widget.** Covers C5, C16 and C17, and it is the
   foundations hands-on step the S03 rule asks for: the learner's answers
   become a prompt for their own chat assistant.
2. **`Estimate` checkpoint kind.** Gives foundations lessons a graded
   check with a number, in place of the `Predict` blocks they can't show,
   for example a token count or a price per thousand calls.
3. **`Explorer` widget.** Covers C2 and C3, and lets a foundations lesson
   show what a fixture computes (pages per context window, cost at a
   volume) as inputs and outputs on the page.
4. **`reflection`.** S01 already defines it and nothing implements it,
   and five of the fifteen surveyed lessons (L1 to L4 and L10) end with
   reflection questions.
5. **`Plot` widget.** Covers C12 and fits the retrieval and embeddings
   lessons, where placing by meaning is the idea being taught.

### 1. `SelfCheck`

An ungraded widget. It writes nothing to the progress record, like
every widget.

- **Props:** `statements` (a list of strings), `scale` (a list of
  labels, from two to five, for example `['Missing', 'Done']` or five
  agreement labels), and `template` (the text of the result, with
  `{{ratings}}` where the rated statements go and an optional
  `{{lowest}}` for the statements with the lowest rating). An optional
  `mode` of `prompt` (the default) or `summary` changes only the heading
  of the result.
- **Before acting:** each statement with one radio group per row, and
  the result with every statement marked "not rated yet".
- **Inputs:** one choice per statement. A keyboard moves within a row
  with the arrow keys, as radio groups do.
- **Response:** the result updates on each choice. Until every statement
  has a rating, a line under the rows says how many are left, and
  `{{lowest}}` reads "not known yet".
- **Result:** a `text` block with the filled template and a copy button.
  It has no link to a vendor's product.
- **State:** none. A reload starts empty, and the widget says so in one
  line under the result, so no learner expects it to be kept.
- **Gates:** nothing.
- **Logic:** a DOM-free module `site/src/scripts/self-check-logic.ts`
  with `fill(template, statements, ratings)` and `lowest(statements, ratings)`, under Vitest, and the binding in
  `site/src/scripts/self-check.ts`. One interaction in
  `site/e2e/widgets.spec.ts`: rate every row and read the copied text.

```text
+------------------------------------------------------------+
| Every release has a rollback plan.          ( )1 ... (•)5  |
| Our data rules are written down.            (•)1 ... ( )5  |
|  1 statement left                                          |
+------------------------------------------------------------+
| Prompt for your assistant                          [copy]  |
|  I rated my team on these statements, 1 to 5:              |
|  - Every release has a rollback plan: 5                     |
|  - Our data rules are written down: 1                      |
|  Start with the lowest: Our data rules are written down.   |
+------------------------------------------------------------+
```

### 2. `Estimate`

A graded checkpoint kind. Its props are the common checkpoint props (S03
"Checkpoint props") plus these:

- **`answer`:** the number. It comes from a fixture's output, per the
  "Numbers from fixtures" rule in `docs/agents/writing-a-lesson.md`.
- **`tolerance`:** the band that counts as right, either absolute
  (`{ within: 50 }`) or relative (`{ percent: 20 }`).
- **`unit`, `min`, `max`, `step`:** the input's unit and range.
- **`scale`:** optional. With it, the input is a slider over the range,
  and without it a number box.
- **`why`:** optional, and at most two entries for "too low" and "too
  high". Each says what a guess on that side misses, never the number.

Grading: the learner enters a number and presses Check. A number in the
band passes. Outside it the result says "too low" or "too high", shows
that side's `why`, and allows another try, as `choice` does. After a
pass the checkpoint shows the answer and the learner's guess on one line.

- **Export:** `options` is `{ unit, min, max, step, scale }`, and `answer`
  is `{ value, tolerance }`.
- **Phase:** fits `first`, `review` and `practice` like any kind.
- **Review page:** asks it as it is.
- **Guessability:** a range much wider than the band keeps a middle guess
  from passing. `mise run checkpoints` could fail a band wider than a
  quarter of the range.

A `run` prop, as on `Predict`, would let `mise run examples` assert
`answer` against a fixture. That is the proof a foundations page needs,
and the page never names the fixture.

### 3. `Explorer`

An ungraded widget that shows the outputs of a small pure function of
its inputs.

- **Props:** `inputs`, where each input is a slider, a switch or a
  choice, with a label and a default. `outputs`, each with a label and a
  unit.
- **Logic:** a DOM-free function per explorer, named by a `logic` prop
  and kept under `site/src/scripts/explorers/`, which Vitest covers.
- **Output:** a list of labeled values that updates on each change, and
  a reset button.
- **State:** none.

When a foundations lesson has a fixture, the function computes what the
fixture computes, and a Vitest test compares the two outputs for the
defaults.

### 4. `reflection`

The S01 type as defined: one question and a text box, saved in the
progress record under the lesson and never graded. It needs a field in
the S04 progress record, so it waits for a decision on that record
(open question 3). Until then the lesson's closing question in
`Exercise` does the same job without saving.

### 5. `Plot`

An ungraded widget: two labeled axes, a few items to place by click or
by keyboard (arrow keys move the selected item), then a query to place,
and a count `k`. The nearest `k` items are highlighted, by straight-line
distance. It has no 3D view and keeps no state between visits.

## Related specs

- [S01 Project dictionary](S01-dictionary.md): "Interaction types", the
  checkpoint kinds and `reflection`.
- [S02 Topic map and competencies](S02-topic-map.md): "Source material",
  the rule that no Academy text or data is copied.
- [S03 Lesson authoring](S03-lesson-authoring.md): "Widgets",
  "Foundations audience", "Checkpoint props" and "Checkpoint export".
- [S04 Progress record](S04-progress-record.md): where `reflection`
  would store its text.
- [S05 Spaced review](S05-spaced-review.md): how the review page asks a
  graded kind such as `Estimate`.

## Open questions

1. Whether the rating scale to prompt (C5) should become a graded kind.
   Leaning: no. A self-rating has no defensible answer, and the review
   page couldn't grade it, so `SelfCheck` is a widget.
2. Whether `Estimate` should take `run` and assert its answer against a
   fixture. Leaning: yes, because it gives foundations pages a fixture
   proof on the page's own number.
3. Whether `reflection` text goes into the progress record, which means
   a version bump in S04, or stays out of it. Leaning: into the record,
   so an export carries it.
4. The signed-in behavior of the surveyed widgets (whether a rating or a
   placement is kept for a learner with an account) wasn't observed,
   because the survey didn't use an account. Leaning: it doesn't change the
   catalog, because this site doesn't keep widget state.

## Out of scope

- Building any component. Each ranked component gets its own issue after
  the maintainer reads this spec.
- Changes to S01 "Interaction types" and S03 "Widgets". They follow when
  a component is built.
