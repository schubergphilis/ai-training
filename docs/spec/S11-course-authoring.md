# Course and lesson plan authoring (S11)

**Purpose:** Fix how a course and every lesson in it, written or not, are
declared as data: the course file that orders the lessons, flat or in parts,
the lesson file that holds everything a plan says about one lesson, how the
lesson page gets its frontmatter from that file, and what the check rejects.

**Status:** Implemented (2026-09-21). Course files with parts, one lesson
file per lesson, the docs loader that fills a lesson page from its file, the
lesson graph and plan table, the generated sidebar, and the `mise run data`
check are in place.

## Introduction

Terms are per the [project dictionary](S01-dictionary.md): a **course** is an
ordered sequence of lessons inside one area, a **part** is a titled slice of
a course, and a **lesson** is one page of kind `tutorial` or `explanation`.
The rules a lesson page follows are in [S03](S03-lesson-authoring.md); the
topic and objective ids it declares come from [S02](S02-topic-map.md), and
[S09](S09-area-authoring.md) defines the area directory that holds its files.

Before 2026-09-21 one file per area held every lesson as a list with a strict
schema of seven fields, and the plan detail the authors needed (mode, the
exercise, shorts to write, cross-area prerequisites, the concepts a lesson
introduces, sources, rationale) sat in comments under each entry, in a
fixed order the authors agreed among themselves. Live lessons then repeated
`title`, `mode`, `covers` and `serves` in their page frontmatter, and a
check compared the two. Now every fact has a field, one file holds one
lesson, and the page has no frontmatter of its own.

## Course file

`site/src/data/areas/<area>/courses/<course>.yaml`. Each area has one course
and the course id is the area id (S01 "Identifiers"), so today the file is
`areas/safety/courses/safety.yaml`. The day an area needs a second course,
the id scheme changes per S01 and this layout gains the course segment with
it.

A course orders its lessons either flat or in parts, never both:

```yaml
id: safety
area: safety
plan-issue: 31
notes: >-
  Order follows the prerequisite edges in spec S02. The EU AI Act lesson is last.
parts:
  - title: Responsible use
    lessons: [safety/responsible-use, safety/redact-before-you-paste, safety/saying-ai-helped]
  - title: Recognizing failure
    notes: Three lessons, one per concept.
    lessons: [safety/spotting-hallucination, safety/bias-in-patterns, safety/when-the-tool-is-usually-right]
```

```yaml
id: safety
area: safety
lessons: [safety/responsible-use, safety/agent-risk]
```

| Field        | Required | Holds                                                                                                |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `id`         | yes      | The course id, equal to the file stem and, today, to the area id.                                    |
| `area`       | yes      | The area slug, equal to the directory.                                                               |
| `plan-issue` | no       | The GitHub issue the plan was written in. Provenance.                                                |
| `notes`      | no       | Free prose for authors: the ordering rationale, constraints the whole course keeps. Never rendered.  |
| `lessons`    | one of   | The flat form: lesson ids in course order.                                                           |
| `parts`      | one of   | The parted form: a list of `{title, notes?, lessons}`, each `lessons` a list of ids in course order. |

A **part** is a titled slice of the course. In most parts every lesson
covers the same topic and the title is the topic name. A part may also hold
a lesson covering another topic when the order calls for it: two late
lessons on sandboxing and red-teaming form a part of their own in
coding-with-agents. A course with one part is written flat.

Course order is path order (S04 "Progress display"), the order of the plan
table, and the order of lessons in the sidebar. The lesson graph arranges
its nodes by prerequisite depth instead, per S02 "Course page as lesson
graph".

## Lesson file

`site/src/data/areas/<area>/lessons/<lesson>.yaml`, one per lesson, written
or not. Its id is the lesson id `<area>/<lesson>`, equal to the page route.

```yaml
id: safety/eu-ai-act
title: Introduction to the EU AI Act
description: >-
  What the European Union's AI Act asks of people who build and use AI at work.
mode: explanation
covers: safety/governance
serves: [safety/judges-agent-risk/sets-oversight, safety/handles-data-safely/discloses-ai-use]
introduces: [regulation]
assumes:
  - objective: safety/judges-agent-risk/chooses-human-in-loop
    lesson: safety/agent-risk
    section: human-in-the-loop
extends-to:
  - label: Governance and oversight
    href: /topics/safety/governance/
after: [safety/agent-risk]
shorts: [Content credentials (C2PA), Where the AI literacy duty comes from]
exercise:
  kind: judge
  brief: >-
    For one AI tool used at your work, decide whether your organization is provider
    or deployer and name the one transparency duty that applies.
sources: [AI Act, EC AI Act]
sources-checked: 2026-09-20
review-by: 2027-03-20
minutes: 15
notes: >-
  The AI literacy pointer that issue #10 asked for lands here.
```

