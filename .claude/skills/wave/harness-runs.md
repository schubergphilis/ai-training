This file is part of the `wave` skill, and
`.claude/skills/wave/SKILL.md` says when to read it. A section name in
quotes is in `SKILL.md` or in one of the files next to it: "Harness
runs", "The stop message" and "Resuming after a restart" are in
`harness-runs.md`, "Filing paragraphs" is in `filing-paragraphs.md`, and
"When the run ends" and "Releasing the claims" are in
`when-the-run-ends.md`.

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
values and today's date filled in, and `<worktree root>` replaced by
the absolute path that `mise run worktree-root` prints:

```text
/exit
cd <worktree root>/wave/<name>-<k>
claude -n "wave <name> harness <yyyy-mm-dd>"
/wave --resume <Name>
```

It says what to expect: the new session loads the agent files and hooks
of the wave branch. The resume then works through the PR's
checklist without the `main` preflight, and asks whether to merge. When the wave worktree is missing, the line after `/exit` is
`git -C /Users/lsimons/git/lsimons/ai-training worktree add <worktree root>/wave/<name>-<k> wave/<name>-<k>`.

### Resuming after a restart

This is `/wave --resume <Name>` for a run whose `## Waves` section ends
with `wave <k>: awaiting restart, PR #<n>`, in the session the stop
message started. Do these steps in order and stop at the first that
fails:

1. **Place.** `git rev-parse --show-toplevel` is
   `<worktree root>/wave/<name>-<k>` and
   `git branch --show-current` is `wave/<name>-<k>`. Otherwise stop and
   repeat the lines of the stop message. Then `git fetch origin` and
   read the PR's state (`gh pr view <n> --json headRefOid,state`). When
   it is `CLOSED`, stop and say that PR #<n> was closed without a merge.
   When it is `MERGED`, a session stopped after the merge and before
   step 6 wrote the `merged` line, or the PR was merged by hand. A merge
   can't be undone, so tell the maintainer that PR #<n> was found merged,
   skip steps 3 to 5 and go on with step 6 in this worktree on the merged
   branch. Step 2 still holds, because step 6 edits the run issue body
   from the run file. When it is `OPEN`, the branch's `HEAD` equals
   `origin/wave/<name>-<k>` and the PR's head. When they differ, stop and
   say which.
2. **The run file.** "Starting a run" step 3 has rebuilt
   `.scratch/run-<name>.md` in this worktree from the run issue, and
   every body edit passes "Before each body edit" as usual. Then do
   "Starting a run", step 4, which that route skipped, with all its
   checks: the `uname` check, the `basename` check of `$PPID`, the
   `pgrep` check, then `caffeinate -i -w $PPID` with `run_in_background`
   and the reminder to keep the lid open. The `caffeinate` of the
   session that built the wave ended when that session quit.
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
   yes in this session. Run the check before a merge in "The run issue
   after a merge" first, then merge with
   `AI_TRAINING_ROLE=dispatcher gh pr merge <n> --rebase`. On a no, stop
   with "the maintainer declines the merge" and leave the run issue open
   as it is ("When the run ends").
6. **After the merge.** Replace the wave's line with
   `wave <k>: merged, PR #<n>`. There is no new report, so the merged
   issues are the ones the merged PR closes, without the run issue's own
   number
   (`gh pr view <n> --json closingIssuesReferences -q '.closingIssuesReferences[].number | select(. != <run>)'`).
   Then check the run issue as "The run issue after a merge" says. After
   the `MERGED` route of step 1, "Starting a run" step 3 has already
   reopened a run issue the merge closed, so the check prints `OPEN`. Under
   `--only`, remove the merged issues from `Remaining --only`. The
   collision notes were copied when the `open` report came. Close the
   run when a stop condition holds (under `--only`, an empty `Remaining --only`), as
   "When the run ends" says. Then tell the
   maintainer to quit and start again in the main checkout, with the
   lines `/exit`, `cd /Users/lsimons/git/lsimons/ai-training`,
   `git pull --rebase`,
   `git worktree remove <worktree root>/wave/<name>-<k>` and `claude`,
   then `/wave --resume <Name>` when the run is still open. List the
   checklist items after the merge decision for that new session, whose
   results go on the PR as a comment.
