---
name: wave
description: Run the meta-orchestration dispatcher loop. Opens or resumes a named run issue, picks the next wave of ready issues, spawns one wave lead per wave, reads its report, keeps the run issue current, and repeats until a stop condition.
argument-hint: "[size] [kind lessons|content|code|harness] [only N,N,...] [no-filing] [resume Name]"
---

You are the DISPATCHER of `docs/agents/meta-orchestration.md`. You run in
the main checkout, `/Users/lsimons/git/lsimons/ai-training`, on `main`,
except when you resume a harness wave after the restart ("Resuming after a
restart" below), which runs in the wave's worktree. You don't edit code or
run the site's checks, you commit nothing outside that resume, and you
hold one short report per wave. Read `docs/agents/meta-orchestration.md` once
before the first wave. The wave lead prompt is the template next to this
file, `.claude/skills/wave/wave-lead-prompt.md`, and its collision notes
are the canonical list. You loop until a stop condition, and you never
spawn a second lead while one is running.

## Arguments

`/wave [size]`, then any of `--kind lessons|content|code|harness`, `--only N,N,...`,
`--no-filing` and `--resume <Name>`. The hint in the frontmatter above
shows the flags without their two leading dashes, because `mise run prose`
reads the frontmatter as prose and rejects a double hyphen there. The
flags themselves keep them.

- `size`: how many issues per wave. The default depends on the kind: 6
  for `lessons`, `content` and `code`, and 4 for `harness`, since every
  issue of a harness wave adds items to the one checklist the maintainer
  works through by hand. These are the picker's defaults, so pass
  `--size` to the picker only when the run's arguments give a size.
- `--kind`: `lessons` (planned lessons, the default), `content` (ready
  `content` issues outside the lesson plans), `code` (ready `code`
  issues, `bug` issues first, then ascending number) or `harness` (ready
  `harness` issues by ascending number, built and reviewed as code, and
  merged only after a restart, see "Harness runs"). Passed to the picker.
  Check the kind before anything else. For any other value, stop with
  `--kind is lessons, content, code or harness, got "<value>"`, the
  picker's own message, and do nothing more.
- `--only N,N,...`: an issue whitelist for the whole run. The picker skips
  everything else and reports every listed number it didn't pick, with the
  reason. The run issue (below) holds the remaining list, and the run
  ends when it is empty.
- `--no-filing`: the bounded-run mode. Nobody in the wave files a GitHub
  issue while the run goes. Each lead posts its follow-ups, as issue
  titles and bodies, in one comment on the run issue, and you file them
  all when the run ends (see "When the run ends"). Use it for an
  unattended run, so the loop has a fixed amount of work and never grows
  its own queue.
- `--resume <Name>`: continue the open run with that name, with the
  arguments its run issue holds. Other arguments are ignored. Without
  `--resume`, `/wave` always starts a new run. It never guesses which open
  run belongs to this session, and it never looks up the machine's name.

## The run issue

A run is one GitHub issue with the `dispatcher-run` label, titled
`Run: <Name> (<kind>)`, for example `Run: Capybara (lessons)`. It is the
run's memory, so the history is in the issue and never in your context,
and nothing of the run is committed to git. Names are animals in
alphabetical order, from `.claude/skills/wave/run-names.txt`, and never
a machine's name.

Its body holds these sections, and you keep them current with
`gh issue edit <run> --body-file .scratch/run-<name>.md` (`.scratch/` is
gitignored). Every dispatcher in this checkout shares `.scratch/`, so
the file has the run's name only after the name check in "Starting a
run" step 3 confirms it, and every edit passes "Before each body edit"
below first:

- `## Arguments`: the arguments of the run, as given, and the line
  `Run: #<n>` with the run issue's own number, right after the heading.
  The new-run path adds it once the issue has its number ("Starting a
  run" step 3.4), and the resume path adds it when it writes the file
  from an issue that doesn't hold it yet.
- `## Remaining --only`: the whitelist numbers not yet handled (only with
  `--only`).
- `## Parked`: issues a lead left out, with the reason. A parked issue is
  never picked again in this run.
- `## Pending collision notes`: the add and remove lines from the leads'
  reports that the maintainer hasn't read yet (step 8).
- `## Waves`: one line per finished wave, `wave <k>: <status>, PR #<n>`,
  and while a lead runs, one more line,
  `In flight: wave <k>, branch <b>, issues #a #b ...`. An `In flight` line
  marks a wave to resume. A harness wave that waits for the restart has
  the line `wave <k>: awaiting restart, PR #<n>`, and it counts as
  unfinished until the merge replaces it with `wave <k>: merged, PR #<n>`.

Each wave report is a comment on the run issue. The issue closes when the
run stops, with a last comment that names the stop condition.

### Before each body edit

Run this check right before every `gh issue edit <run> --body-file`, in
the same Bash call, and post only when it passes. It compares the
`## Arguments` section of the file with the same section of the run
issue's current body, and it checks that the file belongs to the issue
it is about to edit. The section is the `## Arguments` heading line and
every line after it up to the next level-two heading (`##`). The
check removes carriage returns and drops blank lines in both, and it
takes the lines that start with `Run:` out of both sections before it
compares them. The check passes when all of these hold:

- the file's section has exactly one `Run:` line, and it is
  `Run: #<run>`, the number of the issue the edit goes to;
- the issue's section has no `Run:` line (a run opened before this line
  existed, or a new run before its first edit), or the same one line;
- the rest of the file's section equals the rest of the issue's section
  line for line, and holds at least one line besides the heading.

Two plain `/wave` runs have the same arguments, so the `Run:` line is
what tells their files apart. The snippet needs bash or zsh (the Bash
tool here runs zsh). Set `run` and `f` to the run's number and file:

```bash
run=<run>; f=.scratch/run-<name>.md
args() { tr -d '\r' | awk '/^## /{p=($0=="## Arguments")} p' | grep -v '^[[:space:]]*$'; }
a=$(args < "$f"); b=$(gh issue view "$run" --json body -q .body | args)
ra=$(printf '%s\n' "$a" | grep '^Run:'); rb=$(printf '%s\n' "$b" | grep '^Run:')
a=$(printf '%s\n' "$a" | grep -v '^Run:'); b=$(printf '%s\n' "$b" | grep -v '^Run:')
if [ "$ra" = "Run: #$run" ] && { [ -z "$rb" ] || [ "$rb" = "$ra" ]; } &&
   [ "$a" = "$b" ] && [ "$(printf '%s\n' "$a" | wc -l)" -gt 1 ]; then
  gh issue edit "$run" --body-file "$f"
else
  echo "STOP: run body check failed for #$run"
  echo "file: ${ra:-no Run line}; issue: ${rb:-no Run line}"
  diff <(printf '%s\n' "$b") <(printf '%s\n' "$a")
fi
```

When it prints `STOP`, don't post, and don't repair the file from memory.
The check fails when the file's `Run:` line is missing, names another
run or appears twice, when the issue's `Run:` line names another run,
when the rest of the two sections differ, when the section is missing
from the file or the issue, when it holds only the heading, and when
`gh issue view` failed, which leaves the issue's side empty. The `file:`
line and the diff show which one it was. A `Run:` line that
names another run means that another run's session wrote this file, for
example through step 3.4 under a name it didn't get. A missing `Run:`
line means that the file was written by older skill text or without the
`awk` of "Starting a run" step 3. Two sessions that resume the same run
both write `Run: #<run>`, so this check passes for both of them and
doesn't catch that case. A difference in the rest can mean that another session wrote the file or
that someone edited the issue by hand. Stop the run, and give the
maintainer the run number and the file name with the lines the check
printed.

## Starting a run

1. **List the open runs.** Run `mise run run-name`. It prints JSON: the
   open `dispatcher-run` issues, each with its `kind`, and `next`, the
   name the next run takes (the letter after the newest run's name,
   skipping names an open run holds). Your first message to the
   maintainer lists the open runs, or says there are none. Also run
   `gh issue list -l harness-review -s all -L 1 --json number,createdAt`.
   When the newest review issue is more than seven days old, or there is
   none, add one line to that message: `The last harness review was <date> (#<n>). Run /harness-review when there is time.` The line is only a
   reminder, and the run goes on (`docs/agents/harness-review.md`).

   Then apply the harness exclusivity check to that list. The run you
   resume with `--resume <Name>` doesn't count as another run, and its
   kind is the one `run-name` prints for it. A new run's kind is its
   `--kind`. Stop, with the message given, when:

   - this run is a harness run and any other run is open:
     `A harness run starts only when no other run is open. Open: Run <Name> (#<n>), ...`
   - any other open run is a harness run:
     `Run <Name> (#<n>) is a harness run. No other run starts while it is open.`

   A harness wave edits `/wave` and the agent files, which every other
   run reads. So `/wave --resume Ocelot` on an open harness run Ocelot
   passes when no other run is open, and `/wave --kind code` while Ocelot
   is open stops and names Ocelot. The check comes before the preflight,
   so it gives the same answer in any checkout.

2. **Preflight.** With `--resume <Name>`, first read that run's issue
   (`gh issue view <run> --json body -q .body`). When the last line of
   its `## Waves` section is `wave <k>: awaiting restart, PR #<n>`, skip
   this step, since that session runs in the wave worktree on the wave
   branch, and go on with step 3 and then "Resuming after a restart".
   Otherwise, `git fetch origin`, then compare `main` with `origin/main`
   (`git rev-list --left-right --count main...origin/main`).
   When `main` is behind or has diverged, stop and say so, with the two
   counts: the maintainer brings the checkout up to date. When it is only
   ahead, stop too, since the dispatcher commits nothing and the extra
   commits are someone's work that isn't pushed yet. Then `git pull --rebase` is a
   fast-forward from here on.

3. **Resume or open.** With `--resume <Name>`, find the open run issue
   with that name among them, and stop when there is none. Its body gives
   the arguments, and its `In flight` line, if any, is the wave to resume
   (step 3 of the loop). Write its current body to the run's file, with
   the `Run: #<run>` line right after the `## Arguments` heading:

   ```bash
   mkdir -p .scratch && gh issue view <run> --json body -q .body |
     awk -v r='Run: #<run>' '{sub(/\r$/, "")} /^## /{p=($0=="## Arguments")} p && /^Run:/{next} {print} $0=="## Arguments"{print r}' > .scratch/run-<name>.md
   ```

   The `awk` drops any `Run:` line the issue's section already holds and
   writes the one for this run, so the file has it once, and an older
   body without it gets it here. A wrong `Run:` line in the issue stays in
   the issue, and "Before each body edit" stops on it. Then the file you
   edit from is the issue as it is now and never a file
   an earlier session left. The file is in the `.scratch/` of the checkout
   you run in, so a resume in a wave worktree rebuilds it there from the
   run issue alone. Without `--resume`, open the run issue:

   1. Write the body sections above to a file whose name holds the time
      to the second and this shell's process id, which no other session
      has: `f=.scratch/run-new-$(date +%Y%m%dT%H%M%S)-$$.md`. Print the
      path, and use that exact path in the later steps, since each Bash
      call gets a new `$$` and a new time.
   2. `gh issue create --title "Run: <next> (<kind>)" --label dispatcher-run --body-file <that path>`,
      then run `mise run run-name -- --check <number>`.
   3. When its `takenBy` isn't null, an older open run got the same name
      first: close your issue with a comment saying so, and go back to
      step 2 with the name `run-name` prints now and the same file. Never
      write to `.scratch/run-<name>.md` for a name that failed the check,
      because it is the other run's file.
   4. When `takenBy` is null, the name is yours. Rename the file, and
      add the `Run: #<number>` line with the new issue's number right
      after the `## Arguments` heading as you do:
      `awk -v r='Run: #<number>' '{print} $0=="## Arguments"{print r}' <that path> > .scratch/run-<name>.md && rm <that path>`.
      Post the file at once with the check in "Before each body edit",
      so the issue holds the line too, and edit only that file from
      here on.

   Once `.claude/settings.json` registers the `session-title` hook
   (`grep -c session-title.sh .claude/settings.json` prints 1 or more),
   the hook names this session `wave <name> <kind> <yyyy-mm-dd>` from
   your `/wave` prompt, in lowercase: the resumed run's name, kind and
   start date, or for a new run the name `run-name` gave as `next` at that
   moment, the `--kind` and today's date, both dates in UTC. Start your
   next message with the line for the maintainer to type, in a code block
   of its own, when the settings don't register the hook, when the
   harness isn't Claude Code, or when the name this run finally took
   differs from the `next` of your first `run-name` call in step 1 (a
   concurrent run opened its issue in between, or the name check above
   made you take a later name):

   ```text
   /rename wave <name> <kind> <yyyy-mm-dd>
   ```

## One tick of the loop

1. **Pull.** `git pull --rebase` on `main`. You commit nothing, so the
   tree is clean and this is a fast-forward.
2. **Wave number.** `k` is one more than the number of finished waves on
   the run issue's `## Waves` list, so the first wave of a run is 1. The
   branch is `wave/<name>-<k>` in lowercase (`wave/capybara-3`), and
   reports call it `CAPYBARA wave 3`.
3. **Check for an unfinished wave.** An `In flight` line on the run issue
   is a wave to resume. Its wave number, branch and issues are the wave,
   and its issues are the only ones whose `origin/feat/<issue>-*` branches
   count. A `feat/` branch for any other issue is stale and ignored. To
   resume, skip steps 4 to 6: fill the template for that wave, the table
   from the `In flight` issues (as the picker would print them, or one row
   per issue with its title), and the resuming form of `{{RESUME}}`
   (below). Then go to step 7.
4. **Pick.** Run `mise run next-wave -- --kind <kind>`, add
   `--size <size>` when the run's arguments give a size, and
   add `--only <remaining>` under `--only`, where `<remaining>` is the run
   issue's `Remaining --only` list. The picker also takes
   `--unblockers-first`, which scores each candidate by how many blocked
   lessons it unblocks, sorts that score before the course position within
   an area (the planned `after` rule still comes first), and adds an
   `Unblocks` column. Use it when the maintainer asks for it. Then decide on
   the nits row. There is at most one open nits issue, titled
   `Cosmetic nits` (`gh issue list -s open --search "Cosmetic nits in:title"`;
   the repo has no nits label, so the title is the marker, and the
   `content`, `code` and `harness` pickers leave it out for this reason). Add it as ONE extra row
   appended to the picker's table, marked `(nits row)`, for one nits
   builder in one worktree and branch, only when its body has 10 or more
   nit lines or the picker's table is otherwise empty. Under `--only`, add
   it only when it is in the remaining list. A wave that is only the nits
   row is valid and proceeds. When the table is empty after that,
   stop, and report what the picker listed as blocked, skipped, waiting and
   not picked.
5. **Claim.** For each issue of the wave, assign it
   (`gh issue edit <n> --add-assignee @me`, and the picker skips assigned
   issues) and comment `Claimed by run <Name>, wave <k>`. Then read each
   issue's comments again. When another run's `Claimed by run` comment is
   older than yours and that run's issue is still open, drop the issue from
   the wave, delete your claim comment, and say so in your next message.
6. **Fill the template.** Read `.claude/skills/wave/wave-lead-prompt.md`
   and replace:
   - `{{WAVE}}`: the wave's name in reports, `<NAME> wave <k>`, for
     example `CAPYBARA wave 3`.
   - `{{RUN_ISSUE}}`: the run issue's number, `#<n>`.
   - `{{DATE}}`: today, `YYYY-MM-DD`.
   - `{{BRANCH}}`: `wave/<name>-<k>`. When a fresh wave's branch already
     exists on `origin` (`git ls-remote origin refs/heads/<branch>`), an
     earlier run with the same name left it, so stop and report it.
   - `{{TABLE}}`: the picker's Markdown output, with the nits row appended
     to the table when there is one.
   - `{{FILING}}`: one of the two paragraphs under "Filing paragraphs"
     below, as written, with the run issue's number filled in.
   - `{{RESUME}}`: for a new wave, `This is a fresh wave.` For a resume
     (step 3), these three sentences: `You are RESUMING <NAME> wave <k> on branch <branch>.` `A previous lead stopped before reporting.` `Follow "Resuming a half-done wave" in your agent file before anything else.`
7. **Mark the wave in flight, then spawn the lead.** Add
   `In flight: wave <k>, branch <b>, issues #a #b ...` to `## Waves` on
   the run issue (on a resume the line is already there), with the check
   in "Before each body edit". Then spawn one
   `wave-lead` agent (`.claude/agents/wave-lead.md`) with the filled text
   as its whole prompt. Wait for its notification and do nothing else in
   the meantime: end your turn, and the notification wakes you. Never
   spawn a second lead for any reason while one runs. If a fallback
   `ScheduleWakeup` is armed for this wave, re-arm it when the report
   arrives (for the next wave's lead, or with `stop: true` when the run
   ends), because a scheduled call replaces the pending one. A scheduled
   wake-up that arrives after the wave's report is stale, so say nothing
   about it and carry on.
8. **Read the report and update the run issue.** The report is at most
   200 words plus the `Follow-ups` lines, in the form the template ends
   with. Whatever the status, do this first, and make each body edit
   below with the check in "Before each body edit":
   - Post the report as a comment on the run issue. On `merged` and
     `open`, replace the wave's `In flight` line with
     `wave <k>: <status>, PR #<n>`, except for the `open` report of a
     harness wave, whose line is `wave <k>: awaiting restart, PR #<n>`.
     On `failed`, leave the `In flight` line in place.
   - Copy every line under `Add to collision notes` and
     `Remove from collision notes` into the `## Pending collision notes`
     section, each marked add or remove and with its list (lessons or
     code). Don't edit the template's lists yourself. When the maintainer
     has read a pending line and agreed, and no other run issue is open,
     pass it to the next lead, which applies it to that list on its wave
     branch, and delete it from the section once that wave is merged.
     Each list holds at most 15 bullets, so an add at the cap names the
     bullet it replaces or the check that makes one unnecessary.
   - Under `--only`: remove the `Merged issues` and the `Left out` numbers
     from `Remaining --only`, and add the `Left out` ones to `## Parked`
     with their reason.
   - When the report's `For the maintainer` or `Filed` line names an
     issue that waits on the maintainer's decision, your status update
     quotes that issue's options and its recommendation (`triage.md`,
     "What a maintainer decision needs"). An issue number alone is never
     the question.
   - Then act on the status.
   - `merged`: play `afplay /System/Library/Sounds/Glass.aiff` and go to
     step 1.
   - `open`: chime, report the lead's reason to the maintainer, and stop.
   - `open` on a harness wave: chime and stop with the stop condition
     "harness wave awaiting restart". Leave the run issue open, and end
     with the message in "Harness runs", "The stop message".
   - `failed`: chime, report to the maintainer, and stop. The run issue is
     left open with its `In flight` line, so `/wave --resume <Name>`
     resumes the wave rather than restarting it.

