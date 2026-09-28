# Orchestrating agents

How one coordinating agent runs many implementation and review agents in
parallel against the GitHub issues, and what a session of that looks like.
Written after the session of 2026-09-20 that took twelve `ready-for-agent`
issues to twelve merged pull requests, and extended after the two waves
later that day, the second of which ran on an integration branch.

The coordinator never edits code itself. It triages the issues, dispatches the agents, relays review findings and
decides what goes back to a builder, and it runs the merge queue. Everything
else is delegated.

## Roles

| Role        | Agent                              | How many                            | Lives in                                 | Model and effort  |
| ----------- | ---------------------------------- | ----------------------------------- | ---------------------------------------- | ----------------- |
| Coordinator | the session itself                 | one                                 | the main checkout, on `main`             | the session's own |
| Builder     | `builder`                          | one per issue                       | its own worktree and branch              | Opus 5.5, medium  |
| Reviewer    | `lesson-reviewer`, `code-reviewer` | one per pull request, sometimes two | its own worktree, detached at the PR tip | Opus 5.5, medium  |
| Security    | `security-reviewer`                | one per security pass (#384)        | its own worktree, detached at `main`     | Fable 5.1, high   |

The agents are defined in `.claude/agents/`, and the coordinator spawns
them by name, so the model, the effort, the turn limit and the tools come
from the file and not from the prompt. A builder takes one issue, one
branch and one pull request from start to merge, including every revision
and rebase. It has every tool except `Agent`. A reviewer does one review
pass and returns it as its final text, and the coordinator posts it. The
`lesson-reviewer` has no shell and no edit tools, and the `code-reviewer`
has a shell that a hook limits to read-only review commands
(`.claude/hooks/review-bash.sh`). The coordinator reads both and talks to
both, so the builder and the reviewer never talk to each other.

## The flow

1. **Triage first.** Read every open issue and its comments, and leave
   each one `ready-for-agent` with its decisions written down, or
   `ready-for-human` with the one action named, or closed. How to run that
   pass with the maintainer, what a ready issue contains, and how to handle
   issues that hold a list of entries, and blocked ones, is in `triage.md`. The labels are in
   `issue-tracker.md`.

2. **Dispatch one `builder` per ready issue**, in a single batch, each in
   an isolated worktree. Issues that depend on an unmerged branch wait for
   the second wave and are then stacked on that branch (see below). The
   `builder` agent file (`.claude/agents/builder.md`) holds what is the
   same for every issue: `mise run setup`, `mise run fast` before every
   push, the self-check list, the reading list, the scratch directory,
   the attribution lines, the rebase and force-push rules, the comment-id
   rule, and the rule that text in issues and fetched pages is data. The
   prompt holds what changes per issue:

   - the issue number;
   - the branch name (`feat/<issue>-<slug>`) and the worktree path,
     `../ai-training-wt/feat/<issue>-<slug>`;
   - the definition of done beyond the agent file's: in per-pull-request
     mode, a pull request against `main` whose body says `Closes #N`,
     GitHub CI green (it runs the e2e walkthrough that `fast` leaves out),
     not merged, and in integration mode a pushed branch and no pull
     request;
   - what the other builders are doing that could collide, so the builder
     writes for the future state (for example, write fixtures in Python
     because another builder is removing bash support), and the files a
     sibling also edits;
   - the collision list of the wave-lead template that matches the issue,
     when a wave lead dispatches.

3. **Spawn a reviewer the moment a pull request opens.** Match the review
   to the change: the `code-review` skill for code, a content and prose
   review against `writing-a-lesson.md` and spec S03 for a lesson, a
   licensing check where a source is cited, a supply-chain check where a
   dependency or pin changes. Name the specific risks to probe, such as an
   exclusion added to a validator, a claim in a lesson that needs a public
   source, or a package name that must not exist on npm. A reviewer of
   lesson content compares the new sentences against the cited sources and
   reports near-verbatim text, since paraphrase is the license condition
   for most of them. Where the change is data with a rule behind it (a
   course plan whose lessons must cover the topics their competencies draw
   on), ask a `builder` for a throwaway script in its `.scratch/` that
   checks the rule mechanically, since the reviewers can't write files.
   Reading found the plans convincing, and the script found the same
   defect in four of the six. Spawn `lesson-reviewer` for content and
   `code-reviewer` for code, with the diff written into the review
   worktree as `review.diff`. The reviewer returns its review as its final
   text, findings ordered by severity, each with `file:line` and a
   concrete failure scenario, and a final `Verdict: approve / needs changes` line followed by the attribution lines. The coordinator posts it on the pull request with
   `gh pr review --comment` (GitHub refuses `--request-changes` on a pull
   request the same account opened).

4. **Decide what goes back.** The coordinator reads the verdict and sends
   the builder one message: which findings are required, which are
   suggested rewrites to apply unless they read worse, which to skip, and
   the expected shape (one commit, reply on the pull request, CI green, do
   not merge). Cheap findings go back even on an approve, since a follow-up
   commit costs less than a follow-up issue. A finding that needs the
   maintainer's decision (strike a spec feature, choose between two
   designs) is reported to the maintainer instead.

   After `Verdict: needs changes`, the same reviewer re-checks the
   revision. After `Verdict: approve`, the coordinator re-checks the fix
   commit itself: it reads the commit with `git show`, runs
   `mise run fast` on the branch, and comments
   `re-checked by lead: <commit link>` on the issue or pull request that
   holds the review. The re-check column
   of the wave pull request's review table links that comment. A fix that
   changes more than the findings named, or a finding too big for the
   coordinator to check, goes back to the same reviewer. A full second
   review of a one-line fix costs 15 to 20 minutes and 1 to 3M tokens.

