# Testing the site

Which check catches what, and which layer a new assertion belongs in. All
of the layers run from `mise run ci` and from the CI workflow, with one
exception: on a pull request the CI workflow skips the e2e layer when every
changed file is prose or prose tooling (see "When the browser suite runs").

| Layer     | Task                   | Runs                                                                 | Catches                                                                                                                                                            |
| --------- | ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint      | `mise run site-lint`   | Biome over `site/` (`site/biome.json`)                               | Unused imports and variables, `any`, non-house formatting, import order                                                                                            |
| Types     | `mise run site-check`  | `astro check`                                                        | Type errors in `.ts` and `.astro` files, template errors, content schema mismatches                                                                                |
| Unit      | `mise run site-test`   | Vitest, `site/tests/**/*.test.ts`, with the coverage floor           | Wrong logic in `site/src/lib`, `site/src/scripts` and `site/scripts/lib`, in isolation                                                                             |
| Python    | `mise run py-test`     | pytest, `tests/test_*.py`, with the coverage floor over `scripts/`   | Wrong logic in the repo's Python helpers (`scripts/`): the Vale eval, metrics, config checks, line-break rewrite, run names, wave status and the wave picker       |
| Component | `mise run site-test`   | The same Vitest run; `site/tests/components/` renders `.astro` files | Wrong server-rendered markup: a missing `data-` attribute, a bad prop check, a wrong link                                                                          |
| Examples  | `mise run examples`    | `site/scripts/check-examples.mjs`                                    | A `<Predict run= answer=>` whose fixture prints something else than the lesson shows                                                                               |
| Export    | `mise run checkpoints` | `site/scripts/check-checkpoints.mjs`, after `site-build`             | A built `dist/data/checkpoints.json` that misses a page checkpoint, has an item without a page, or a bad concept id                                                |
| Bundles   | `mise run bundles`     | `site/scripts/check-bundles.mjs`, after `site-build`                 | A built `dist/data/lessons/<id>.json` missing for a page, without an S08 field, or with a fenced block changed; a raw `(@key)` outside code on any built HTML page |
| e2e       | `mise run site-e2e`    | Playwright, `site/e2e/*.spec.ts`, against the built site             | The scripts and the markup disagreeing, a page error, a console error, a flow that only works with real navigation                                                 |

## Tasks

`mise tasks` lists every task with a description. `mise run ci` runs the
same list the CI job runs, in the same order, and its last line says
which task failed. `mise run fast` is that list without the installs and
the e2e walkthrough. The site's checks run in the order of the table
above, after the prose tasks. `mise run site-e2e` builds first and then
runs the walkthrough, the one-command form for local use. `ci` runs
`site-e2e-only` after `site-build`, so the site is built once.
`site-e2e` and `site-screenshot` need `mise run site-browser` once per
machine.

The Python tasks are prefixed `py-`: `py-install-frozen` (uv sync from
`uv.lock`), `py-lint` (ruff check and format check), `py-format` (ruff
fixes), `py-typecheck` (basedpyright) and `py-test` (pytest with
coverage). They cover `scripts/`, `tests/` and the Python fixtures under
`site/examples/`, and `pyproject.toml` holds their config.

## The rules of each check

- **Biome** is the one formatter for `site/` (`site/biome.json`: tabs,
  single quotes, 120 columns; JSON keeps two spaces). Run
  `mise run site-format` rather than hand-formatting. No `// biome-ignore`
  without the reason on the same line. Biome skips the `.astro` template,
  so `astro check` stays the check for that half.
- **Vitest** covers the logic in `site/src/lib`, `site/src/scripts` and
  `site/scripts/lib`, with an 80% coverage floor in `site/vitest.config.ts`
  that is never lowered. Browser code keeps its pure parts in a module
  without DOM access (`progress-model.ts`, `checkpoint-logic.ts`) so they
  can be tested under Node.
