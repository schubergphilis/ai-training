---
name: harness-review
description: Review how the agent harness of this repo worked since the last review. Reads git, GitHub and the session transcripts, runs the metrics script, checks the harness against what the course teaches, writes an HTML report outside the repo, and asks the maintainer which recommendations to file.
argument-hint: "[since YYYY-MM-DD]"
disable-model-invocation: true
---

You run the periodic harness review of `docs/agents/harness-review.md`.
Read that page once first. It says when the review runs and holds the
baseline numbers of 2026-09-24.

## Rules

- **Read-only on the repository.** Other agents may be running. Change no
  file in this checkout, commit nothing,
  don't create a branch or worktree,
  and don't edit an issue other than the review issue below. Scratch
  files go under the report directory, never in the repo.
- **Private material is kept local.** Transcripts hold private material. The report
  is kept on this machine. A GitHub issue you file never quotes transcript
  text beyond a short phrase as evidence, never names a machine by its
  hostname (use the source labels of the config), and never names a
  private path outside this repository.
- **You file only what the maintainer picks.** Ask them before you file anything.

## Setup

1. **Transcript config.** Read `~/.config/ai-training/transcript-dirs`.
   It lists one transcript directory per line, as `label=path`, with `#`
   for comments: this machine's `~/.claude/projects/<this repo>/` and the
   synced copies from other machines. When the file is missing, stop, and
   tell the maintainer to create it, for example:

   ```text
   # label=directory, one per line, never a hostname as the label
   laptop-a=~/.claude/projects/-Users-<you>-git-lsimons-ai-training
   laptop-b=~/sync/laptop-b/claude-projects/-Users-<you>-git-lsimons-ai-training
   ```

2. **Since when.** The argument, or else the date of the newest issue with
   the `harness-review` label
   (`gh issue list -l harness-review -s all -L 1 --json number,title,createdAt`),
   or else seven days ago.

3. **Report directory.** `../ai-training-improvements/<YYYY-MM-DD>/`
   (today), next to the repository, with `data/` for the numbers and
   `scratch/<agent>/` for each subagent.

## Method

Study the history since that date: the git log, pull requests, issues and
CI runs on GitHub, the run issues (`dispatcher-run` label) and the wave
pull requests with their session records, and the session transcripts
from every directory in the config. Find the bottlenecks, the time
wasters and the token wasters. Above all, find where the maintainer's
attention was spent: approvals, corrections, repeated instructions,
questions the agent could have answered, and questions that forced a
lookup. Note what worked and should stay.

Then check the repo against what its own course teaches, since the repo
should be a good example of the practice it trains others in. Read the
lessons under `customizing-agents`, `coding-with-agents`, `using-agents`
and `safety` in `site/src/content/docs/`, and compare them with
`AGENTS.md`, `.claude/`, `docs/agents/` and the checks. Also check the
state of the global skills the process depends on (`build`, `complete`)
and whether the last review's recommendations were done and helped.

Run the research in parallel, with one `general-purpose` subagent each
for:

- each transcript source in the config;
- the metrics script;
- GitHub and git history;
- the harness against the course.

Give each one the rules above, its own `scratch/<agent>/` directory (two
agents that share a directory overwrite each other's files), and the
instruction to return its findings as its final text with the evidence
for each. The metrics agent runs
`mise run harness-metrics -- --config ~/.config/ai-training/transcript-dirs --since <date> --json <report dir>/data/metrics.json`
and saves the Markdown it prints as `data/metrics.md`. The numbers come
from that script only, so every review is comparable with the last.

Check each subagent's main claims yourself before they go in the report:
a setting, a permission, a token scope, a skill file or a template line
is read at its source, not taken from the summary.

## Report

Write `index.html` in the report directory, one self-contained page
styled like the site: the palette and the fonts from
`site/src/styles/custom.css`, light and dark. It holds:

- a short summary;
- the numbers, next to the previous review's (the previous report's
  `data/metrics.json`, or the baseline in `docs/agents/harness-review.md`
  for the first one);
- ranked recommendations, each with its effort, what it removes, and the
  evidence;
- what worked and should stay.

## Close

1. Open the review issue: title `Harness review <YYYY-MM-DD>`, label
   `harness-review`, with the summary numbers and the comparison. It
   doesn't quote transcripts or name local paths.
2. Ask the maintainer which recommendations to file. File each one they
   pick per `docs/agents/triage.md`, as a sub-issue of the review issue
   (`gh issue create ... --parent <review issue>`), so the review issue
   lists it.
3. Close the review issue once the maintainer has chosen.