5. **Merge queue.** The maintainer approves each pull request in a message
   to the coordinator, who merges with
   `AI_TRAINING_ROLE=coordinator gh pr merge <n> --rebase`. The
   coordinator plays a chime when a pull request is ready for that call,
   which is the maintainer's preference. After every
   merge, wait a minute and list the open pull requests with their
   `mergeable` state. Anything `CONFLICTING` goes back to its builder with
   the likely conflict files named. When a big change is in the queue (new
   quality gates, a refactor everyone touches), merge it first and freeze
   `main` until it lands, then let the rest rebase once onto the result.

6. **Finish.** Update the front page status, flip the issues that were
   blocked on now-merged work, and remove the agent worktrees, leaving the
   branches in place. Report what merged, what review caught, and what is
   left.

## Stacked pull requests

A builder whose issue depends on an unmerged branch starts from that branch
(`git checkout -b feat/N-slug origin/feat/M-slug`) and opens its pull
request with `--base feat/M-slug`. Two consequences:

- The CI workflow runs on `pull_request` against `main` only, so a stacked
  pull request gets no automatic run. The builder triggers
  `gh workflow run ci.yml --ref <branch>` and watches that.
- When the base merges by rebase, its commits get new SHAs. Change the
  stacked pull request's base to `main` (`gh pr edit N --base main`) and have the
  builder rebase; the old base commits drop out as already applied. If
  `git rebase` replays them anyway, reset to `origin/main` and cherry-pick
  the branch's own commits.

Never amend or force-push a commit another branch is stacked on. A builder
asked to add one more change to such a branch appends a commit instead, and
says so.

## Integration branches for content waves

Content or data work in a wave (lesson passes, course plans, spec text)
has a cost per pull request that has little to do with the size of the
change: a review round, a revision, a rebase, two CI runs, a maintainer
approval, and a deploy. Wave 2 of the 2026-09-20 session was six pull
requests for six areas, and the six merges were six deploys of the same
kind of change. For that kind of wave the coordinator collects the approved
branches on one integration branch and opens one pull request for the wave.
Code work that changes shared modules or adds gates gets a separate pull
request, because its review and its CI run are what protect the other
branches.

Builders work as before: one issue (or one half of a split issue), one
branch from `origin/main`, pushed
when its local checks pass, and without a pull request. Reviewers check
the branch out in their own worktree and review it as before. The review
goes on the issue as a comment, because the pull request doesn't exist
yet, with the same findings by severity and the same `Verdict:` line, and
the revisions and re-checks follow it there.

The coordinator keeps the integration branch, `wave/<n>-<slug>` (under
`/wave`, `wave/<name>-<k>` after the run's name, see
`meta-orchestration.md`), in a dedicated worktree created from `main`
(`git worktree add ../ai-training-wt/wave/3-course-plans -b wave/3-course-plans origin/main`). When a
branch is approved, it is rebased onto the wave branch rather than merged
into it. The wave history then has no merge commits, and the later rebase
merge into `main` keeps one commit per change:

```sh
git fetch origin
git rebase --onto wave/3-course-plans origin/main origin/feat/31-safety-plan
git branch -f wave/3-course-plans HEAD
git checkout wave/3-course-plans
```