- **Examples.** Code examples in lessons are real and their shown output is
  asserted in CI (spec S03, Examples): `<Predict run="..." answer="...">`
  names a fixture under `site/examples/` and `mise run examples` fails on a
  mismatch. An example that can't run says so in the page (the component
  prints this when `answer` is set, `run` is absent and the lesson file
  lists no `proofs`, #311). A `foundations` page can't carry a
  `run=`, so its lesson file lists the fixtures behind it in `proofs`, and
  `mise run examples` fails when one prints a non-blank line that no `text`
  fence on the page shows (spec S03 "Examples", #497).
- **Fixtures without a Predict.** `mise run examples` also fails on an
  entry script that no page names in a `run=` and no lesson file lists
  in `proofs`, because CI would never
  check its output. An entry script is a `.py` file directly in a lesson
  directory, `site/examples/<area>/<lesson>/<name>.py`. The check skips a
  helper whose name starts with `_`, a module that another `.py` file in
  the same lesson directory imports or names in a quoted string literal
  (`"<name>.py"`), and every file that isn't `.py`. A `.py` file in a
  subdirectory, such as `nightly/importer.py`, passes when a `.py` file
  directly in the lesson directory names its whole path relative to the
  lesson directory, or the whole path of a directory that contains it. It
  names the path in a quoted string literal (`"nightly"`,
  `'nightly/importer.py'`) or imports it with dots
  (`import nightly.importer`). A bare file name such as `"importer.py"`
  or `import importer` doesn't count. A deep file that nothing names is
  reported like an entry script. The check doesn't look in `.venv`,
  `node_modules`, dot-directories or symlinked directories. A mention in
  a `#` comment or a docstring doesn't count, even in quotes, because the
  check removes both before it matches. A code span or a longer string
  doesn't count either.
  Wire a new fixture to a `<Predict run=...>`, or on a `foundations` page,
  where `mise run data` rejects `run=`, list it in the lesson file's
  `proofs`. Add it to `UNRUN_EXEMPT` in `site/scripts/lib/examples.mjs`,
  with the reason, only when neither can run it: a script the learner
  runs or reads whose output the page doesn't show, such as a setup tool
  or a model answer. The list only shrinks, and the check fails on an
  entry that a Predict or a proof now runs or that doesn't name an entry
  script.
- **Links.** Internal links are root-relative. `starlight-links-validator`
  fails `mise run site-build` on a dead one, so the build is the check.
  Don't disable it.
- **Spelling** is American English, checked by cspell (`mise run spell`).
  Add names and jargon to `cspell-words.txt`, grouped, one per line, and
  never a British spelling. Inline code spans are skipped, so identifiers
  need no entry.
- **Vale** (`mise run prose`): errors fail the build, style warnings print
  and are the house style. Fix a warning by rewriting unless the rewrite
  reads worse. The style packages are gitignored, so a fresh clone or
  worktree needs `mise run setup` (network) once, and `prose` stops with a
  message naming that task when a package is missing. `prose` and `spell`
  check untracked files too, so a new page is checked before `git add`.
  The vocabulary in
  `.vale/styles/config/vocabularies/ai-training/accept.txt` holds the
  canonical casing of names, and every entry has its casing enforced
  everywhere, so common words never go in. `House.Quotes`: a comma or
  period that isn't part of the quoted text goes *outside* the closing
  quote, so a quoted prompt never seems to end in punctuation the learner
  should type. `mise run prose-extended` adds passive-voice, first-person
  and semicolon rules. Most hits are idiom, so rewrite only what hides who
  does what.
- **Python** (`mise run py-lint`, `py-typecheck`, `py-test`): ruff check
  and format are clean over every `.py` file, basedpyright is clean at
  `strict` over `scripts/` and `tests/` and at `standard` (Python 3.9)
  over `site/examples/`, and coverage of `scripts/` stays at or above 80%.
  `scripts/` keeps its logic in functions that `tests/` imports, with a
  thin `__main__` block. Prefer fixing the cause over a `# noqa` or a
  `# type: ignore`. Where one stays, it names the rule and the reason on
  the same line.
- **Markdownlint.** No unexplained rule disables in
  `.markdownlint-cli2.jsonc`. Say which files and why, on the same line.

## The Astro dev server

Builders don't run `site-dev`. For anyone who does: `astro dev` (what
`mise run site-dev` runs) detaches into a background daemon in Astro 7.
Killing the shell that started it **doesn't** stop it, and a stale daemon
keeps serving old content and old config, which looks like an edit "not
taking". Manage it with the CLI, from `site/`:

