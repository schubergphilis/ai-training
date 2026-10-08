This file is part of the `wave` skill, and
`.claude/skills/wave/SKILL.md` says when to read it. A section name in
quotes is in `SKILL.md` or in one of the files next to it: "Harness
runs", "The stop message" and "Resuming after a restart" are in
`harness-runs.md`, "Filing paragraphs" is in `filing-paragraphs.md`, and
"When the run ends" and "Releasing the claims" are in
`when-the-run-ends.md`.

## Filing paragraphs

Default (no `--no-filing`):

> Before you report, file a GitHub issue (per `docs/agents/triage.md`,
> labeled with exactly one of `code`, `content` or `harness`, plus
> `ready-for-agent` when every decision is made, or `ready-for-human` when
> one is the maintainer's) for every follow-up a review named. A `ready-for-human` body holds what
> `triage.md`, "What a maintainer decision needs", lists. File a
> follow-up from the review of issue N with `--parent N`, and set a
> blocker as a relationship (`triage.md`, "Where an issue came from" and
> "Dependencies"). Fix cheap nits
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
> `ready-for-human`, and a `Parent: #N` line when the review of issue N
> named it), in ONE comment
> on the run issue #<run>, whose first line is `Follow-ups from <NAME> wave <k>`. The
> body of one that needs the maintainer's decision holds what
> `triage.md`, "What a maintainer decision needs", lists.
> Put the cosmetic nits you left open in the same comment under one
> `## Cosmetic nits` heading, one line each. Put the comment's link on the
> `Follow-ups:` line of your report. The `Filed` line is `none`.