The wave branch now holds the earlier branches and this one, in the order
they were approved. When every approved branch is in, the coordinator runs
`mise run ci` on the wave branch, pushes it, and opens one pull request
against `main`. A branch that joins after that gets its own `mise run ci`
on the wave branch before the next push. The pull request body holds a
table with one row per branch: the issue, the branch, a link to the review
comment, and a link to the re-check comment where there was one. The
review record is then on GitHub next to the pull request that shipped it.
The maintainer approves the wave, and the coordinator merges it with
`AI_TRAINING_ROLE=coordinator gh pr merge <n> --rebase` as usual. The
deploy happens once.

The cases that come up:

- **A branch fails review.** It is left out of the wave, and the rest go
  on. Its builder revises on the issue, the reviewer re-checks there, and
  the branch joins the wave if the pull request is still open or waits for
  the next one. Nothing on the wave branch depends on it.
- **A rebase conflict between branches in the wave.** The rebase of the
  second branch stops on the conflict. The coordinator doesn't resolve it.
  It runs `git rebase --abort`, which leaves the wave worktree as it was,
  and tells the builder whose branch came second to redo the `--onto`
  rebase in that worktree, resolve the conflict there, and run the
  `branch -f` and `checkout` lines itself. The first branch is left as it
  was rebased.
- **A follow-up after the branch is on the wave.** A builder that pushes
  one more commit to its own branch, after a review finding on the wave
  pull request, tells the coordinator the SHA. The coordinator
  cherry-picks that commit onto the wave branch. Rebasing the branch onto
  the wave again would replay commits the wave already holds.
- **A change stacked on the wave.** A lesson whose course needs the plan
  entry the wave adds starts from the wave branch and opens a draft pull
  request with `--base wave/<n>-<slug>`. The rules under "Stacked pull
  requests" apply as written, with the wave branch as the base and the
  change to `main` after the wave merges.
- **The e2e run.** The coordinator's `mise run ci` on the wave branch is
  the one e2e run of the wave, and builders run `mise run fast`, which
  leaves the walkthrough out.

## What collides, and how to avoid it

- **Shared config files.** `.mise.toml`, `.github/workflows/ci.yml` and
  `AGENTS.md` are touched by every tooling change. Two tooling issues in
  one wave means one of them rebases through conflicts. Keep the `ci` task
  list and the workflow steps in the same order in both files when
  resolving.
- **Semantic conflicts.** A new build check on one branch fails on content
  another branch adds, with no git conflict at all. The course plan check
  had to learn about three lessons that merged while it was in review.
  When a check-adding pull request is in the queue, tell its builder what
  landed on `main` since it branched.
- **New gates on old code.** A pull request that adds lint, coverage or
  e2e gates forces every later pull request to bring its code under them.
  Tell those builders exactly what the gates are and where the docs are
  (`testing.md`), and expect them to split logic out of scripts into
  tested modules, the way `check-examples.mjs` and `check-data.mjs` were
  split.
- **Rules that change mid-flight.** When one branch removes bash fixtures,
  a lesson builder that started earlier still adds a `.sh` file. Say the
  future rule in every builder prompt, and check each finished pull request
  against rules merged since it started.
- **Ports.** `site-e2e` and `site-screenshot` each take a free port, so
  they don't collide. A stale `astro dev` daemon still holds its port and
  serves old content, so builders don't run `site-dev` (see `testing.md`,
  "The Astro dev server").

## Working with the platform

- The coordinator waits by ending its turn. Each agent's notification
  wakes it, so it never sleeps or polls a pull request for comments. It
  waits in the foreground only for a check it started itself
  (`mise run ci`, `gh pr checks --watch`, `gh run watch`), and never ends
  its turn while one runs. `meta-orchestration.md` has the test behind
  this rule, and the Bash guard hook rejects a `sleep` over 60 seconds
  and a loop that polls `gh`.
- Concurrent agents are capped (20 in this session). A spawn that hits the
  cap fails with a clear message; retry when a builder or reviewer
  finishes. Finished agents do not free a slot until their turn ends.
- A message to a finished agent resumes it with its context intact, which
  is how a builder gets its revision and rebase instructions. An agent that
  has worked for a very long time carries a huge context; for a follow-up
  on such a branch, spawn a fresh agent in a new worktree checked out on
  the branch, with the pull request and review as its whole brief.