| Command                 | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `bunx astro dev status` | Is a daemon running (and its port and pid)    |
| `bunx astro dev logs`   | Its log                                       |
| `bunx astro dev stop`   | Stop it; do this before restarting or leaving |

Restart it (stop, then `mise run site-dev`) after changing
`astro.config.mjs`, `content.config.ts`, or anything under `src/data/`.
For a one-off check of the built site prefer `mise run site-preview` or
`site-screenshot`. Neither leaves a daemon behind.

## Where a new assertion belongs

- **A rule about the progress record or the review schedule** (a stage
  interval, what a skip counts as, what `normalize` drops) goes in
  `site/tests/scripts/progress-model.test.ts`. `progress-model.ts` has no
  DOM and takes the day as an argument, so the test is a plain function
  call.
- **Local-storage behavior** (the event, a failing write, another version
  in storage) goes in `site/tests/scripts/progress.test.ts`, which runs
  under `happy-dom` (the `// @vitest-environment happy-dom` line at the
  top).
- **How a checkpoint kind grades** goes in
  `site/tests/scripts/checkpoints.test.ts`, against a hand-written copy of
  the component markup. Feedback texts and the shuffle rule are pure
  functions in `checkpoint-logic.ts` with their own test file.
- **What a component renders** (an attribute the script reads, a prop
  validation that must throw) goes in `site/tests/components/`, with
  Astro's Container API. Components that read the content collections
  get their lessons from the fixtures in `site/tests/lib/content.ts`, since
  `getCollection()` returns nothing under Vitest.
- **A flow across pages** (finish a lesson, then see it on the course
  page; the review page fetching checkpoint markup from a lesson) goes in
  `site/e2e/`, one spec file per mechanism. Seed progress with the `seed`
  fixture instead of clicking through an earlier flow, and use auto-waiting
  `expect(locator)` assertions rather than sleeps. A count of live lessons
  in a course or a topic, of the checkpoints on a lesson page, or of its
  ungraded examples, comes from `liveCourseLessons`, `liveTopicLessons`,
  `lessonCheckpoints` or `lessonExamples` in
  `site/e2e/fixtures.ts` (over `site/scripts/lib/live-lessons.mjs`), never
  from a literal, so a new lesson page or checkpoint doesn't change a spec.
  `passRemaining` passes whatever checkpoints a page still has open, and
  `passCheckpoint` passes one by its id. Both work for the kinds with a
  solver (`predict`, `choice`, `scenario` and `order`), and throw on any
  other kind, so a lesson that gains one says so.
- **A code example's output** is already asserted: `<Predict run="..." answer="...">` names the fixture and `mise run examples` compares it, so it gets no separate test.

## Rules from review

Each of these came from a review finding in a wave.

- An e2e in-viewport assertion after a click needs a not-in-viewport
  assertion before the click, or it passes when the click did nothing.
- An e2e selector for a component picks its element by structure
  (`pre code`) and not by position (`code` nth(1)), since a review fix can
  add an element above it.
- A test that a module-level path doesn't depend on the working directory
  reloads the module after the `chdir`, or it passes against the bug.
- A CSS rule for markup inside the Starlight sidebar is checked in the
  built page at the target width, because Starlight's own styles apply
  there and the Container API tests don't see CSS.
- A change to markup that a Starlight client script reads (the sidebar's
  `details` and `summary`) is tested from the restored state, and on a
  fresh page as well.