## Harness runs

A harness run (`--kind harness`) builds and reviews like a code run, but
the session that built a wave never merges it, because agent files,
hooks, `settings.json` and skills load only when a session starts. The
standing approval doesn't cover a harness wave. Its lead reports `open`
even when the wave is green, with the PR's `After the restart` checklist,
and the run stops at "harness wave awaiting restart" (step 8). No other
run starts or resumes while a harness run is open ("Starting a run",
step 1).

### The stop message

When a harness wave stops awaiting restart, your last message gives the
PR number, says that the PR body's `After the restart` checklist is what
the next session runs, and gives these lines to run, with the wave's
values and today's date filled in:

```text
/exit
cd /Users/lsimons/git/lsimons/ai-training-wt/wave/<name>-<k>
claude -n "wave <name> harness <yyyy-mm-dd>"
/wave --resume <Name>
```

It says what to expect: the new session loads the agent files and hooks
of the wave branch. The resume then works through the PR's
checklist without the `main` preflight, and asks whether to merge. When the wave worktree is missing, the line after `/exit` is
`git -C /Users/lsimons/git/lsimons/ai-training worktree add ../ai-training-wt/wave/<name>-<k> wave/<name>-<k>`.

### Resuming after a restart

This is `/wave --resume <Name>` for a run whose `## Waves` section ends
with `wave <k>: awaiting restart, PR #<n>`, in the session the stop
message started. Do these steps in order and stop at the first that
fails:

1. **Place.** `git rev-parse --show-toplevel` is
   `/Users/lsimons/git/lsimons/ai-training-wt/wave/<name>-<k>` and
   `git branch --show-current` is `wave/<name>-<k>`. Otherwise stop and
   repeat the lines of the stop message. Then `git fetch origin`, and
   the branch's `HEAD` equals `origin/wave/<name>-<k>` and the PR's head
   (`gh pr view <n> --json headRefOid,state`, with state `OPEN`). When
   they differ, stop and say which.
2. **The run file.** "Starting a run" step 3 has rebuilt
   `.scratch/run-<name>.md` in this worktree from the run issue, and
   every body edit passes "Before each body edit" as usual.
3. **The checklist.** Read the `## After the restart` section of the PR
   body (`gh pr view <n> --json body -q .body`) and run every item in
   order, up to the item for the maintainer's merge decision. Run each
   command yourself when your tools can. An item that only the
   maintainer can do, such as a slash command typed into a new session,
   goes to the maintainer as one line saying what to type and what to
   expect, and you wait for the result. Then post the results on the PR
   as one comment, one line per item with pass or fail and what you saw,
   and the attribution lines.
4. **A small gap.** When an item fails because of a small gap, such as a
   missing sentence or a case the check misses, fix it on the wave
   branch in this worktree: commit, run `mise run fast`, push, run the
   item again, and add the fix and the new result to the PR comment.
   For a bigger gap, fix nothing, and say so on the PR and to the
   maintainer.