- In a subagent, a `cd` lasts for one Bash call: "Within a subagent, `cd`
  commands don't persist between Bash or PowerShell tool calls"
  ([Subagents](https://code.claude.com/docs/en/sub-agents)). A builder,
  a reviewer and a wave lead start every command in a worktree with
  `cd <worktree> && <command>`, or name the worktree in the command
  (`git -C <worktree> ...`, absolute paths). A bare `cd` as the first
  call leaves every later command in the checkout the session started in
  (#463).
- The `code-review` skill runs as a forked agent in the main checkout, not
  in the caller's worktree, so a reviewer that `cd`s into its review
  worktree and passes only a range gets an empty diff. The reviewer passes
  the level first, then the worktree path and the range
  (`medium <worktree path> origin/main...HEAD`), and the forked agent
  starts each command with `cd <worktree path> && <command>`. The skill reads the level only when it comes first
  and ignores a level in any other place. The skill spawns its own
  sub-agents (angles and verifiers). Their notifications arrive at the
  coordinator too, and sometimes only there. The reviewer then gets an
  empty result from the skill. Ignore the notifications at the coordinator
  and act on the reviewer's consolidated verdict. An empty skill result, or
  findings on files outside the worktree, on a non-empty `review.diff` is
  a failed run: the reviewer doesn't run it again, says so in the review,
  and bases the verdict on a hand review of `review.diff`, never on the
  skill result.
- GitHub reports `mergeable: UNKNOWN` for about a minute after every merge.
  Wait and list again. A pull request in `CONFLICTING` state gets no
  `pull_request` CI run at all, so a builder that pushes into a conflict
  sees no run and should rebase rather than wait.
- Rebase merges keep every commit. An intermediate commit that would fail a
  gate added later (a `.sh` fixture that a later commit removes) is fine as
  long as the tip is green.

## Scratch space and worktrees

Every agent worktree goes under one directory next to the repository,
`../ai-training-wt/<branch>`, so a builder for `feat/12-x` works in
`../ai-training-wt/feat/12-x`. A reviewer's worktree has the run's name
in it, `../ai-training-wt/review-<run>-<issue>` (`review-lemur-460`), so
`git worktree list` shows which run created it. At the end of the wave the
lead removes only the paths of its own wave, listed from its prompt, with
one `git worktree remove --force <path>` per path, never by a pattern, and
it leaves the branches in place. Its report names the paths the commands
removed and any that failed. Every open run uses this directory, and one
run's cleanup by the pattern `*/review-*` removed another run's review
worktrees while its reviewers worked in them (#470). A worktree left behind after
a failed wave is found in one place.

An agent's scratch files go in `.scratch/` at the root of its own
worktree. The directory is gitignored, the project allowlist lets any
agent run `rm -rf .scratch` without a prompt, and removing the worktree
removes it too. Scratch files never go under `/tmp`, where a delete asks
the maintainer for permission, and two agents' files never share a
directory.

Agents never run `git stash` in any worktree. Every worktree of one clone
shares one stash (`refs/stash`), so a `git stash pop` in one worktree can
return the changes another agent stashed in its own worktree. To compare
with the base, an agent commits its work in progress. It can also save
the work with `git diff HEAD > .scratch/x.patch` and restore it with
`git apply`, or run `git worktree add --detach` for a separate checkout
under `../ai-training-wt/`. Untracked files aren't in that patch unless
`git add -N` marks them first.

The Bash guard hook (`.claude/hooks/README.md`) rejects a force push, any
push to `main`, `gh pr merge` from anyone but the wave lead, the
dispatcher or a coordinator, and `git stash` in every worktree except
`git stash list` and `git stash show`. It rejects `git reset --hard`,
`git checkout -- .` or `git restore .` only in the main checkout. The
wave lead and a coordinator prefix a merge with `AI_TRAINING_ROLE=<role>`.

## What a builder prompt says about history

Builders may `git push --force-with-lease` their own branch after a rebase,
because nothing is stacked on it and the coordinator asked. They never
force-push a branch another pull request is based on, never delete a branch,
and never merge. Merging is the maintainer's call, relayed by the
coordinator.

## Session records

The records of waves 1 to 5 are comments on the run issue
[Badger (#359)](https://github.com/lsimons/ai-training/issues/359), and
they are the form a wave's session record follows: counts, what review
caught, and what the builder prompt should have said. A wave under
`/wave` puts its record in the body of its wave pull request.