- A check over rendered HTML ends the text of each block element (`p`,
  `li`, `td`, `h1` to `h6`, `div` and the other layout blocks) with a
  space, so words from two blocks don't join. It also reads the `alt` and
  `aria-label` attributes and the `content` of the meta description. The
  #310 review (LEMUR wave 1) found both gaps in
  `site/scripts/lib/rendered-citations.mjs`, which now has `BLOCKS` and
  `ATTRIBUTES` lists for them.
- A parser for a vendor file format names the vendor page for each rule
  it copies, such as how a repeated key merges.
- A parser of GitHub comment text normalizes CRLF before it splits lines,
  and follows CommonMark for fences: a backtick fence's info string holds
  no backtick (Narwhal wave 1).
- A port from JavaScript to Python uses `re.fullmatch` or `\Z` where the
  JavaScript anchored `^...$`, because Python's `$` also matches before a
  trailing newline (Ocelot wave 1).
- A matcher that decides whether a file is named matches whole relative
  paths, never a bare file name or a last path segment (#468).
- When siblings are matched by a shared key (an objective), the test
  covers two items that share one sibling.
- In an `.astro` template, a link and the words next to it stay on one
  source line. The compiler drops the newline at a tag's line edge, and
  #70 shipped two words run together this way.
- A script that toggles `hidden` on an element with a `display` rule
  restates `[hidden] { display: none }` for it, as `.checkpoint [hidden]`
  does.
- A widget that takes pasted text says on the page that the text stays in
  the browser.
- A spec change written for a case that doesn't exist yet (a lesson
  gaining a checkpoint) proves that case once with an uncommitted
  temporary edit (Heron wave 2).
