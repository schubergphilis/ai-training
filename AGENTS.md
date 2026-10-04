# Agent Instructions for ai-training

> This file (`AGENTS.md`) is the canonical agent configuration. `CLAUDE.md` is a symlink to this file.
> It is loaded automatically. Don't `cat` it.

An open training suite for getting started with AI (concepts, safety, using
agents, AI-assisted software engineering, customizing and building agents),
built as an [Astro Starlight](https://starlight.astro.build/) site and
published to GitHub Pages. Basic material is for knowledge workers; the rest
is for software engineers. Design decisions are in `docs/spec/`, and open
work is in GitHub issues (`docs/agents/issue-tracker.md`).

## Quick reference

Run `mise trust` and `mise install` once per clone, and `mise run setup`
once per clone or worktree. A task that needs the install stops and names
`setup` when it hasn't run.

- `mise run fast` is the check before each push.
- `mise run ci` is the full gate, the same list the CI job runs. Its last
  line says which task failed.
- `mise tasks` lists the rest. `docs/agents/testing.md` says what each
  check catches, which layer a new assertion belongs in, and how to run
  the browser suite and the dev server.

## Structure

The layout is what the tree shows. The parts that aren't obvious from it:

- This is a *project* site served under the `/ai-training` base path (set in
  `site/astro.config.mjs`). Write content links and image sources
  root-relative (`/guides/foo/`, `/guides/foo.png`); a rehype plugin
  prepends the base for Markdown `<a href>` and `<img src>`. Raw HTML `<a>`
  tags and the landing page's hero actions must include the base path.
  Component-rendered links use `href()` from `site/src/lib/url.ts`.
- Lessons are `site/src/content/docs/<area>/<lesson>.mdx` and course pages
  are `<area>/index.mdx`, without frontmatter. What the site knows about an
  area, topic, competency, course or lesson is YAML under
  `site/src/data/areas/<area>/` (specs S09 to S11). `mise run data` checks
  it, including that no `foundations` lesson shows code or terminal work.
  `docs/agents/writing-a-lesson.md` is the authoring guide.
- `site/src/styles/lesson.css` is global on purpose: review pages clone
  checkpoint markup out of lesson pages.
- `site/examples/` holds the runnable fixtures behind `<Predict run=...>`.
- `docs/spec/` holds numbered specs (`000-specs.md` is the index). S01 is
  the project dictionary. Use its terms everywhere. `docs/agents/` holds
  the agent-facing process docs, and `docs/prose/README.md` says which
  Vale rule runs where.

## Guidelines

**Content and licensing:**

- This is a public, open-content project. No internal URLs or confidential
  material, and no company names in lessons, course pages, or examples. The
  organization's name appears only in URLs and in the header link to
  `schubergphilis.github.io` (spec S14).
- Content is CC BY-SA 4.0 and code is Apache-2.0. Source material has its
  own terms: follow `writing-a-lesson.md` "Source licenses" and spec S02.
  Never copy text from Claude Academy, DeepLearning.AI or CS50.
- Interactive widgets in lesson pages sit in `class="not-content"`
  containers. Never emit a literal `</script>` or `</pre>` inside widget JS
  strings.
- Learner progress is stored in browser local storage only. No backend, no
  telemetry.

**Voice:**

Many readers have English as a second language. Keep the concepts at a
professional level but the language simple: common words and plain sentence
structure over native-speaker idiom, wordplay, or rare vocabulary. Expand an
acronym on first use in a lesson.

Agent prose has tells, and `mise run prose` flags them. Write so that it
has nothing to say.

- Say what a thing does, not what it figuratively is. Content is *in* a
  directory, not *living* there; a file *contains* a value, a check
  *rejects* a change, a format is a format and not a `shape`.
- No tacked-on clause after a semicolon. Two sentences, or a comma and a
  conjunction.
- Don't announce a count and then list (`Three things matter: ...`).
- Don't default to the rule of three. Name two things when there are two,
  and four when there are four.
- No clipped mottos (`Hints, not answers.`). Write the sentence.
- No `not X, but Y` or `a Y, not a Z` as the default way to make a
  point. State the positive claim.
- No sentence-initial `Hence`, `Thus`, `Notably`, `Moreover`, `That's why`.
- No `no X, no Y, no Z` stacks, no `Nothing here needs ...`, no "Every X
  has ..." as a rhythm.
- No `delve`, `robust`, `seamless`, `leverage`, `landscape`, `journey`,
  `It's worth noting`, `In conclusion`. Write `use`, not `utilize`, and
  `so`, not `consequently`.

**Quality:**

- `mise run ci` must pass before you push.
- Each check has its layer and its rules (`docs/agents/testing.md`): Biome
  for `site/` formatting, `astro check`, Vitest with an 80% floor, pytest
  and basedpyright for Python, cspell (American English, names in
  `cspell-words.txt`), and Vale.
- Code examples in lessons are real, and `mise run examples` asserts their
  output.
- Never weaken a control to make a check pass. That covers unpinning an
  action, dropping a `prek.toml` hook, excluding a really broken URL in
  `.lychee.toml`, lowering a coverage floor, deleting a test, a rule
  disable without its reason on the same line, and an `osv-scanner.toml`
  entry for an advisory.

**Supply chain** (the procedures are in `docs/agents/supply-chain.md`):

- `site/bun.lock` and `uv.lock` are committed, and `ci` installs from them.
- Every dependency in `site/package.json` and the `pyproject.toml` dev
  group is an exact version. An upgrade is a deliberate change.
- `mise run site-audit` and `mise run vuln` are clean. An advisory
  without a fix gets an expiring entry in `osv-scanner.toml`, and every
  edit to that file asks the maintainer first.
- GitHub Actions are pinned to full commit SHAs, `.mise.toml` tools and the
  mise pin in CI to exact versions, and `prek.toml` hooks by commit SHA
  with their full dependency tree.

## Process

- Git remote is GitHub, `schubergphilis/ai-training`. Use `gh`.
- Issues and labels: `docs/agents/issue-tracker.md`. Triage with the
  maintainer: `docs/agents/triage.md`.
- Many builders and reviewers in parallel: `docs/agents/orchestration.md`.
  Wave after wave from one session: `docs/agents/meta-orchestration.md`,
  run by the `/wave` skill.
- A follow-up a review or a wave report names, and an improvement the
  maintainer defers, become GitHub issues before the session ends (or, in
  `/wave --no-filing`, when the run ends). A cosmetic nit left open on a
  merged branch becomes a line in the one open `Cosmetic nits` issue. Run
  issues, session records and transcripts are never a place work waits.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`type(scope): description`), and commitlint enforces it.
