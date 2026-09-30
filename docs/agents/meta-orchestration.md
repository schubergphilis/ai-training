# Meta-orchestration: a dispatcher over many waves

How one long-running session works through every `ready-for-agent` lesson
issue without filling its own context. It adds one layer above
`orchestration.md`. That document describes one wave, from issues to a merged
wave pull request, and nothing in it changes. This one describes the loop
that runs wave after wave.

## Why a second layer

The coordinator of `orchestration.md` spends about 20k tokens of its own
context per issue. The session of 2026-09-20 (waves 2 and 3, about twenty
issues) peaked at 456k tokens and was compacted once. Wave 5 (ten issues)
reached 220k. What fills it is relayed detail. The final reports of builders
and reviewers are 3k to 9k characters each, and the output of `gh pr list`
and CI polling adds to that. The coordinator's own decisions are a few
hundred words per issue.

With 113 issues ready on 2026-09-23, one coordinator context can't hold the
run. So the coordinator role moves down one level, into a disposable *wave
lead* agent that lives for one wave, and the session becomes a *dispatcher*
that only ever holds one short report per wave.

## Roles

| Role       | Agent                              | How many       | Lives in                                | Context per wave               |
| ---------- | ---------------------------------- | -------------- | --------------------------------------- | ------------------------------ |
| Dispatcher | the `/wave` session                | one            | the main checkout, on `main`, in a loop | one report, under 200 words    |
| Wave lead  | `wave-lead`                        | one per wave   | its own context, spawning the others    | the whole wave, then discarded |
| Builder    | `builder`                          | one per issue  | its own worktree and branch             | as in `orchestration.md`       |
| Reviewer   | `lesson-reviewer`, `code-reviewer` | one per branch | its own worktree                        | as in `orchestration.md`       |

A dispatcher resumed after the restart of a harness wave runs in the wave
worktree, on the branch `wave/<name>-<k>`, until the maintainer starts a
new session in the main checkout after the merge ("Harness runs", steps 5
and 6, and `.claude/skills/wave/SKILL.md`, "Resuming after a restart").

The four agents are defined in `.claude/agents/`, all on Opus 5.5: the
lead at `high` effort with a 400-turn limit, the builder and the reviewers
at `medium` with 200 and 80. The dispatcher spawns `wave-lead` by name,
and the lead spawns the others by name, so no prompt sets a model. The
`wave-lead` file holds everything that is the same for every wave, and the
template holds the rest.

Nested spawning works: a `general-purpose` agent can spawn its own agents,
resume them with `SendMessage`, and receive their notifications. Only the
wave lead's final text reaches the dispatcher. (Tested 2026-09-23 with a
lead that ran two sub-agents and a follow-up message: three results, no
duplicate or missing notifications.)

A lead waits by ending its turn. When a subagent ends its turn while its
own children run, nothing reaches its parent. Each child's notification
wakes it, and its parent hears from it only when it stops with no child
left running. (Tested 2026-09-24 with a lead that spawned two children
running `sleep 90` and ended its turn at once: the children woke it about
90 seconds later, and the dispatcher got one notification, the final
report, after both had finished.) So the lead ends its turn while
builders and reviewers run, and waits in the foreground only for a check
it started itself (`mise run ci`, `gh pr checks --watch`,
`gh run watch`), and it never ends its turn while one of those runs.
Sleeping and polling cost the most: waves 9 to 13 spent 61 to 81% of the
leads' wall time in `sleep`, and a sleeping lead started each reviewer 2
to 6 minutes late. Verdicts come back in the reviewer's hand-back, and nobody polls a
pull request for review comments. The Bash guard hook rejects a `sleep`
over 60 seconds and a loop that polls `gh`.

The concurrent-agent cap (20 on this platform) is shared by every level, so
the dispatcher runs one wave at a time. With six issues in a wave, the lead
runs six builders plus up to six reviewers, under the cap with room for the
`code-review` skill's own sub-agents.

## Starting the loop