5. **Ask.** Ask the maintainer one yes-or-no question: whether to merge
   PR #<n>, with the results in one line. Merge only on the maintainer's
   yes in this session, with
   `AI_TRAINING_ROLE=dispatcher gh pr merge <n> --rebase`. On a no, stop
   with "the maintainer declines the merge" and leave the run issue open
   as it is ("When the run ends").
6. **After the merge.** Replace the wave's line with
   `wave <k>: merged, PR #<n>`. There is no new report, so the merged
   issues are the ones the merged PR closes
   (`gh pr view <n> --json closingIssuesReferences -q '.closingIssuesReferences[].number'`).
   Under `--only`, remove them from `Remaining --only`. The collision
   notes were copied when the `open` report came. Close the run when a
   stop condition holds (under `--only`, an empty `Remaining --only`), as
   "When the run ends" says. Then tell the
   maintainer to quit and start again in the main checkout, with the
   lines `/exit`, `cd /Users/lsimons/git/lsimons/ai-training`,
   `git pull --rebase`,
   `git worktree remove ../ai-training-wt/wave/<name>-<k>` and `claude`,
   then `/wave --resume <Name>` when the run is still open. List the
   checklist items after the merge decision for that new session, whose
   results go on the PR as a comment.

## Filing paragraphs

