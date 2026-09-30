# Harness review

The harness review is a periodic look at how agents worked on this
repository: where time, tokens and the maintainer's attention went, and
whether the harness still matches what the course teaches. The first one,
on 2026-09-24, was a one-off prompt, and #342 and #344 to #355 came out
of it. The `/harness-review` skill (`.claude/skills/harness-review/SKILL.md`)
runs the same method every time, so each review is comparable with the
last.

## When

Weekly, and after any change of the default model or of an orchestration
layer. At the start of a run, `/wave` prints one line when the newest
issue with the `harness-review` label is more than seven days old. The
line is only a reminder, and the run goes on.

## How

The maintainer starts the review by hand. It changes nothing in the
repository, so it may run while a dispatcher run is open.

- **Sources.** The transcripts come from the directories listed in
  `~/.config/ai-training/transcript-dirs`, one `label=path` per line: this
  machine's Claude Code project directory and synced copies from other
  machines. The file is local and untracked, and its labels are names
  like `laptop-a` that don't reveal a hostname.
- **Numbers.** `mise run harness-metrics` (`scripts/harness_metrics.py`,
  tested in `tests/test_harness_metrics.py`) reads the transcripts and
  prints tokens by session, day, model and role, the models and peak
  context of each role, tool calls, the top Bash commands, `sleep`
  totals, human messages and waits, chimes, the largest tool results and
  the most-read files. Since #395 it counts the full output of a streamed
  message, counts a continued session's repeated records once, skips
  leading `cd` in the Bash key, and ignores `sleep` and `afplay` inside
  quotes and here-documents. So output tokens are about 3 times higher, and
  `sleep` and chime counts a little lower, than in a report made before.
- **Report.** An HTML page outside the repository, in
  `../ai-training-improvements/<date>/`, with the data next to it. It is
  kept on this machine, because transcripts hold private material.
- **Issue.** Each review opens one issue, `Harness review <date>`, with
  the label `harness-review` and the summary numbers. Each issue filed
  from it is its sub-issue (`gh issue create --parent <review issue>`,
  `triage.md`, "Where an issue came from"), so the review issue lists
  them. It closes once the maintainer has chosen what to file.

## Baseline, 2026-09-24

The first scheduled review compares its numbers with these:

| Measure                                        | 2026-09-24           |
| ---------------------------------------------- | -------------------- |
| `sleep` calls                                  | 609, 14.4 h in total |
| `main` CI failures from direct pushes          | 10 of 12             |
| Collision-note bullets in the wave template    | 58                   |
| Branches approved on their first review        | about 1 in 70        |
| Human messages per merged issue, best wave run | 0.19                 |