- A script that a pre-push hook runs and that writes files writes them
  atomically, and the hook sets `require_serial` (#454).

## Coverage

`site/vitest.config.ts` sets an 80% floor for lines, functions, branches
and statements over `site/src/lib`, `site/src/scripts` and
`site/scripts/lib`. `mise run site-test` fails when a run drops below it.
Do not lower the floor to get a change through: add the test, or move the
logic into a module that can be tested. `.astro` files are not
instrumented (their template half runs in the e2e suite), and
`lesson-context.ts` is excluded because it only reads route locals.

The logic of a new site command goes in `site/scripts/lib/`, and its entry
script under `site/scripts/` only reads and prints, because the coverage
include is `scripts/lib/**/*.mjs`.

The `<script>` block of a component holds only the import of its module
under `site/src/scripts/` and the call that starts it, so the logic is
under Biome, the strict tsconfig flags and the coverage include set. A part
of the page the component always renders is looked up with
`requiredElement` or `requiredData` (`site/src/scripts/required-element.ts`),
which throw with the selector when the markup and the script disagree.

## Timeouts

`site/vitest.config.ts` doesn't set `testTimeout` or `hookTimeout`. Every
test gets Vitest's default of 5000 ms and every hook 10000 ms, and unit and
component tests keep them: a test that needs longer is doing too much. A
test that starts a child process takes a per-test timeout of 30000 ms,
because the child process gets slow when several builders share one
machine (#555). The tests in `site/tests/scripts/examples.test.ts` that
run Python on a temporary fixture tree take it, and so does the
`afterAll` hook in `site/tests/scripts/data.test.ts`, whose deletion of
the temporary trees took over 10 s under that load. The timeout is the
last argument to `it()` or `afterAll()`, with a comment on the same line
saying why, and the rest of the file keeps the default. A test that can
call the code in-process does that instead: the `lesson-plan command` test
in `site/tests/scripts/lesson-plan.test.ts` imports
`site/scripts/lesson-plan.mjs` and doesn't start `bun`. The sweep over
every `<Predict run=...>` fixture runs in `mise run examples`, outside
Vitest, and `examples.test.ts` checks `site/scripts/lib/examples.mjs`
against temporary fixture trees only (#330).

An agent gives every build and Playwright run an explicit Bash timeout.
In Heron wave 2, builders without one hit the 600-second stream watchdog.

## A second build needs a second worktree

`mise run site-build` writes to `site/.astro/` (the content collection
types and modules) and `site/node_modules/.vite/deps` (Vite's dependency
cache) while it runs. A second build started in the same worktree while the
first is running writes to the same files, and one of them fails or builds
from the other's half-written output. A test that runs builds in parallel,
such as a load or concurrency check, runs each build in its own worktree, and
this covers `site-build` next to `site-e2e` too, since `site-e2e` builds
first.

## Running the browser suite

`mise run site-browser` installs Chromium once. `mise run site-e2e` builds
the site, and Playwright starts `site/scripts/serve-dist.mjs` (a static
server for `site/dist`), runs `site/e2e/`, and stops the server. The server
listens on `E2E_PORT` when it is set, and otherwise on a free port that
`site/playwright.config.ts` asks the OS for, so two e2e runs on one
machine don't collide. To run one
file: `cd site && bunx playwright test e2e/review.spec.ts`. On a failure the
trace is under `site/test-results/`, and `bunx playwright show-trace <zip>`
opens it. Every spec blocks requests that leave `localhost` and fails on a
`pageerror` or console error (`site/e2e/fixtures.ts`).

## When the browser suite runs

`mise run ci` always runs `site-e2e`. The CI workflow
(`.github/workflows/ci.yml`) runs the `e2e` job on every push to `main` and
on `workflow_dispatch`, but on a pull request only when the diff touches a
file outside this skip set: `docs/`, any `.md` file outside `site/`,
`.vale.ini`, `.vale/`, `cspell-words.txt`, `.markdownlint-cli2.jsonc`,
`.lychee.toml` and the license files. An empty diff runs the job. The
`paths` step of the `build` job computes it with `git diff --name-only`
against the base branch and the `e2e` job has a job-level `if:` on its
output, so a skipped run still reports a (skipped) status for the job.

Lesson pages under `site/src/content/` and the data tree under
`site/src/data/` aren't in the skip set. The specs in `site/e2e/` derive
their live-lesson and checkpoint counts from the data tree and click
through lesson pages, so a content change can break them, and the round
trip through a red `main` costs more than the job does. Widen the skip set
only for files no spec can read.

`astro preview` is not used here: in Astro 7 it hands the port to a
detached child and exits, so a supervisor cannot stop it. The static server
serves the same files under the same `/ai-training` base path.

## Before a push

`prek.toml` runs its hooks at two stages. Before a commit, the lint hooks
run on the staged files. Before a push, the same hooks run again on the
files the push changes, and so do `cspell` and Vale (the checks of
`mise run spell` and `mise run prose`, with the same file rules). The push
stage is there for commits that no pull request checks yet, such as a
builder branch in integration mode before its wave branch opens a pull
request. Ten of the twelve red runs on `main` between 2026-09-20 and
2026-09-24 were spelling, Vale or mdformat hits in commits pushed
straight to `main`, the dispatcher's records before they moved to run
issues (#344, #353). Install all three hook types once per clone with
`prek install`. The `default_install_hook_types` line in `prek.toml` names
them. `prek run --stage pre-push --from-ref origin/main` runs the push
stage by hand.

After the last edit under `site/`, run `mise run site-format` and then
`mise run site-lint`, before the push.

## Lint notes

Biome formats and lints the frontmatter of `.astro` files and leaves the
template and the `<script>` blocks alone, so `astro check` stays the
check for those two. Because Biome cannot see the template, the
unused-variable rules are off for `.astro` files (`overrides` in
`site/biome.json`). `noNonNullAssertion` is `error`: a lookup that can't
fail throws with a message or uses `requiredElement`, and never `x!`. A
`// biome-ignore` needs the reason on the same line.

`exactOptionalPropertyTypes` is deliberately not set in `site/tsconfig.json`:
Astro passes an absent optional prop as `undefined`, which fails six
`CheckpointShell` prop checks under that flag.
