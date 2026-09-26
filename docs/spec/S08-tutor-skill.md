# Tutor skill (S08)

**Purpose:** Define how a learner gets the tutor into their own agent and how
the tutor gets the lesson: a thin installed skill that fetches its
instructions and a per-lesson bundle from the published site, with the
GitHub Pages deploy as the publish step.

**Status:** In progress - bundles implemented 2026-09-24 (#68):
`site/src/lib/lesson-bundles.ts` builds them and
`site/src/pages/data/lessons/[...id].json.ts` writes them. The instruction
file and the bootstrap shipped 2026-09-24 (#69): `site/src/tutor/instructions.md`
is the source, `site/src/lib/tutor-instructions.ts` adds the frontmatter,
`site/src/pages/data/tutor.md.ts` writes `/data/tutor.md`, and
`.claude/skills/ai-tutor/SKILL.md` is the bootstrap. The install check by hand
(step 3 of #69) waits for the first deploy that includes the file. The page
block and the getting-started page aren't built yet.

## Introduction

Terms are per the [project dictionary](S01-dictionary.md): the **tutor** is
Claude acting in tutor mode, it gives hints and withholds answers, and it
offers the **tutor verbs** scoped to one lesson. Lessons are written per
[lesson authoring](S03-lesson-authoring.md), their concepts and behaviors
come from the [topic map](S02-topic-map.md), the exported progress file is
the [progress record](S04-progress-record.md), and the recall question at
session start is the [spaced review](S05-spaced-review.md) rule for tutor
mode.

Until now the tutor was a skill inside this repository. It read lesson
`.mdx` files and topic YAML from disk and cited `localhost:4321`, so it only
worked for someone who had cloned the repo and started the dev server. That
excludes nearly every learner. This spec moves the tutor to the published
site, so that a learner with Claude Code or opencode and one install command
can open any lesson in a tutor session.

## Principles

- **Thin skill, live content.** The installed skill file is a small
  bootstrap. Everything that can go stale (ground rules, verbs, exemplar
  dialogues, lesson text) is fetched from the published site when the
  skill loads. Learners rarely upgrade an installed skill, so the installed
  file holds only how to fetch and what to say when a fetch fails.
- **One publish step.** The GitHub Pages deploy publishes the site, the
  tutor instructions and the lesson bundles together. They can't drift from
  each other, because the same build emits all of them.
- **The tutor reads what the learner reads.** A lesson bundle is built from
  the same content collections as the lesson page, so the tutor's hints are
  about the page in front of the learner.
- **No backend.** Bundles and instructions are static files. The tutor
  never calls a service this project runs, and the site never hears from
  the tutor.
- **No dependency on how the agent is configured.** The tutor works with
  the learner's default agent settings. The getting-started page
  recommends flags that make sessions more alike, and nothing breaks without
  them.

## Distribution

| Rule            | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source of truth | The skill directory `.claude/skills/ai-tutor/` in the GitHub repo `lsimons/ai-training`, on `main`.                                                                                                                                                                                                                                                                                                                                                                |
| Install         | The `skills` CLI, which installs a skill from a GitHub repo into Claude Code or opencode: `npx skills add lsimons/ai-training --skill ai-tutor -g`. The `-g` flag installs to the learner's user directory, so the skill is found from any project rather than only from the folder the command ran in. `npx skills list -g` shows it afterwards. The exact command is printed by the lesson page block and the getting-started page, and both print the same one. |
| Not offered     | A plugin marketplace entry, a `curl` one-liner, a manual copy of the file. One install path keeps the instructions on the page short and the support surface small.                                                                                                                                                                                                                                                                                                |
| Precondition    | The repo is public, which it is as of the "ready to go public" release. The install command fails on a private repo, so the page never showed it before that.                                                                                                                                                                                                                                                                                                      |
| Invocation      | `/ai-tutor <lesson URL>` in Claude Code. opencode has no per-skill slash command, so there the learner writes a plain request that names the skill: `Use the ai-tutor skill on <lesson URL>`. The skill's `description` field says what it does so either agent can also pick it up from a plain request.                                                                                                                                                          |

## Bootstrap contract

The installed `SKILL.md` is the bootstrap. It contains, and only contains:

| Part             | Content                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontmatter      | `name: ai-tutor` and a one-sentence `description`, as the skill format requires.                                                                                                                                                                             |
| Instructions URL | The absolute URL of the published instruction file (below). The bootstrap fetches it first, before saying anything to the learner.                                                                                                                           |
| Version check    | The bootstrap declares the `version` it understands. If the fetched file's `version` is higher, the tutor tells the learner to reinstall the skill with the install command and then continues as far as the instructions still make sense to it.            |
| Lesson step      | Ask the learner for the lesson URL, or take it from what they pasted. Derive the bundle URL by the scheme below, fetch it, and follow the fetched instructions from there.                                                                                   |
| Base             | Both fetches use the base of the pasted lesson URL (everything through `/ai-training/`), so a `localhost` URL from `mise run site-dev` or `site-preview` fetches the local instruction file and bundle. Without a pasted URL the base is the published site. |
| Allowed origins  | The base must be the published site or `http://localhost:<port>/ai-training/`. For any other host or scheme the bootstrap says so in one sentence and stops without a fetch, since it follows the fetched file as instructions.                              |
| Offline message  | If either fetch fails, say so in one sentence, name the URL that failed, and offer to continue from the lesson page the learner has open, as a plain conversation without the verbs. Never invent lesson content when the fetch fails.                       |

On a local base the fetched files still cite the published origin, because
the absolute URLs in the instruction file's frontmatter and in the bundle
come from Astro's `site`, and a local build has the same `site`.

The bootstrap has no ground rules, no verbs and no dialogues. Those are in
the published instruction file, so a rule change reaches every installed
skill on the next deploy.

The bootstrap needs the two files verbatim. The agents' built-in fetch
tools (Claude Code's `WebFetch`, opencode's `webfetch`) summarize a page
against a prompt with a smaller model, so a bundle fetched that way comes
back paraphrased: dialogues shortened, checkpoint `options` reworded, the
`version` integer possibly gone. The bootstrap therefore fetches with `curl`
through the shell tool first, one command per file. Under the recommended
flags that is one approval per fetch. Only when the shell tool is
unavailable does it fall back to the built-in fetch tool with a prompt that
asks for the full content unchanged, and then it tells the learner in one
sentence that the lesson text may be incomplete. The bootstrap uses no
other tool, and it doesn't read files on the learner's machine except the
progress export the learner hands it.

A Vitest test (`site/tests/lib/tutor-instructions.test.ts`, run by
`mise run site-test`) reads `SKILL.md` and fails when its instruction URL,
its bundle URL example or the `version` it declares no longer match the
constants the build uses (`TUTOR_INSTRUCTIONS_PATH` and `BUNDLE_URL_TEMPLATE`
in `site/src/lib/tutor-instructions.ts`, `BUNDLE_VERSION` in
`site/src/lib/bundle-version.ts`) and the `site` in `site/astro.config.mjs`.
The route file at
`site/src/pages/data/tutor.md.ts` is checked against the same path.

Issue #285 considered a stop on a missing or lower `version` and rejected
it. In the no-shell fallback the summarizing fetch tool can drop the
`version` line, and a stop on a missing version would break that path. A
lower version only happens against an old local build. The same issue
rejected agent-side bundle verification (a checksum or a field count),
because it adds instruction text to a bootstrap this contract keeps thin and
it relies on the model following it.

## Published instruction file

The build emits one Markdown file with a YAML frontmatter block at:

```text
https://lsimons.github.io/ai-training/data/tutor.md
```

| Field (frontmatter) | Holds                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`           | Integer, starts at 1. Bumped when the bootstrap contract or the bundle format changes in a way an older bootstrap can't follow.                  |
| `built`             | ISO date of the build that emitted the file.                                                                                                     |
| `bundle_url`        | The bundle URL template, `https://lsimons.github.io/ai-training/data/lessons/{area}/{lesson}.json`, so the derivation rule ships with the rules. |
| `site`              | The site's base URL without a trailing slash, for citations (`{site}/glossary/`).                                                                |

| Section (body)     | Holds                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ground rules       | Give hints rather than answers. Stay on the node. Show, don't tell. Re-read the rules when the conversation is long. Redirect to the page after three asks on one checkpoint.                                          |
| Starting a session | Read the bundle. If the learner has pasted a progress export, ask one recall question for the first item in `reviews` that is due today or earlier. Otherwise point at the course review page. Then offer the verbs.   |
| Verbs              | The S01 tutor verbs table, including *critique this* (the tutor writes a deliberately imperfect answer and the learner critiques it against the behaviors). Each verb says what part of the bundle it draws on.        |
| Citing             | How to cite from the bundle: `url` for prose, `topics[].url` for a concept, `objectives[].competency_url` for a behavior, and `{site}/glossary/#<concept>` for a concept id, with `site` from this file's frontmatter. |
| Exemplar dialogues | Two to four short dialogues that show the hint ladder and never reveal an answer.                                                                                                                                      |
| Out of scope       | What the tutor declines: a second lesson in the same session, a grade for a certificate, the learner's browser storage, and any edit to the learner's files.                                                           |

The file's body is the text that was in the skill's `SKILL.md`,
moved and rewritten for a reader who has the bundle rather than the repo.
Its source in the repo is `site/src/tutor/instructions.md`, and the build
copies it into the output unchanged with the frontmatter fields filled in.
Where the body means the `site` field it writes `{site}` and says so, so
the build doesn't substitute anything and the source reads as the published
file does. `version` is `BUNDLE_VERSION` from `site/src/lib/lesson-bundles.ts`,
so the two files can't disagree, and `built` is the UTC date of the build.

## Lesson bundles

### URL scheme

One JSON file per lesson page, under the site's data path:

```text
https://lsimons.github.io/ai-training/data/lessons/<area>/<lesson>.json
```

The learner pastes the lesson page URL. The bootstrap derives the bundle
URL by inserting `data/lessons/` after the base path and replacing the
trailing slash with `.json`:

| Lesson page                                                      | Bundle                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `https://lsimons.github.io/ai-training/using-agents/delegating/` | `https://lsimons.github.io/ai-training/data/lessons/using-agents/delegating.json` |
| `https://lsimons.github.io/ai-training/safety/agent-risk/`       | `https://lsimons.github.io/ai-training/data/lessons/safety/agent-risk.json`       |

Course pages (`<area>/index.mdx`), guides and reference pages have no
bundle. A fetch of a bundle that doesn't exist is a 404, and the bootstrap
treats it as "this isn't a lesson page" and asks for a lesson URL.

### Format

| Field           | Type    | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`       | integer | Bundle format version, equal to the instruction file's `version`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `id`            | string  | The lesson id per S01 "Identifiers", `<area>/<lesson>`, equal to the page route.                                                                                                                                                                                                                                                                                                                                                                                            |
| `url`           | string  | The lesson page's absolute URL.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `title`         | string  | Frontmatter `title`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `mode`          | string  | `tutorial` or `explanation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `prose`         | string  | The lesson body as Markdown, with components rendered to their plain-text equivalent (a `Pitfall` becomes a paragraph with a "Pitfall" heading, a `Prompt` a fenced block) and widgets omitted. Each `(@key)` citation outside code becomes the source's title and container from `bibliography.yaml` in parentheses, such as `(Introduction to Model Context Protocol, Claude Academy)`, or the title alone when the entry has no container or its container is the title. |
| `topics[]`      | array   | Per covered topic: `id`, `name`, `definition`, `url`, `concepts[] {id, name, definition}`.                                                                                                                                                                                                                                                                                                                                                                                  |
| `objectives[]`  | array   | Per served objective: `id`, `statement`, `level`, `competency_url`, `behaviors[] {claim, why, example}`.                                                                                                                                                                                                                                                                                                                                                                    |
| `assumes[]`     | array   | Per assumed objective: `objective`, `lesson`, `section`, `url` (the section's absolute URL). The tutor points here when the gap is upstream.                                                                                                                                                                                                                                                                                                                                |
| `checkpoints[]` | array   | The lesson's items from the site-wide `checkpoints.json` export, in page order, with that export's fields minus `lesson` (`id`, `kind`, `objective`, `concepts`, `context`, `stem`, `options`, `answer`, `hint`, `reviewable`, `revision`, `guessable`, `phase`). The `review` alternates (`phase: review`) are listed too, and the prose leaves them out because the page hides them.                                                                                      |
| `extends_to[]`  | array   | Per `extends-to` entry: `label`, `url`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

The bundle contains the answers, because the page does too (S04, "The
answer is in the page"), and the tutor needs `answer` to grade *quiz me*.
The tutor's ground rules, and never the format, are what keep the answer
from the learner.

### Build

- The bundle is written by the site build, from the same content
  collections and data files as the lesson page. There is no second source.
- `checkpoints[]` is filtered from the `checkpoints.json` export by
  `lesson`, so the two never disagree.
- The build fails when a live lesson has no bundle, and `mise run site-build`
  is the check. The route's `getStaticPaths` lists every lesson page, so a
  lesson without a bundle is a page the build could not read, and the build
  fails on that page first.
- `mise run bundles` (`site/scripts/check-bundles.mjs`, after `site-build`)
  reads the built bundles back: one per lesson page and none without a page,
  every field of the format table present with its type, `id` equal to the
  path, every fenced code block of the page in `prose` byte for byte, and
  no `(@` in `prose` outside a fenced block or an inline code span.
  The unit tests run the bundle build on fixture lessons, and this check is
  what catches a rewrite that only shows on a real page.
- The build fails when an `assumes` entry names a `lesson` that has no
  lesson page, since its `url` would be a 404.
- The route reads Astro's `site` for the origin. The build fails when it is
  unset, because the bundle's URLs are absolute.
- The bundle build rewrites every root-relative link in `prose` to an
  absolute URL from Astro's `site` plus `base`, so a link in the prose is
  one the tutor can quote. The rehype plugin that does this for pages runs
  on HTML and prepends the base only, so the bundle build can't reuse it.

## Lesson page block

Every lesson page ends with an "Open in tutor" block, after the recap and
before the footer. It is a `not-content` container and contains, in this
order:

1. The install command, once, as a code line with a copy button.
2. The paste-ready line for this lesson, as a code line with a copy button:
   `/ai-tutor https://lsimons.github.io/ai-training/<area>/<lesson>/`. Under
   it, one line for opencode: `In opencode, ask: Use the ai-tutor skill on <the same URL>`.
3. One sentence: the tutor can't read the progress stored in this browser,
   so export it from the settings page and paste the file if a recall
   question is wanted.
4. A link to the getting-started page.

The block is the same component (`TutorBlock.astro`) on every lesson, and
the MarkdownContent override passes it the lesson URL built from Astro's
`site` and the base path. The code lines are the component's own markup
with a small copy script, so the block needs no Markdown rendering. It
never shows on course pages, guides or reference pages.

## Getting-started page

One how-to page under guides, `guides/tutor.md`, titled "How to study
with the tutor", reached from the lesson page block and from the landing
page. It has these sections and no others:

| Section                   | Content                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Install                   | Prerequisites (Claude Code or opencode, Node for `npx`), the install command with `-g`, and `npx skills list -g` to see that the skill is listed.                                                                                                                                                                                    |
| First session             | Open `coding-with-agents/first-session`, copy its paste-ready line (Claude Code) or type the plain request (opencode), run it, and what a correct first reply looks like (the tutor names the lesson and offers the verbs).                                                                                                          |
| What the tutor does       | The verbs, in one line each, and the hint-only rule.                                                                                                                                                                                                                                                                                 |
| What the tutor doesn't do | Read browser storage (export progress instead). Leave the lesson. Give an answer. Edit a file.                                                                                                                                                                                                                                       |
| Recommended flags         | `claude --permission-mode manual` for Claude Code (`default` before 2.1.200), as a suggestion. The tutor runs `curl` for its two fetches and nothing else, and it never edits a file. With the flags, each fetch is one approval the learner sees, and anything else is refused. The opencode equivalent is `opencode --agent plan`. |
| When it fails             | The offline message and what it means. Two things to check: the network, and whether the URL is a lesson page. Where to file an issue.                                                                                                                                                                                               |

The page is a how-to per S01, so it records no progress and sits in no
path. `coding-with-agents/first-session` links to it as the way to get help
on that lesson, which is how the page is exercised.

## Progress

The tutor can't read browser local storage, and the site has no backend to
read it from. Manual export per S04 stays the only way progress reaches the
tutor. The learner exports the file, pastes it or its path into the
session, and the tutor reads `reviews` from it for the recall question.
Nothing flows the other way: the tutor doesn't write progress, and passing
a checkpoint with the tutor doesn't mark it passed on the site.

## Related specs

- [S01 Project dictionary](S01-dictionary.md): tutor, tutor verbs, lesson,
  review.
- [S02 Topic map and competencies](S02-topic-map.md): the topic and
  competency data the bundle copies and the pages it cites.
- [S03 Lesson authoring](S03-lesson-authoring.md): the frontmatter fields
  the bundle carries, the checkpoint export it filters.
- [S04 Progress record](S04-progress-record.md): the export the learner
  pastes.
- [S05 Spaced review](S05-spaced-review.md): the recall question at session
  start.

## Open questions

1. Whether the bundle should contain the full `prose` or the headings and
   the recap only, to keep the tutor's context small. Leaning: full prose,
   because a lesson is at most 25 minutes of reading and the hints need
   the wording the learner saw.
2. Whether to publish one `tutor.md` per language once lessons are
   translated. Leaning: one file, and the bundle carries the language.
3. Whether a small blind eval set (a few dozen queries across lessons and
   verbs, re-run after a model change) belongs in this repo. Leaning: yes,
   as a `mise` task that isn't in `ci`, once there are exemplar dialogues to
   grade against.
4. Whether the `skills` CLI's install path stays stable enough to print on
   every lesson page. Leaning: yes, and the getting-started page is the one
   place to change if it doesn't.

## Out of scope

- An in-browser terminal or a coaching agent on the page. Decided against
  separately.
- A tutor that writes progress back to the site.
- Running the tutor against a local checkout's source files. The tutor
  reads built output only, and a maintainer previewing a change uses
  `mise run site-preview` and pastes the `localhost` lesson URL.