`/wave` (`.claude/skills/wave/SKILL.md`) is the dispatcher. On a fresh
session in this repo it runs the preflight, opens or resumes a run issue,
pulls `main`, runs the picker, fills the wave lead template at
`.claude/skills/wave/wave-lead-prompt.md`, spawns the lead, reads the
report, updates the run issue, and repeats until a stop condition, with
no further instruction from the maintainer. Its arguments: `/wave [size]`,
default 6, or 4 for a harness run, then any of
`--kind lessons|content|code|harness` (what the picker selects, planned
lessons by default), `--only N,N,...` (an issue whitelist for the
run, and the picker skips everything else), `--no-filing` and
`--resume <Name>`. The skill loops on its own and waits for each lead in
the foreground. An optional watchdog is the maintainer's choice, and a
second `/wave` in a session with a lead running would spawn a second
dispatcher, so don't run one.

`--no-filing` is the bounded-run mode for an unattended session. In the
default mode every wave files follow-up issues, and some of those are
`ready-for-agent` content issues, so a content run can feed its own queue
and never reach the empty wave that ends the loop. With `--no-filing`
nobody files an issue while the run goes, so the queue only shrinks and
the loop ends. The follow-up rule is otherwise the same in both modes:
each lead writes the issue it would have filed, title, body, labels and
parent, in one comment on the run issue, and when the run ends the dispatcher
checks each entry once against `main` and files the ones that still hold.
The overnight run of 2026-09-24 left 24 follow-ups in a record instead,
and 6 of them were obsolete by the evening. Nothing waits in a record for
the maintainer to reconcile.

## Runs and run issues

