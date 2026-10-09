# Agent-readable site (S12)

**Purpose:** Fix what the published site offers an AI agent that reads it
on a person's behalf: a Markdown alternate of each content page, an
`llms.txt` index with an `llms-full.txt` companion, the data tree as JSON
under `/data/`, and the stance on crawlers.

**Status:** Implemented (2026-10-01) - build issues #499 (Markdown
alternates), #500 (`llms.txt`, `llms-full.txt`) and #501 (data tree as
JSON) are merged.

Each build issue updates the Status line and the index row when it
merges.

## Introduction

Terms are per the [project dictionary](S01-dictionary.md): a **lesson**,
a **course** and its **course page**, a **guide** (a page of kind
`how-to`), and the generated **reference** pages. Lessons are written per
[lesson authoring](S03-lesson-authoring.md), which also defines the
checkpoint export. The data tree is fixed by
[area authoring](S09-area-authoring.md),
[competency authoring](S10-competency-authoring.md) and
[course and lesson plan authoring](S11-course-authoring.md). A lesson is
**live** when its page exists and **planned** otherwise (S11 "Status is
derived").

On 2026-09-27 the site publishes these machine-readable files:

| File                                 | Defined in                       | Route                                         |
| ------------------------------------ | -------------------------------- | --------------------------------------------- |
| `/sitemap-index.xml`                 | Starlight, from Astro's `site`   | generated                                     |
| `/data/checkpoints.json`             | S03 "Checkpoint export"          | `site/src/pages/data/checkpoints.json.ts`     |
| `/data/lessons/<area>/<lesson>.json` | S08 "Lesson bundles", live only  | `site/src/pages/data/lessons/[...id].json.ts` |
| `/data/tutor.md`                     | S08 "Published instruction file" | `site/src/pages/data/tutor.md.ts`             |

Starlight builds the sitemap when `site` is set in the Astro config
(<https://starlight.astro.build/guides/customization/#enable-sitemap>).
All paths in this spec are under the base path, so `/data/tutor.md` is
`https://schubergphilis.github.io/ai-training/data/tutor.md`.

The other pages are HTML inside the Starlight page frame: the sidebar,
the "On this page" menu, the footer and the widget scripts. An agent that
fetches a lesson gets that frame around the text. The tutor has its own
bundle (S08), but any other agent has to strip the HTML itself. This spec
adds the layer that serves any agent.

The `llms.txt` proposal (<https://llmstxt.org/>, v2, dated 2024-09-03
and revised in August 2026 per its changes page,
<https://llmstxt.org/changes.html>) is the convention this spec follows.
What this spec takes from it is cited to that page in each section.

## Principles

- **One source.** The site build writes the files of this spec from the
  same content collections and data files as the pages, so no second copy
  can drift, as in S08 "One publish step".
- **Static files only.** Each file is at its own URL. The site doesn't
  vary a response by the request's `Accept` header, and on the published
  site it doesn't set response headers of its own.
- **What the page shows, as text.** An alternate contains what a reader
  sees on the page before they interact with it. It leaves out what only
  the browser has: progress, settings, and widget state.
- **Agents read what people read.** An alternate contains only what its page
  shows, plus the page and license lines of its header. The site has no
  content page written for agents alone.

## Markdown alternates

### Which pages get one

| Page                                                  | Alternate | Why                                                                                  |
| ----------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Live lesson, `/<area>/<lesson>/`                      | yes       | The main content.                                                                    |
| Course page, `/<area>/`                               | yes       | Lists the course's parts and lessons, which `llms-full.txt` puts before the lessons. |
| Guide, `/guides/<slug>/`                              | yes       | Plain Markdown pages.                                                                |
| Contributing, `/contributing/`                        | yes       | A plain Markdown page.                                                               |
| About, `/about/`                                      | yes       | Prose about the project, with its figures as numbers.                                |
| Glossary, `/glossary/`                                | yes       | Generated reference: every concept and its definition.                               |
| Topic page, `/topics/<area>/<topic>/`                 | yes       | Generated reference, per S02 "Stable URLs".                                          |
| Competency page, `/competencies/<area>/<competency>/` | yes       | Generated reference: objectives and behaviors.                                       |
| Front page `/`                                        | no        | `llms.txt` does its job for an agent.                                                |
| Topic map, competency map                             | no        | A drawing of the data tree. The JSON files below state the same facts.               |
| Your progress, Your reference, settings, review pages | no        | Their content is the learner's browser storage (S04).                                |

### URL scheme

Page URLs on this site end in `/`. The alternate is the page URL
with `index.md` appended:

| Page                                                                     | Alternate                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `https://schubergphilis.github.io/ai-training/safety/agent-risk/`        | `https://schubergphilis.github.io/ai-training/safety/agent-risk/index.md`        |
| `https://schubergphilis.github.io/ai-training/safety/`                   | `https://schubergphilis.github.io/ai-training/safety/index.md`                   |
| `https://schubergphilis.github.io/ai-training/topics/safety/agent-risk/` | `https://schubergphilis.github.io/ai-training/topics/safety/agent-risk/index.md` |

The proposal asks for a Markdown version of a page at the page's own URL
with `.md` added, and says that a URL without a file name adds
`index.md` or `index.html.md` (llmstxt.org, "Proposal"). This site's
URLs have no file name, and `index.md` is the shorter of the two. A
`.md` sibling (`/safety/agent-risk.md`) is rejected, because it doesn't
follow from the proposal's rule for a URL that ends in `/`.

GitHub Pages served `/data/tutor.md` with
`content-type: text/markdown; charset=utf-8` on 2026-09-27 (checked with
`curl -I`). An alternate gets the same header without a setting in this
repository. The build endpoint sets that header too, as
`site/src/pages/data/tutor.md.ts` does, so the dev server and preview
agree.

### Head hints

Each page with an alternate has, in its `<head>`:

```html
<link rel="alternate" type="text/markdown" href="https://schubergphilis.github.io/ai-training/safety/agent-risk/index.md">
```

The proposal recommends this link relation for a page's Markdown version
(llmstxt.org, "Proposal"). It allows it as an HTML `<link>` element or as
an HTTP `Link:` header. This site uses the element only, per "Static
files only". The `href` is absolute, built from Astro's `site` and the
base path. The `describedby` link to `llms.txt` is in "`llms.txt`",
because it ships with that file.

### Anatomy

An alternate is UTF-8 Markdown with no frontmatter:

```markdown
# Why agent safety is different

> What changes once an AI can act instead of only answer. How to decide what it may reach and do on its own, and where a person must approve first.

Page: https://schubergphilis.github.io/ai-training/safety/agent-risk/
License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/

<the body>

## References

<one entry per cited source, when the page cites one>
```

| Part       | Holds                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title      | An H1 with the page `title`. For a course page that is the area `name` (S09 "Area file").                                                                           |
| Summary    | A blockquote with the page `description`, folded to one line.                                                                                                       |
| Page line  | `Page:` and the absolute URL of the HTML page, so a reader can cite the page a learner opens.                                                                       |
| License    | The content license and its URL, because an alternate is often read without the page and its footer.                                                                |
| Body       | The page body, rendered by the rules below.                                                                                                                         |
| References | Present when the page cites a source. One list item per cited key, in order of first citation: title, container, and the `url` when the bibliography entry has one. |

### Rendering a lesson body

A lesson body renders by the rules of the bundle's `prose` field (S08
"Format"). One renderer produces both, and it takes a flag for the
alternate. With the flag off, the bundle `prose` stays as S08 defines it.
With the flag on, the renderer differs from the bundle `prose` in exactly
these four ways:

- Each checkpoint's options follow its stem, in the form of the table
  below.
- An `#<id>` link becomes the page's absolute URL plus `#<id>`. The bundle
  leaves it as written.
- A `## References` section follows the body.
- A habit heading is `#### Habit` without the id, because the page shows
  no id.

The table gives the full rendering, with those four differences in it.

| Source element                             | In the alternate                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Markdown text, headings, lists, tables     | Unchanged.                                                                                                                                                                     |
| Fenced block, inline code                  | Byte for byte, citations inside them included.                                                                                                                                 |
| MDX `import` block                         | Left out.                                                                                                                                                                      |
| MDX comment `{/* ... */}` on its own lines | Left out, in the bundle `prose` too: the page never shows it.                                                                                                                  |
| Root-relative link or image                | Made absolute from Astro's `site` plus the base path. A link to another page keeps pointing at the HTML page, and an agent adds `index.md` for its alternate.                  |
| `#<id>` link                               | The page's absolute URL plus `#<id>`, so it resolves outside the page.                                                                                                         |
| `(@key)` citation outside code             | The source's title and container in parentheses, as in the bundle `prose`: `(Introduction to Model Context Protocol, Claude Academy)`. The key is listed under "References".   |
| Term (first mention of a concept)          | The concept name as plain text. The glossary link and hover definition of the page are left out, and the definition is in the glossary and topic alternates.                   |
| `Pitfall`                                  | `#### Pitfall: <title>`, then its text.                                                                                                                                        |
| `Prompt`                                   | `#### Prompt · <model>, recorded <month>`, or `#### Prompt (illustrative, not a recorded transcript)`, then the prompt in a `text` fence.                                      |
| `Response`                                 | `#### Response`, then the response in a `text` fence.                                                                                                                          |
| `Predict` without `objective` (an example) | `#### Example: <title>`, then its children, then `Output:` and the `answer` in a `text` fence, because the page shows that output.                                             |
| `Predict` with `objective` (a checkpoint)  | `#### Checkpoint: <title>`, then its children. The answer is left out, as on the page before the learner answers.                                                              |
| `Choice`, `Scenario`, `MultiChoice`        | `#### Checkpoint: <title>`, the stem, then the option texts as a list in page order. A `MultiChoice` adds the line `Select exactly <N>.`, as its page does.                    |
| `Match`                                    | `#### Checkpoint: <title>`, the stem, then a `Statements:` list and an `Options:` list.                                                                                        |
| `Order`                                    | `#### Checkpoint: <title>`, the stem, then the steps as a list sorted alphabetically, as the checkpoint export lists them, so the list doesn't give the answer away.           |
| `Sort`                                     | `#### Checkpoint: <title>`, the stem, then a `Buckets:` list and an `Items:` list, in the order of the checkpoint export.                                                      |
| `Repair`                                   | `#### Checkpoint: <title>`, the stem, then the broken text in a `text` fence.                                                                                                  |
| Checkpoint with `phase="review"`           | Left out, because the page hides it (S03 "Checkpoints"). The bundle and the export still list it.                                                                              |
| `MorePractice`                             | `## More practice`, then its checkpoints.                                                                                                                                      |
| `Exercise`                                 | `## Exercise`, then its text, then `Stretch:` and the stretch goal when it has one.                                                                                            |
| `Recap`                                    | `## Recap`, then its takeaways.                                                                                                                                                |
| `Habit`                                    | `#### Habit`, then its text.                                                                                                                                                   |
| Widget, or any other component             | A widget is left out, and other components render their children. Widgets today are self-closing, which the bundle `prose` drops too, so this isn't a fifth difference.        |
| Page frame and injected blocks             | Left out: the sidebar, the "On this page" menu, the footer, the review line, the tutor block and the route-ahead cards. The page line and the license line replace the footer. |

A checkpoint's hint, the `why` of each option, and the `answer` are never
in the alternate. The hint and the answer are in the checkpoint export and
the bundle, which may hold the answer because the page does (S04, "The
answer is in the page"). The `why` of an option is published in neither
file.

### Rendering the other pages

| Page                | Body                                                                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course page         | The page's own prose. The lesson graph is left out. The course plan becomes one `##` heading per part (none in a flat course), each with a list of its lessons in course order: `[<title>](<page URL>): <description>` for a live lesson, `<title> (planned)` for a planned one. |
| Guide, contributing | The page's Markdown, with the link rules of the lesson body.                                                                                                                                                                                                                     |
| About               | The page's Markdown, with the link rules of the lesson body. Each `<AboutFigure>` becomes its number, and the topic map and the widget leave nothing.                                                                                                                            |
| Glossary            | One `## <name> (<id>)` heading per concept, so the id of the glossary anchor stays in the text, with its definition and a link to its topic page, in the page's order.                                                                                                           |
| Topic page          | The sections the page shows (definition, concepts, links, lessons, sources), each under its page heading. The "Your reference" section is left out, because it reads browser storage.                                                                                            |
| Competency page     | The sections the page shows: the course, the topics it draws on, each objective with its level and behaviors (`claim`, `why`, `example`), the alignment table and the references. The progress colors are left out.                                                              |

## `llms.txt`

### Place

The file is `/llms.txt` under the base path:
`https://schubergphilis.github.io/ai-training/llms.txt`. The proposal lets an
`llms.txt` file sit at any path of a site, where it covers the pages
under that path, and names a GitHub Pages project site as a case this
allows (llmstxt.org, "Proposal" and "Existing standards"). So the file
at `/ai-training/llms.txt` covers the site.

When `llms.txt` ships (#500), each page of the site gets in its `<head>`:

```html
<link rel="describedby" href="https://schubergphilis.github.io/ai-training/llms.txt">
```

The proposal recommends `describedby` for the `llms.txt` file that covers
a page (llmstxt.org, "Proposal"). The link goes in with #500 and not with
the alternates (#499), so no published page points at a file that
doesn't exist yet.

### Layout

The proposal's format is, in this order: an H1 with the site's name, a
blockquote summary, optional Markdown other than headings, then sections
under H2 headings, each a list of `[name](url)` links, each link
optionally followed by `:` and a note (llmstxt.org, "Format"). This
site's file fills it as follows:

| Part            | Content                                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1              | `AI Training`, the front page `title`.                                                                                                                                                                                                                               |
| Blockquote      | The front page `description`.                                                                                                                                                                                                                                        |
| Paragraphs      | The license line: content is CC BY-SA 4.0 and code is Apache-2.0, with links to both licenses. A link to the sitemap index, `/sitemap-index.xml`. A link to the data index, `/data/index.json`.                                                                      |
| One H2 per area | In group order, then area order (S09 "Groups"). The heading is the area `name`. The first item is the course page alternate with the area `description` as its note. Then each live lesson in course order, its alternate with the lesson `description` as its note. |
| `## Guides`     | Each guide's alternate with its `description`.                                                                                                                                                                                                                       |
| `## Reference`  | The glossary alternate, the checkpoint export and the tutor instruction file, each with a one-line note.                                                                                                                                                             |
| `## Optional`   | `llms-full.txt`, the contributing page and the About page. In the proposal, `Optional` is a customary name for secondary links (llmstxt.org, "Format").                                                                                                              |

Links point at the alternates, because the proposal says the links of an
`llms.txt` should lead to content an agent reads easily (llmstxt.org,
"Proposal"). The URLs are absolute. Parts, planned lessons, topic pages
and competency pages aren't listed. They're one link away, from the
course page alternate and from `/data/index.json`. Leaving them out keeps
`llms.txt` small enough to read in one fetch.

A worked excerpt, with the descriptions as the data tree has them on
2026-09-27:

```markdown
# AI Training

> An open training suite for getting started with AI, from concepts and safety to using, customizing and building AI agents.

...

## Safety

- [Safety](https://schubergphilis.github.io/ai-training/safety/index.md): Using AI safely, and judging the risk of letting an agent act.
- [What may go into an AI tool](https://schubergphilis.github.io/ai-training/safety/responsible-use/index.md): Where a prompt goes once you press enter, and which of the data you handle may follow it. How to try a new tool with dummy data, and when to say that AI helped.
```

### `llms-full.txt`

`/llms-full.txt` under the base path joins the alternates of every course
page and every live lesson, each course page followed by its lessons in
course order, and the courses in the order `llms.txt` lists them. A
`---` line with a blank line on each side separates two alternates.
Guides and reference pages aren't in it.

The proposal doesn't define this file. The site adds it for a tool
that indexes or searches the whole course text in one fetch. It is far
larger than `llms.txt`, so `llms.txt` lists it under `Optional`.

### Build and check

Both files are build-time endpoints under `site/src/pages/`, like
`site/src/pages/data/checkpoints.json.ts`. They read the areas, courses
and lessons through the same loaders as the sidebar, so a planned lesson
is left out the way the sidebar leaves it out (S11 "Sidebar"). A test
fails when a live lesson isn't in `llms.txt` exactly once with its
`description`, when a planned lesson is, or when `llms-full.txt` doesn't
hold each course page and live lesson alternate exactly once in course
order.

After `site-build`, `mise run bundles` fails when a link in `llms.txt`
other than the two license links isn't an absolute URL under the site
root or points at no file in `dist`, when either file doesn't start with
an H1, or when a page or the 404 page lacks its `describedby` link.

## Data tree as JSON

### Files

`groups.yaml` and each YAML file under `areas/` in the data tree publish
as one JSON file each under `/data/`, at `/data/<kind>/<id>.json`, where
`<id>` is the unit's id per S01 "Identifiers". This is the rule the
bundles already follow (`/data/lessons/<area>/<lesson>.json`, S08 "URL scheme").

| Source (`site/src/data/`)                     | Published at                                  | Example                                            |
| --------------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `groups.yaml`                                 | `/data/groups.json`                           | `/data/groups.json`                                |
| `areas/<area>/area.yaml`                      | `/data/areas/<area>.json`                     | `/data/areas/safety.json`                          |
| `areas/<area>/topics/<topic>.yaml`            | `/data/topics/<area>/<topic>.json`            | `/data/topics/safety/agent-risk.json`              |
| `areas/<area>/competencies/<competency>.yaml` | `/data/competencies/<area>/<competency>.json` | `/data/competencies/safety/judges-agent-risk.json` |
| `areas/<area>/courses/<course>.yaml`          | `/data/courses/<course>.json`                 | `/data/courses/safety.json`                        |
| `areas/<area>/lessons/<lesson>.yaml`          | `/data/lesson-plans/<area>/<lesson>.json`     | `/data/lesson-plans/safety/agent-risk.json`        |

A course id is its area id (S01 "Identifiers"), so a course has one
segment. The lesson file publishes under `lesson-plans/`, because S08 has
`/data/lessons/` for the bundles. A live lesson has both files at the
same `<area>/<lesson>` path, and a planned lesson has only the plan.

A published file is the YAML file as JSON, minus `notes`: the same keys,
spelled as in the YAML (`extends-to`, `sources-checked`), the same values,
in the same key order. S09 "Area file", S10 and S11 define `notes` as
prose for authors that is never rendered, so every `notes` field is left
out: the top-level one of an area, competency, course or lesson file, and
the one of a course part.

The endpoint reads the raw file with the `yaml` package, as
`site/scripts/lib/data.mjs` does, and not through the content
collections. A date then stays a `YYYY-MM-DD` string, keys keep their
source order, and a folded or literal string is the value that package
returns. The content collections turn `sources-checked` and `review-by`
into dates and order keys by the schema, so JSON written from them
wouldn't match its source. The file is pretty-printed with two spaces and
ends in a newline, as the other `/data/` files are.

### Index

`/data/index.json` lists every published data file, so an agent can find
them on a static host that has no directory listing:

| Field                    | Holds                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                | Integer, starts at 1. Bumped when a field changes meaning.                                                                                                       |
| `groups`                 | The URL of `/data/groups.json`.                                                                                                                                  |
| `checkpoints`            | The URL of the checkpoint export.                                                                                                                                |
| `areas[]`                | Per area in group order: `id`, `url` (the area file), `page` (the course page).                                                                                  |
| `areas[].topics[]`       | Per topic: `id`, `url`, `page` (the topic page).                                                                                                                 |
| `areas[].competencies[]` | Per competency: `id`, `url`, `page` (the competency page).                                                                                                       |
| `areas[].courses[]`      | Per course: `id`, `url`.                                                                                                                                         |
| `areas[].lessons[]`      | Per lesson in course order: `id`, `plan` (the lesson plan URL), `live` (boolean), and for a live lesson `page` and `bundle`, which are `null` for a planned one. |

The URLs in the index are absolute. The index is the one derived file
under `/data/`: `live`, `page` and `bundle` are facts the build knows and
no YAML file states.

### How a published file differs from a bundle

| Published data file                                                                      | Lesson bundle (S08)                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| One YAML file, copied without its `notes`.                                               | A view of one live lesson, joined from the lesson file, its page, its topic, its competencies and the checkpoint export. |
| Exists for planned lessons too.                                                          | Exists for live lessons only.                                                                                            |
| Keys as in the YAML, kebab-case.                                                         | Its own field names, snake-case (`extends_to`).                                                                          |
| No `version` field. A change to a data-tree schema (S09 to S11) is a change to the file. | A `version` field equal to the instruction file's `version`.                                                             |
| For any agent.                                                                           | For the tutor, in the format its instructions expect.                                                                    |

### Build and check

The files are build-time endpoints under `site/src/pages/data/`, like the
bundle route. After `site-build`, a check reads each published file back,
parses its YAML source with the `yaml` package, drops `notes`, and fails
when the two differ, when a data-tree file has no published file, or when
a published file has no source. It runs in `mise run bundles`
(`site/scripts/check-bundles.mjs`), which already reads the built
`dist/data/`. A test passes the check a JSON file that differs from its
YAML and sees it fail.

## Crawlers

The maintainer decided on 2026-09-24 to allow every crawler, AI training
crawlers included, and on 2026-09-26 that the site ships no `robots.txt`.

- The Robots Exclusion Protocol puts the rules in a file named
  `/robots.txt` at the top-level path of a host (RFC 9309, section 2.3,
  <https://www.rfc-editor.org/rfc/rfc9309>). For this project site that is
  `https://schubergphilis.github.io/robots.txt`, which this repository
  doesn't serve. A `robots.txt` under `/ai-training/` isn't a place the
  protocol names.
- That URL returned 404 on 2026-09-30, after the move from
  `lsimons.github.io`, whose `robots.txt` also returned 404 on 2026-09-26
  and 2026-09-27. RFC 9309
  (section 2.3.1.3) says that when the file is unavailable, with a status
  in the 400 to 499 range, a crawler may access any resource on the host.
  So the 404 allows every crawler, which is the stance.
- No `robots.txt` is added in this repository or in the
  `schubergphilis.github.io` repository.
- The license and the sitemap index link, which a `robots.txt` would
  otherwise carry, are in `llms.txt`.

## Related specs

- [S01 Project dictionary](S01-dictionary.md): page kinds, identifiers,
  checkpoint kinds, term.
- [S02 Topic map and competencies](S02-topic-map.md): the topic and
  competency pages that get alternates.
- [S03 Lesson authoring](S03-lesson-authoring.md): the components an
  alternate renders, citations and terms, the checkpoint export.
- [S04 Progress record](S04-progress-record.md): why the answer may be in
  a published file, and the browser storage the alternates leave out.
- [S08 Tutor skill](S08-tutor-skill.md): the bundle `prose` rules the
  lesson alternate reuses, and the `/data/` URL scheme.
- [S09 Area authoring](S09-area-authoring.md),
  [S10 Competency authoring](S10-competency-authoring.md) and
  [S11 Course and lesson plan authoring](S11-course-authoring.md): the
  data-tree files that publish as JSON, and live and planned lessons.

## Open questions

1. Whether a term's first mention in an alternate should be a Markdown
   link to its glossary anchor, as on the page. Leaning: plain text, as
   the bundle `prose` has it, until an agent is seen to miss a definition.
2. Whether `llms-full.txt` should also exist per course, at
   `/<area>/llms-full.txt`, for an agent that wants one course in one
   fetch. Leaning: not until someone asks, because the course page
   alternate already links every lesson.
3. Whether `bibliography.yaml` and the alignment files publish as JSON
   too. Leaning: yes, as a later step, under `/data/bibliography.json` and
   `/data/alignment/<framework>.json`, once a consumer needs them.

## Out of scope

- JSON-LD `Course` markup or other structured data in the page head.
- Content pages written for agents alone. Each alternate mirrors a page.
- A `robots.txt`, in this repository or at the host root (see
  "Crawlers").
- HTTP `Link:` headers and a response chosen by the `Accept` header. The
  site is static files and doesn't set headers.