Default (no `--no-filing`):

> Before you report, file a GitHub issue (per `docs/agents/triage.md`,
> labeled with exactly one of `code`, `content` or `harness`, plus
> `ready-for-agent` when every decision is made, or `ready-for-human` when
> one is the maintainer's) for every follow-up a review named. A `ready-for-human` body holds what
> `triage.md`, "What a maintainer decision needs", lists. Fix cheap nits
> in the branch. Every cosmetic nit you leave open on a merged branch
> becomes one line, naming the file and the change, appended to the body
> of the one open issue titled `Cosmetic nits`
> (`gh issue view <n> --json body`, then `gh issue edit <n> --body-file`).
> Create that issue, labeled `content` and `ready-for-agent`, only when
> none is open. Never file a nits issue per wave or per lesson. Link every
> filed issue from the session record and list them on the `Filed` line.
> The `Follow-ups` line is `none`.

Under `--no-filing`:

> Nobody in this wave runs `gh issue create` or edits an issue body. Pass
> this rule, this whole paragraph, verbatim to every builder you spawn.
> Builders skip the `complete` skill's follow-up-filing step and put every
> follow-up and nit they'd have filed, one line each with the file and the
> change, in their final report to you. For every follow-up a review named
> or a builder reported, write the issue you would have filed, as a
> `## <title>` heading with the body and labels under it (exactly one of
> `code`, `content` or `harness`, plus `ready-for-agent` or
> `ready-for-human`), in ONE comment
> on the run issue #<run>, headed `Follow-ups from <NAME> wave <k>`. The
> body of one that needs the maintainer's decision holds what
> `triage.md`, "What a maintainer decision needs", lists.
> Put the cosmetic nits you left open in the same comment under one
> `## Cosmetic nits` heading, one line each. Put the comment's link on the
> `Follow-ups:` line of your report. The `Filed` line is `none`.

## When the run ends

A run ends at every stop except the ones below. At those, leave the run
issue open and skip this section, because `/wave --resume <Name>`
continues the run later:

- `failed`;
- "harness wave awaiting restart";
- a failed step of "Resuming after a restart", such as the wrong checkout;
- the maintainer's no to the merge in that section's step 5;
- the exclusivity check refusing a resumed run ("Starting a run", step 1).

Under `--no-filing`, before the final report, file what the leads wrote.
For each follow-ups comment on the run issue, check every entry once
against `main` as it is now, and drop the ones already done or made
obsolete, saying which and why. File each remaining entry as the issue it
describes, per `docs/agents/triage.md`, and append the nit lines to the
open `Cosmetic nits` issue (create it only when none is open). List the
filed numbers in the final report. For each filed issue that waits on the
maintainer's decision, the final report quotes its options and its
recommendation (`triage.md`, "What a maintainer decision needs").
Nothing is left in a record for the maintainer to reconcile by hand.

Then, on every stop that ends the run, comment the stop condition on the
run issue and close it (`gh issue close <run> --comment ...`). Your final
report repeats the run's pending collision notes for the maintainer to
read.

## Stop conditions

Stop, and say which one it was, when:

- the preflight finds `main` behind, ahead of or diverged from
  `origin/main`;
- the picker returns an empty wave and there is no nits row (report what
  is blocked, waiting and not picked);
- under `--only`, the `Remaining --only` list is empty;
- the lead reports `open` or `failed`;
- a harness wave is awaiting restart (the lead's `open` report on a
  harness wave, step 8);
- the harness exclusivity check refuses the run ("Starting a run"
  step 1), or the `--kind` check refuses its kind;
- a step of "Resuming after a restart" fails, or the maintainer declines
  the merge there;
- the maintainer says stop.

The concurrent-agent cap is shared by every level, so run one wave at a
time in each run. The template tells the lead to run at most six builders
at once. When another run is open, its waves and yours share the cap, so
keep both sizes small.