- A push to `main` deploys to GitHub Pages.
- Every commit message, PR body and issue comment an agent writes ends
  with the two attribution lines below, with the model you are running in
  `Assisted-by` and no `Signed-off-by`. A review puts them after its
  `Verdict:` line.

```text
Co-Authored-By: lsimons-bot <bot@leosimons.com>
Assisted-by: Claude:<model>
```

## Asking the maintainer

- Decide routine triage yourself. Apply your recommendation and list what
  you decided. Ask only when a decision touches a spec, a rule in this
  file, the scope of the work, or its cost.
- A question holds one decision, in plain words. Say what the problem
  is, what you would do and what you need decided, and give one
  recommendation. An issue number alone is never the question.
- Keep open questions in a `Waiting on you` block at the end of every
  status update until they're answered.
- File a bug you find as an issue instead of asking whether to file it.
  Work outside your task becomes an issue, and you leave the fix for
  later.

## Interactive sessions

These rules are for a session the maintainer works in directly, outside a
wave.

- After a push, start `mise run ci-watch` in the background and hand
  control back. You still own step 4 of "Session completion": report the
  result when it arrives, and fix a failure.
- When the auto-mode classifier blocks a change to agent settings, ask one
  yes-or-no question that names the change ("May I add these 12 rules to
  `.claude/agents/builder.md`?"), and after a yes retry the same edit.
  Never route it through another tool. A deny rule, such as the one on
  `.claude/settings.json`, stays: give the maintainer the finished patch to
  apply in one step, never a list to type.
- Merging nits issues, setting labels and closing duplicates are routine
  triage: do them and report them.
- Before filing that Claude Code can't do something, check
  `https://code.claude.com/docs/` and `CHANGELOG.md` in
  `anthropics/claude-code` yourself, and cite the page in the issue. A
  `claude-code-guide` answer isn't a source.
- Every status update lists the agents still running and the worktrees
  that exist, or says there are none.

## Session completion

Work isn't complete until every change is committed, pushed, and CI
passes. This is about your own branch: no agent pushes to `main`, and
every change reaches it through a pull request.

1. `mise run fast` (or `mise run ci`)
2. Commit everything; don't leave the working tree dirty
3. `git pull --rebase origin main`, then `git push` your branch
4. `mise run ci-watch`; on failure `gh run view --log-failed`, fix, repeat

Never stop before CI is green.

Whoever finds `main` red fixes it, whoever broke it.