| Field             | Required  | Holds                                                                                                                                                                                                                                                                                     |
| ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | yes       | `<area>/<lesson>`, equal to the directory and file stem, and to the page route.                                                                                                                                                                                                           |
| `title`           | yes       | The page title, the sidebar label, the node label on the lesson graph.                                                                                                                                                                                                                    |
| `description`     | when live | One sentence for search and social cards. The page's `description`.                                                                                                                                                                                                                       |
| `mode`            | yes       | `tutorial` or `explanation` (S03 "Choosing the page kind").                                                                                                                                                                                                                               |
| `covers`          | yes       | The one topic id the lesson covers, from this area. The term plugin marks first mentions of its concepts (S03 "Citations and terms").                                                                                                                                                     |
| `serves`          | yes       | The objective ids the lesson teaches toward. Each gets at least one checkpoint (S03). May be empty while planning.                                                                                                                                                                        |
| `introduces`      | yes       | The concept ids first taught in this lesson. Every concept of the area's topics is introduced by exactly one lesson, or the check warns. May be empty.                                                                                                                                    |
| `assumes`         | yes       | The objectives the lesson relies on, from any area, as `{objective, lesson?, section?}`. Once live, each names the lesson and the `##` section that teach it.                                                                                                                             |
| `extends-to`      | yes       | Where a confident learner goes next, as `{label, href}` (S03 "Frontmatter"): a page path or an `https://` URL under a bibliography `url`. May be empty. `mise run data` and the build apply the rule in `src/lib/extends-to.ts`. A bad href fails the data check before the build (#288). |
| `covered-by`      | no        | One external course that covers each objective the lesson `serves`, as `{label, href}`, an `https://` URL under a bibliography `url`. Shows a skip tip. `mise run data` and the build check the href the same way as `extends-to`, with the URL form only.                                |
| `after`           | yes       | Lesson ids of this area the lesson comes after, for its place in the lesson graph while it is coming. A live lesson takes its place from `assumes`.                                                                                                                                       |
| `shorts`          | yes       | Titles of the shorts the lesson would link to for depth (S01 "Short"), or an empty list. The short pages are still to be written.                                                                                                                                                         |
| `exercise`        | one of    | The lesson's hands-on task: `{kind, brief}` with `kind` `do` or `judge` (S03 "Exercises") and a one-sentence brief.                                                                                                                                                                       |
| `exercises`       | one of    | Two or more exercises, for a longer lesson. A lesson has `exercise` or `exercises`, never both.                                                                                                                                                                                           |
| `sources`         | yes       | Bibliography keys the lesson draws on. Each must exist. May be empty.                                                                                                                                                                                                                     |
| `issue`           | no        | The lesson's GitHub issue number.                                                                                                                                                                                                                                                         |
| `minutes`         | yes       | The target length of a planned lesson, and a brief for its builder. Once the page exists, the site shows the estimate from the page instead (S03 "Lesson time").                                                                                                                          |
| `sources-checked` | no        | The day the sources were last checked, shown in the page's review line. Set with `review-by`, and move both only after re-checking the sources.                                                                                                                                           |
| `review-by`       | no        | The date by which the sources must be checked again, for a lesson whose facts move (S03 "Frontmatter").                                                                                                                                                                                   |
| `proofs`          | no        | Fixture paths relative to `site/examples/` that back a `foundations` page, which may not carry a `<Predict run=...>` (S03 "Examples"). `mise run examples` runs each and fails on a printed line no `text` fence on the page shows. Rejected outside that group.                          |
| `notes`           | no        | Free prose for authors: rationale, a content sketch, pointers to issues, what the plan named that the page later changed. Never rendered.                                                                                                                                                 |

The schema is strict. A fact with no field gets a field, and a comment in
a lesson file is a defect to fix by adding the fact to `notes` or to the
field it belongs in. `sources-checked` and `review-by` come as a pair, with
`review-by` six months after `sources-checked`, and `mise run data` rejects
a lesson file that sets one without the other or a `review-by` that isn't
after `sources-checked`.

### Status is derived

A lesson is **live** when its page `site/src/content/docs/<area>/<lesson>.mdx`
exists and **planned** otherwise. The page's existence is the whole record.
The lesson graph shows
a planned lesson as a "coming" node, the plan table shows the status column,
and the sidebar lists live lessons only. A lesson being written on a branch
is planned on `main` until the branch merges, which is the truth.

## Lesson page

The MDX page has no frontmatter. At build the docs loader
(`site/src/content.config.ts`) copies `title`, `description`, `mode`,
`covers`, `serves`, `assumes`, `extends-to`, `covered-by`, `sources-checked`
and `review-by` from the lesson file onto the page's docs entry, so every
component that read the page frontmatter before reads the same names now.
Until #112 the loader copied `sources-checked` onto Starlight's
`lastUpdated`, so a prose fix that moved the footer date also moved the
review line. Since #112 `lastUpdated: true` in `astro.config.mjs` makes
the footer date the page's last git commit, and the review line reads
`sources-checked`. Since #339 a lesson with `review-by` shows both date
lines in the footer, the review line first, and every other page shows
"Last updated" only. This replaces the one-date rule of #274.
The course page `<area>/index.mdx`
gets its `title` and `description` from `area.yaml` the same way (S09).

A page that sets one of those fields in its own frontmatter fails
`mise run data`. The S03 "Frontmatter" table describes the fields as the
components see them, and this file is where they're written.

## Sidebar

The Foundations and Engineering sidebar groups are generated from the
tree (`site/astro.config.mjs`): per group, per area in `groups.yaml`
order, a group whose heading is the course page link, holding the live
lessons in course order with their `title` as the label. In a course with
parts, each part becomes a sidebar group under the course, with a plain
label, holding its live lessons, and a part with no live lesson yet is
left out. Starlight gives a group no link of its own, so the course link
is the group's first item with a `data-group-link` attribute, and
`overrides/SidebarSublist.astro` renders it as the heading, next to a
caret that only toggles the group. The topic map in the Reference group
is the heading of the per-area topic groups the same way, and those area
groups get the same plain label as a part. The menu shows a new lesson as soon as its page is merged, with
no edit to the config.

## Going live

1. Write the page at `site/src/content/docs/<area>/<lesson>.mdx` with no
   frontmatter. The build takes the title and the rest from the lesson file.
2. In the lesson file, add `description`, make every `assumes` entry name
   the `lesson` and `section` that teach the objective, and update `serves`,
   `introduces`, `extends-to` and `sources` to what the page does. Move what
   the plan said and the page changed into `notes`.
3. Keep `after` as it was. It is only read while the lesson is coming.
4. `mise run data` and `mise run site-build` are the checks.

## Check

`mise run data` fails when

- a course file's `id` isn't its file stem or the area id, or its `area`
  isn't the directory; a course has both `lessons` and `parts`, or neither
  (schema);
- a course lists a lesson the area has no file for, a lesson is listed in
  two courses or in none, or an area has no course file;
- a lesson file's `id` isn't `<area>/<stem>`;
- `covers` isn't a topic of this area, a `serves` or `assumes` id isn't an
  objective, an `after` id isn't a lesson of this area, an `introduces` id
  isn't a concept or another lesson introduces it, or a `sources` key isn't
  in the bibliography;
- a lesson has both `exercise` and `exercises`, or neither (schema);
- a live lesson has no `description`, or an `assumes` entry without
  `lesson` and `section`;
- a page `<area>/<lesson>.mdx` has no lesson file, or its frontmatter sets a
  field the lesson file owns;
- a lesson outside the `foundations` group lists `proofs`, or a `proofs`
  entry isn't a `.py` file under `site/examples/`.

It warns, without failing, when a concept of one of the area's topics is
introduced by no lesson, because a gap in the plan is a content decision.

## Related specs

- [S01 Project dictionary](S01-dictionary.md): course, part, lesson,
  exercise, short, identifiers.
- [S02 Topic map and competencies](S02-topic-map.md): the topic and
  objective ids a lesson declares, and the lesson graph.
- [S03 Lesson authoring](S03-lesson-authoring.md): what the page itself
  must contain.
- [S04 Progress record](S04-progress-record.md): path order is course
  order.
- [S09 Area authoring](S09-area-authoring.md): the directory that holds the
  files.
- [S10 Competency authoring](S10-competency-authoring.md): the objectives
  `serves` and `assumes` name.

## Open questions

1. Whether `shorts` should become ids once short pages exist, so a lesson
   links to a short the way `extends-to` links to a page. Leaning: yes, when
   the first short is written.
2. Whether the plan table should render `notes` in a folded row for
   authors reading the site. Leaning: no. The YAML is the place to read
   them, and the table is for learners.