A run is one `/wave` session from its start to its stop condition, and
its record is one GitHub issue with the `dispatcher-run` label, titled
`Run: <Name> (<kind>)`. The body holds the arguments, `Remaining --only`,
`Parked`, `Pending collision notes`, `Standing approval` and the
`## Waves` list with the `In flight` line, and the dispatcher edits it
as the run goes. Each wave report is a comment, and the issue closes
with a comment that names the stop condition. The dispatcher commits
nothing to `main`, so its record costs one API call and no commit, lint
pass, CI run or deploy, and the maintainer can read it from a phone. The
per-wave session record goes in the body of the wave pull request, under
the review table. The runs before 2026-09-25 kept their records in
files, and those records are now closed run issues too, from Badger
(#359, waves 1 to 5) to Ferret (#363).

Runs are named after animals in alphabetical order, like hurricanes:
Axolotl, then Badger, Capybara and so on, from the two lists in
`.claude/skills/wave/run-names.txt`. `mise run run-name` prints the open
runs and the next name, the letter after the newest run's name, skipping
a name an open run still holds. After Z the second list starts at A, and
after its Z the first list comes back. A name never says which machine
or session a run is on, and `/wave` never guesses it. A session
continues its own run with `--resume <Name>` and otherwise starts a new
one. A wave merge can close the run issue when the PR's text names it
after a closing keyword, and the dispatcher reopens it right after the
merge. When the session stops before that, `--resume <Name>` finds the
newest closed run with the name, and `run-name` gives it as `reopen` when
a pull request or a commit closed it and no trusted comment on it starts
with `Run ended:` or the older `Stop condition:`. The dispatcher then
reopens it, and the run goes on with its `## Waves` and
`Remaining --only`. A run closed by hand, or with a stop comment, has
ended, and the resume stops.

The dispatcher session has the name `wave <name> <kind> <yyyy-mm-dd>`,
in lowercase, with the date the run started, for example
`wave heron code 2026-09-25`, so `/resume` and the terminal show which
run each session is. The `/wave` prompt is the one prompt the maintainer
types in a run, and a `UserPromptSubmit` hook,
`.claude/hooks/session-title.sh`, sets the title from it. A hook can set
the title this way (<https://code.claude.com/docs/en/hooks>,
"UserPromptSubmit decision control"). For a new run it uses the next
name from `run_name.py`, the `--kind` and today's date, and for
`--resume <Name>` it uses that open run's kind and the date its issue was
opened, both in UTC. It sets no title for any other prompt, and never
blocks the prompt when something fails. When the name check gives the
run a later name, or the harness has no such hook, the dispatcher's next
message starts with `/rename wave <name> <kind> <yyyy-mm-dd>` for the
maintainer to type. A new session can also start with its name:
`claude -n "wave <name> <kind> <yyyy-mm-dd>"`
(<https://code.claude.com/docs/en/cli-reference>, `--name`).

Wave `k` of run Capybara is on the branch `wave/capybara-<k>`, and reports
call it `CAPYBARA wave <k>`. The count starts at 1 in every run.

## Concurrent runs

More than one run may be open at once, for example a lessons run and a
code run on two machines. A harness run is the exception: it starts only
when no other run is open, and no other run starts or resumes while it is
open ("Harness runs"). One set of rules covers one run or several:

- **Preflight.** Before the first wave the dispatcher runs `git fetch` and
  stops when the local `main` is behind, ahead of or diverged from
  `origin/main`. On 2026-09-24 one checkout was 60 commits ahead and 360
  behind after a history rewrite.
- **Names.** A new run takes the next name, opens its issue, and checks
  again (`mise run run-name -- --check <n>`). When an older open run got
  the same name first, it closes its issue and takes the next letter.
- **Claims.** When a wave starts, the dispatcher assigns each issue, so
  the other run's picker skips it, and comments
  `Claimed by run <Name>, wave <k>`. Then it reads each issue again, and
  when another open run's claim comment is older, it drops the issue from
  the wave and says so. It reads the claims through
  `mise run wave-status -- --claims-and-follow-ups`, which lists only the
  comments by the accounts in `TRUSTED_VERDICT_AUTHORS`, so another account's claim
  comment drops nothing (#605). The maintainer starts runs by hand minutes apart,
  so the check after the claim catches the rare race.
- **The shared template.** While another run issue is open, a run doesn't
  edit the wave lead template. Its collision notes wait in the
  `Pending collision notes` section of its own run issue, and each later
  lead of that run gets them in its prompt.
- **Files the other run touches.** A code wave leaves lesson pages, lesson
  and plan YAML, the bibliography, `cspell-words.txt` and the S02 table
  alone unless its issue names them. Every lead rebases the wave branch on
  `origin/main` and reruns `mise run ci` right before the merge, since the
  other run may have merged in the meantime, and names any stricter check
  in the pull request body.
- **The cap.** Both runs share the concurrent-agent cap, so keep their
  wave sizes small enough that two leads with all their builders and
  reviewers fit.

## The loop

One tick:

1. **Pull.** `git pull --rebase` on `main`. The dispatcher commits
   nothing, so this is a fast-forward.
2. **Wave number.** One more than the finished waves on the run issue's
   `## Waves` list.
3. **Resume check.** An `In flight` line on the run issue is a wave whose
   lead never finished. The dispatcher then spawns a lead for that wave
   and branch with the resuming line filled in, and the lead follows
   "Resuming a half-done wave" in its agent file: run
   `mise run wave-status`, which reads the last review verdict for each
   pushed branch from the trusted accounts only, reuse the worktrees that exist, spawn
   only what is missing, and never redo a branch with an approve verdict.
   Only the issues on the `In flight` line count for
   `origin/feat/<issue>-*` branches, so a stale branch from an earlier
   run starts nothing. The wave branch has no date, so a next-day resume
   finds it. A last line `wave <k>: awaiting approval, PR #<n>` is a
   merge question the maintainer hasn't answered yet ("Standing
   approval"), and the dispatcher asks it again before any new wave.
4. **Pick.** Run `mise run next-wave -- --size 6`, with `--kind` and the
   remaining whitelist as `--only`. The picker is
   `scripts/next_wave.py`, and it reads the lessons of the checkout as
   the JSON that `mise run lesson-plan` (`site/scripts/lesson-plan.mjs`)
   prints. For a lessons wave it lists the planned lessons whose issue
   is `ready-for-agent` and unassigned, and drops the ones that assume
   an objective no live lesson on `main` serves. A plan file's `assumes`
   entries name only the objective, the builder adds the `lesson` and
   `section` that teach it when the page goes live, and the build
   (`mise run site-build`, through `MarkdownContent.astro`) rejects a
   page that names a lesson without a page, so such a lesson can't be
   merged in this wave. Within an area it orders the rest with no
   planned `after` first, then earliest-in-course, takes them
   round-robin across the areas, and prints the wave as a table plus
   `--json` for the prompt.
   With `--unblockers-first`, each candidate is scored by how many blocked
   lessons it serves a missing objective for, the score sorts before the
   course position and after the planned `after` rule, and the table gains
   an `Unblocks` column with that count.
   It also lists what it blocked and skipped and why, which candidates wait
   for a later wave, and, under `--only`, every listed number it didn't pick
   with the reason, so nothing drops silently. A content wave
   (`--kind content`) is the ready, unassigned `content` issues that no plan
   file claims, by ascending number. A code wave (`--kind code`) is the
   ready, unassigned `code` issues, the `bug` issues first and then
   ascending number, the order run Emu (#362) chose by hand. A harness
   wave (`--kind harness`) is the ready, unassigned `harness` issues by
   ascending number, 4 by default. For every kind
   the picker asks GitHub only for the open `ready-for-agent` issues, plus
   the kind's label for the other three kinds, and it blocks an issue
   with an open native `blockedBy` issue, a `Blocked by #N` body line for
   an open #N or a `Not before` line with a later date (`triage.md`,
   "Dependencies").
   It counts a number that is both a native blocker and a line once. The lead adds a code review for a branch whose diff
   changes code, which is every branch of a code wave. A nits issue is left
   out because it arrives as the nits row. An issue with more than one
   kind label is listed under Skipped as `has more than one kind label`
   in a content, code or harness wave, until someone relabels it. A code
   or harness wave leaves out an issue a plan file claims too, as a
   content wave does, since lesson work runs only in a lessons wave (#526).
   The picker reads the tree of the checkout it runs in, which is why the
   pull comes first.
   The dispatcher then decides on the nits row: the one open
   issue titled `Cosmetic nits`, as one row for one nits builder in one
   worktree and branch, reviewed with a diff read plus the fast checks and
   no content review. It joins only when the issue has 10 or more nit
   lines or the table is otherwise empty. A wave that is only the nits
   row proceeds. An empty table ends
   the loop.
5. **Claim, mark the wave in flight and spawn the wave lead.** The
   dispatcher claims the wave's issues (see "Concurrent runs"), writes
   `In flight: wave <k>, branch <b>, issues #a #b ...` on the run issue,
   then spawns the lead with the filled template, waits for the lead's
   notification and does nothing else.
6. **Read the report and update the run issue.** Post the report as a
   comment on the run issue, replace the `In flight` line with the wave's
   status and pull request, copy its `Add to collision notes` and
   `Remove from collision notes` lines to the `Pending collision notes`
   section, and under `--only` remove the merged and the left-out issues
   from the remaining whitelist, parking the left-out ones so the run
   never picks them again. The wave lead never edits the run issue's
   body. Then, on `merged`, play the chime and go to step 1. On `open`,
   the lead has hit the standing-approval exception (below). Report it to
   the maintainer and stop, except for an `open` with the reason
   `approval withdrawn`. Its line is
   `wave <k>: awaiting approval, PR #<n>`, and the dispatcher asks the
   maintainer and goes on after a merge ("Standing approval"). On a
   harness wave's `open`, the line is
   `wave <k>: awaiting restart, PR #<n>` and the run stops at "harness
   wave awaiting restart" ("Harness runs"). On `failed`, the `In flight`
   line stays, report to the maintainer and stop. The next
   `/wave --resume <Name>` finds the wave in step 3 and resumes it.
7. **File the follow-ups.** Every item on the report's maintainer line,
   every nit the lead left open on a merged branch, and every improvement
   deferred during the session becomes a GitHub issue before the next wave
   starts, filed and triaged as `triage.md` describes and linked from the
   session record. A follow-up from the review of issue N is filed as a
   sub-issue of N (`gh issue create ... --parent N`, `triage.md`, "Where
   an issue came from"). The wave lead files the ones it has the context for and
   lists their numbers on the report's `Filed` line. The dispatcher files
   the rest. There is one open nits issue at a time, titled
   `Cosmetic nits`: a lead appends a line per open nit to its body and
   creates it only when none is open. The nits row joins a wave only when
   that issue has 10 or more lines or the picker's table is otherwise
   empty, so the nits no longer chain from wave to wave (#256 to #315 were
   eight such issues). With `--no-filing` the lead writes its follow-ups
   comment on the run issue instead, and the dispatcher files it when the
   run ends.

The dispatcher edits no code, commits nothing and runs no check of the
site, except for a small fix on a harness wave branch after the restart.
The loop ends on a failed preflight, a refusal by the harness
exclusivity check, a `--kind` value that isn't a kind, a picker that
exits non-zero, an empty wave, an exhausted whitelist, an `open` or
`failed` report (for a harness wave, "harness wave awaiting restart"), a
failed step after a restart, the maintainer declining a harness merge,
a lead's merge under a withdrawn approval, a failed dispatcher merge of
a wave `awaiting approval`,
or the maintainer saying stop, and the dispatcher reports which. An
`open` with the reason `approval withdrawn` that the maintainer approves
doesn't end the loop. On most stops it comments the stop condition on
the run issue, files the `--no-filing` follow-ups and closes it. It
leaves the run open, with nothing filed, on `failed`, on "harness wave
awaiting restart", on a failed step after a restart, on the maintainer's
no to a harness merge, on a failed dispatcher merge of a wave
`awaiting approval`, on the picker exiting non-zero, and when the
exclusivity check of "Starting a run" step 1, the preflight or the
`--kind` value check stops a resumed run, since a later
`/wave --resume <Name>` continues it. On a new run those three stops
come before the run issue exists, so there is no run to close. The
exclusivity check that a new run runs again after it creates its issue
closes that issue itself, with a comment that quotes the refusal.
When it closes the run, it removes itself as assignee from each issue
that a wave without a merge still claims, except the ones an open wave
pull request closes, and comments on each with the review state of its
`feat/` branches.

A picker that exits non-zero stops the loop too, before any claim. The
dispatcher quotes the picker's `next-wave:` error line, such as a failed
`gh issue view` for a mistyped `--only` number or `Blocked by #N` target,
and leaves the run open for a resume once that is fixed. It comments
the quoted line and the fix on the run issue, so a later reader of the
issue sees why the run stopped.

## Standing approval

The maintainer gives standing approval, up front, for a green wave pull
request: `mise run ci` green on the wave branch, GitHub CI green, every
branch in it approved on its re-check, and no open finding. A branch
approved on its first review whose fix commit the lead re-checked itself
(the `re-checked by lead` comment) meets the re-check condition. The
wave lead merges such a pull request itself with
`AI_TRAINING_ROLE=wave-lead gh pr merge <n> --rebase`, without a round
trip. A wave that doesn't meet every condition stays open, and the lead
returns `open` with the reason. A review finding that needs the
maintainer's decision (strike a spec feature, choose between two designs)
always goes to them instead of being merged, and so does any change to a
spec, a gate, or shared tooling that a lesson branch drags along. The
standing approval never covers a harness wave ("Harness runs").

The maintainer withdraws the standing approval by saying so in the
session or in a comment on the run issue. The dispatcher records it in
the run issue's `## Standing approval` section, with the comment's URL
or `in session` as its source, so a later wave and a `/wave --resume`
read it back and never record one comment twice. A wave whose lead is
running keeps the approval it started with, and from the next lead the
dispatcher spawns, including the new lead of a resumed wave, it goes
back to per-PR approval. When the dispatcher resumes a wave, a
withdrawal given while its earlier lead ran applies from that wave,
whether that lead reported `failed` or never reported, because the
resume spawns a new lead. A withdrawal in the session and one in a
comment then act the same. The dispatcher fills the lead prompt's
`{{APPROVAL}}` line with the withdrawal, which is otherwise left out.
The lead of such a wave opens the wave pull request, doesn't merge it,
and returns `open` with the reason `approval withdrawn` when every
condition above holds, after it removes the wave's worktrees. The
dispatcher marks the wave `awaiting approval` on the run issue, plays
the chime, asks the maintainer to approve the pull request, and on
approval merges it with
`AI_TRAINING_ROLE=dispatcher gh pr merge <n> --rebase`. It then treats
the wave as `merged` and goes on to the next wave. When that merge
fails, the wave stays `awaiting approval` and the run stops, and a lead
that merges under a withdrawn approval stops the run too. Without the
approval it stops as on any other `open`, and an `open` for any other
reason still ends the loop. The standing approval comes back only when
the maintainer gives it again.

## The wave lead prompt

The lead starts with no context but its agent file,
`.claude/agents/wave-lead.md`, which holds the brief, the roles it spawns
by name, integration, the standing approval, the waiting rule, the
two-round revision limit and the resume steps. Its prompt is the template
at `.claude/skills/wave/wave-lead-prompt.md`, which `/wave` fills with the
wave's name, the run issue, the branch, the date, the picker's table, the
filing paragraph, the fresh-or-resuming line and, when the standing
approval is withdrawn, the approval line. Between them they hold
everything below.

- The wave as `next-wave` printed it: issue numbers, lesson ids, course
  positions, and for each lesson the `after` entries that are still
  planned. A planned `after` is ordering advice for the lead (spec S11:
  the lesson graph reads `after` only while a lesson is coming, and
  neither the data check nor the build needs its target live). It never
  requires stacking one branch on another. The picker blocks the `assumes` dependencies that
  would.

- The instruction to follow `docs/agents/orchestration.md` end to end, in
  integration mode: one builder per issue, one reviewer per pushed branch,
  the review on the issue, the revision loop until `Verdict: approve`, the
  wave branch `wave/<name>-<k>`, one pull request with the review table,
  `mise run ci` on the wave branch. The builder prompt items in that
  document, and everything the session records say the prompt should have
  said, are the builder brief.

- The standing approval as written above, and the merge command.

- The builder, lead and reviewer rules, and two collision lists, one for
  lessons and one for code. The lead passes each builder the builder
  rules and the list that matches its issue. The template is the
  canonical copy, and this document keeps none. Durable rules live in
  `writing-a-lesson.md` ("Rules that bite") and `testing.md` ("Rules from
  review") instead. Each list holds at most 15 bullets. A wave report
  proposes changes on its `Add to collision notes` and
  `Remove from collision notes` lines, the dispatcher keeps them under
  `Pending collision notes` on the run issue, and they reach the template
  only after the maintainer has read them, through a later wave branch
  while no other run is open. At the cap a new note replaces an old one
  or becomes a check.

- The nits row rule and the "Resuming a half-done wave" section, so a lead
  that starts after a failed one knows what to reuse and what to spawn.

- The filing paragraph: file per `triage.md` and append open nits to the
  one `Cosmetic nits` issue, or, under `--no-filing`, write the follow-ups
  comment on the run issue for the dispatcher to file when the run ends.

- What the lead writes and returns. It puts the session record in the
  wave pull request body, in the form of the wave comments on the
  older run issues (Capybara, #360, for example): counts, what review caught, what the builder prompt
  should have said. It returns a report of at most 200 words in exactly
  this form:

  ```text
  <NAME> wave <k> <merged|open|failed>
  PR: #<number>
  Merged issues: #a #b ...
  Left out: #c (<reason>) ...
  For the maintainer: <decisions needed, or none>
  Filed: #<issue> <title> ... (or none)
  Follow-ups: <none, or the link to the follow-ups comment under --no-filing>
  Add to collision notes: <lessons|code: one line each, or none>
  Remove from collision notes: <lessons|code: the bullet's first words and why, one line each, or none>
  ```

  The 200 words exclude the `Follow-ups` lines.

- The rule not to ask questions. The lead makes the call, states it in the
  pull request body, and puts the decision in the report's maintainer line.

## Kinds of run

A run has one kind, the `--kind` it started with, and the picker selects
by it. Each issue has exactly one kind label (`issue-tracker.md`,
"Labels").

- `lessons`: the planned lessons, from their plan files.
- `content`: the `content` issues that no plan file claims.
- `code`: the `code` issues that no plan file claims, `bug` issues first. Each builder gets the
  code collision notes and each branch a `code-reviewer`, and the
  standing approval applies as for any wave. A code run can be open next
  to a lessons or content run, and "Files the other run touches" under
  "Concurrent runs" keeps the two apart.
- `harness`: the `harness` issues that no plan file claims, 4 per wave by default, since every
  issue adds items to the one checklist the maintainer works through by
  hand. It builds and reviews like a code run and merges only after a
  restart, as the next section describes.

## Harness runs

Agent files, hooks, `settings.json` and skills load when a session
starts, so a harness change can only be tested in a new session. PR #357
resolved 12 `harness` issues in one session this way by hand. A harness
wave is never merged in the session that built it:

1. **Pick.** The ready, unassigned `harness` issues, with the dependency
   lines, by ascending number.
2. **Build and review.** One `builder` and one `code-reviewer` per issue,
   with the code collision notes. The checks that work without a restart
   run in the wave: the pytest tests for `scripts/agent_hooks.py`, a hook
   script called by hand with JSON on stdin, the frontmatter of the agent
   files, and `mise run ci`. Each builder's reply on its issue ends with
   an `After the restart` list of the checks that need a new session,
   each with what to type and what to expect.
3. **`settings.json`.** Agents are denied `Edit(./.claude/settings.json)`,
   and that control stays. A builder whose issue needs a settings change
   puts the exact change in its issue reply. The lead copies it into the
   PR body under `settings.json`, and the maintainer applies it.
4. **Stop.** The lead opens the pull request with the collected
   `After the restart` checklist and reports `open`, whatever the other
   conditions. The dispatcher chimes, writes
   `wave <k>: awaiting restart, PR #<n>` on the run issue, and stops with
   "harness wave awaiting restart". Its last message gives the PR number
   and the lines to run: quit, then
   `cd ../ai-training-wt/wave/<name>-<k>`,
   `claude -n "wave <name> harness <yyyy-mm-dd>"` and
   `/wave --resume <Name>`.
5. **Restart in the wave worktree.** The new session loads the harness
   from the wave branch, so no untested harness reaches `main`.
   `/wave --resume <Name>` sees the `awaiting restart` line, skips the
   preflight that compares `main` with `origin/main`, and rebuilds its
   run file in the worktree's `.scratch/` from the run issue alone. It
   runs every item on the PR's checklist, posts the results on the PR,
   fixes a small gap on the wave branch, and asks the maintainer whether
   to merge. It merges only on the maintainer's word.
6. **After the merge**, the dispatcher runs the checklist items that
   need the merge, closes the run when a stop condition holds, and tells
   the maintainer to quit and start again in the main checkout. The run
   goes on there with `/wave --resume <Name>`, or it has closed.

A harness run starts only when no other `dispatcher-run` issue is open,
and while it is open, `/wave` refuses to start any other run and names
the harness run. The check is `mise run run-name -- --exclusive <kind>`
for a new run and `mise run run-name -- --resume <Name>` for a resumed
one (`scripts/run_name.py`, with tests). It reads each open run's `kind`
from its issue title and leaves out the run being resumed, so the
restarted session's own `/wave --resume <Name>` passes. It exits 3 when
it refuses, so a checklist can run the refusals as commands. A new run
runs it again after `gh issue create`, with `--check <n>`, and then counts
only the runs with a lower issue number: of two new runs that both passed
the first check, the one with the higher number closes its issue with a
comment that names the other run. This second check also reads the 50
newest issues through GraphQL, since the `gh issue list` label listing
goes through the search index and can miss an issue created a few
seconds before (#616). A closed run counts for no run's check, and a
run whose issue a merge closed passes its own check with `--resume`
before it is reopened ("Runs and run issues"). The
`harness-review` reminder at preflight stays, since a harness run is
where the issues a review files get done.
