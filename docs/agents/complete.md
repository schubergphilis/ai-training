# Completing work

The global `complete` skill reads this file and follows it in place of its
own steps, so this file holds the whole completion process for this
repository.

## Builder

A builder in a wave, or one a lead spawned, follows
`.claude/agents/builder.md`, "Setup and done" and "Rules". Its list
"Where this repo differs from the `build` and `complete` skills" says
where those rules replace the steps below.

## Interactive session

This is the default: a session the maintainer works in directly. Take
the steps in this order.

01. **Done.** Work is done when the branch is pushed, its pull request is
    open and CI is green. Merge only when the maintainer says so in plain
    words. Don't ask the maintainer what "complete" means.
02. **Gate.** Run `mise run fast` before every push. Before the first push
    of a branch, run `mise run ci`, as `AGENTS.md`, "Quality", requires.
03. **Branch.** Work on a branch named `<type>/<issue>-<slug>`, never on
    `main`. The branch name contains the issue number, as
    `docs/agents/issue-tracker.md`, "Triage flow", says.
04. **Commit.** Check the staged files with `git status` and
    `git diff --cached` before you commit. Write the message as a
    Conventional Commit, and end it with the two attribution lines from
    `AGENTS.md`, "Process", and no `Signed-off-by`. Add `Closes #<n>.`
    when the commit finishes an issue.
05. **Push.** Before each push, run `git fetch origin` and
    `git rebase origin/main`. The first push of a branch is
    `git push -u origin <branch>`. Each later push is
    `git push --force-with-lease`. A rebase
    rewrites the branch. GitHub rejects a plain `git push` after it, and
    `--force` can drop commits that someone else pushed.
06. **Pull request.** Open it with `gh pr create`. The body ends with
    `Closes #<n>.` and the two attribution lines.
07. **CI.** Start `mise run ci-watch` in the background and hand control
    back to the maintainer. When it reports a failure, read the log with
    `gh run view <id> --log-failed`, fix the cause, push, and watch again.
08. **Merge.** Merge only when the maintainer says so in plain words, with
    `AI_TRAINING_ROLE=coordinator gh pr merge <n> --rebase` on the first
    try. Use `--merge` in place of `--rebase` when another branch is
    stacked on this one. When the guard hook or the auto-mode classifier
    blocks the merge, report the block to the maintainer and don't retry
    it with a changed command.
09. **After the merge.** Update local `main` with `git pull --ff-only`, and
    only in a checkout that doesn't hold work from another agent. Remove your
    own worktree with `git worktree remove <path>`. Once #737 is merged, use
    `mise run worktree-cleanup` for this. Never run `git stash`, because
    every worktree shares one stash and `guard-bash` blocks it.
10. **CI on `main`.** Watch the run that the merge starts on `main`: run
    `mise run ci-watch` in the main checkout, which is on branch `main`. A
    detached worktree has no current branch, so `ci-watch` there doesn't
    find the run on `main`. Whoever finds `main` red fixes it, whatever
    caused it.
11. **Issues.** Follow `docs/agents/issue-tracker.md` and
    `docs/agents/triage.md`. Each follow-up becomes an issue, created with
    `--parent <n>` when a review of issue `<n>` named it. A cosmetic nit
    becomes a line in the open `Cosmetic nits` issue.

## Checklist

- [ ] `mise run fast` passed before each push, and `mise run ci` before
  the first push of the branch.
- [ ] The branch name contains the issue number, and the branch isn't
  `main`.
- [ ] The working tree is clean, and each commit message ends with the
  attribution lines.
- [ ] The last push after a rebase used `--force-with-lease`, and the
  local and remote branches match.
- [ ] The pull request is open, and its body has `Closes #<n>.` and the
  attribution lines.
- [ ] CI on the branch is green.
- [ ] The merge, if the maintainer asked for one, used the role prefix.
- [ ] Local `main` is updated and your worktree is removed, or the
  report says why not.
- [ ] CI on `main` is green.
- [ ] Each follow-up is an issue, and each cosmetic nit is a line in
  `Cosmetic nits`.
