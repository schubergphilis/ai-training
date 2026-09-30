# Triaging issues

How an agent walks the maintainer through the open issues and leaves every
one of them in a state where an agent can start, a human has one named
action, or the issue is closed with a reason. Labels and the `gh` commands
are in `issue-tracker.md`. Written after the session of 2026-09-20 that
took seven `ready-for-human` and nine `needs-triage` issues to zero of each.

Triage is a decision pass. It doesn't write code or specs, and it doesn't
leave an issue "for later" without saying what later means.

## The pass

1. **Fetch everything first.** List the issues in the label you are
   triaging, then read each body and every comment in one batch. Earlier
   triage comments are often already there and only the label was missed.
   Check the state of every issue a body or comment names as a blocker.
   When a `ready-for-agent` issue states a blocker or a start date in
   free text, record it as "Dependencies" (below) says.

2. **One issue at a time, with the maintainer.** For each issue, say in a
   few sentences what it is and where it came from, then give one
   recommended outcome with a reason and one or two alternatives. Ask,
   wait, then act before moving to the next. When the maintainer asks
   what the issue is, explain it in full before asking again. The general
   rules for a question to the maintainer, including which triage
   decisions you make yourself, are in `AGENTS.md`, "Asking the
   maintainer".

3. **Record the decision on the issue**, in a comment that starts with
   `Decision (YYYY-MM-DD):` or `Triage (YYYY-MM-DD):`, then change the
   label. The comment is the durable record, and the next agent reads it
   without this conversation.

4. **Check the queues** at the end. The label you triaged should be empty
   or hold only issues whose comment names the human action they wait for.

## The four outcomes

| Outcome                    | When                                                                | What the comment holds                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready-for-agent`          | Every decision the work needs is made, with the answer written down | The decisions, the files to touch, and a "done when" an agent can check                                                                        |
| `ready-for-agent`, blocked | Fully specified, waits on another issue or an open pull request     | `blocked by #N (PR #M)`, the blocker set as "Dependencies" says, and the instruction to confirm the merge before starting                      |
| `ready-for-human`          | The next step is something only the maintainer can do               | The one action, stated so the maintainer can do it without rereading the issue. A decision holds what "What a maintainer decision needs" lists |
| Closed                     | Not worth doing, superseded, or split into children                 | The reason, or the list of child issues and the entries that were dropped, each with why                                                       |

A "write the spec" issue is a valid `ready-for-agent` outcome when the
decisions are made and only the writing is left. Put the decisions in the
comment, so the spec author doesn't come back with the same questions.

Fully specified issues that wait on a merge get `ready-for-agent` with the
blocker named. Keeping them in `needs-triage` means a second triage pass for
no new information.

## Issues that hold a list

An issue that holds a list of deferred surfaces, proposals or ideas is not
a task. Walk its entries one by one. For each entry, recommend keep or drop
with a one-line reason. A kept entry becomes its own issue with concrete
build steps and file pointers, created as a sub-issue of the list issue
(`gh issue create --parent <list>`). A dropped entry is named in the
closing comment with the reason, so the next agent doesn't re-propose it.
Then close the parent. No tracking issue, no tracking label, no parking
lot. The sub-issue link records where each child came from, and the
parent still closes.

The same applies to an umbrella issue whose work has already been split:
close it, list the children, and make each child a sub-issue of it
(`gh issue edit <umbrella> --add-sub-issue <child>`).

## What a ready-for-agent issue contains

The builder starts with no context and doesn't ask questions, so the issue
body and its decision comment together hold:

- What exists today, with the file paths, so the builder reads before it
  writes.
- Each decision the work needs, answered. Where two designs were possible,
  the one chosen and in one clause why.
- Which spec sections change, by name.
- Which tests or checks prove it: the e2e flow to extend, the build check
  to add, the `mise run ci` gate.
- What is out of scope, when a reader could reasonably assume otherwise.
- Its blocker, if any, set as "Dependencies" (below) says.
- Where it came from, as a parent link: the issue it was split from, the
  `Harness review <date>` issue it was filed from, or the issue whose
  review named it as a follow-up ("Where an issue came from", below). The
  link replaces the "split from" sentence older bodies have.

Stale paths in an old body (`docs/src/` where the code is under `site/src/`)
get corrected in the triage comment rather than left for the builder to
discover.

## Dependencies

Blocked-by and blocking are for order only: one issue can't start before
another is done. A follow-up doesn't block the issue it came from, and a
child doesn't block its parent.

The wave picker (`mise run next-wave`, `scripts/next_wave.py`) treats an
issue as blocked by the union of its open native `blockedBy` issues and
its `Blocked by #N` lines, and counts a number that is in both once. This
applies to every kind of wave. Both forms count, and new issues use the
relationship.

### Relationships

Set a blocker between two issues as GitHub's "blocked by" relationship
([Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)):

```bash
gh issue create --title "..." --body-file <file> --blocked-by 123
gh issue edit 456 --add-blocked-by 123
gh issue edit 456 --remove-blocked-by 123
```

The flags need gh 2.94.0 or later (`issue-tracker.md`).

A pull request can't be the target. Checked on 2026-09-30 with a scratch
issue (#624): `gh issue edit 624 --add-blocked-by 622`, where #622 is a
pull request, failed with `Could not resolve to an Issue with the number of 622`. The REST call
`POST /repos/schubergphilis/ai-training/issues/624/dependencies/blocked_by`
with the issue id of #622 returned HTTP 422,
`Target issue may only be an issue`. GitHub's page on dependencies
speaks of issues only. So a pull request blocker stays a
`Blocked by #N` line (below).

### Dependency lines

The body lines are the supported alternative to the relationship. Use
them for a pull request blocker and for a start date, which the
relationship can't hold. The picker reads two line forms in an issue body:

```text
Blocked by #123
Not before 2026-10-01
```

- `Blocked by #N` blocks the issue while #N is open. One line names one
  issue, so an issue with two blockers has two lines. An open pull request
  blocks too, and this line is the only form for a pull request blocker.
- `Not before YYYY-MM-DD` blocks the issue until that date, read in UTC.
  On the date itself the issue is free. With two lines the later date
  counts.
- Each goes on its own line near the top of the body, before the prose,
  with the words and case as shown and nothing else on the line.
- A line that starts with `Blocked by #` or `Not before` but isn't the
  form whole blocks the issue until it's fixed, and the picker reports it
  as unreadable. `Not before 2026-10-01 UTC`, `Not before: 2026-10-01`,
  `Not before 2026-9-1`, a date that doesn't exist and
  `Blocked by #5 and #6` all read this way. Write a sentence about a
  blocker so that it doesn't start with those words ("Confirm #123 has
  merged").
- A line inside a fenced code block or a quote (`>`) doesn't count, so an
  issue can show the forms, as this section does. A fence opens as
  CommonMark says: at most three spaces before it.
- For a lesson the lines come on top of its plan file's `assumes` entries.
- The picker looks up a blocker that isn't in its list with
  `gh issue view`, and a number that doesn't exist stops it, so a typo
  shows up at the next pick.
- When a blocker closes, the line can stay. Remove it when you edit the
  body anyway.

## Where an issue came from

An issue filed from another issue is its sub-issue
([Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)).
Set the parent when you create it, with `gh issue create --parent <N>`,
or later with `gh issue edit <child> --parent <N>`:

- A child split from an issue, or an entry kept from a list issue, has
  the original issue as its parent.
- An issue filed from a `Harness review <date>` issue has the review
  issue as its parent (`harness-review.md`).
- A follow-up filed from the review of issue N has N as its parent. A
  follow-up that no one issue's review named, such as one from a wave
  report's maintainer line, has no parent.

GitHub gives an issue one parent: the REST call that adds a sub-issue
has a `replace_parent` option to move one that already has a parent
([REST API endpoints for sub-issues](https://docs.github.com/en/rest/issues/sub-issues)).
When two issues could be the parent, use the one whose work or review
named it. The parent link is a record, and the picker doesn't read it.

## What stays with the maintainer

Some steps need a machine, an account or a judgment an agent here doesn't
have: a network trace with a firewall and a proxy, a licensing release from
a source, a check of every article reference in a lesson about law. State
the step as the one action on the issue and label it `ready-for-human`.
An issue that asks the maintainer to decide holds what the next section
lists.
Don't turn it into an agent task by guessing around it, and don't raise it
again in later sessions unless asked. Some of these are "when I get to
it" items for the maintainer, and that is a fine state for an issue to be
in.

## What a maintainer decision needs

An agent that files an issue for a decision only the maintainer can make
(`ready-for-human`, or a question on a report's maintainer line) writes the
body so the maintainer can decide from it alone. The body holds:

- The problem, in plain words.
- What already exists that overlaps: tools, settings, other issues and
  their state, with links. Look these up before filing, so the maintainer
  doesn't have to.
- The options, each with its cost in time, money or upkeep.
- One recommendation, with its reason.

A body that holds only "the one action" is fine for a step such as a
network trace, where nothing is left to decide. In the review of
2026-09-25, a `ready-for-human` issue without this material (#278) cost the
maintainer a second session to find out what an existing tool already
covered, while a question that held the background, the options and a plan
took about a minute.

## Writing the comments

- Date every decision comment. Relative words ("today", "last week") go
  stale.
- Name issues and pull requests by number. GitHub links them.
- When a `gh issue create` call returns the new issue's URL into a shell
  variable, expand it in the closing comment with an unquoted heredoc, or
  write the numbers by hand after creation and read the comment back. A
  quoted heredoc leaves a literal `$A` in the comment.
- Every comment ends with the attribution lines from `AGENTS.md`.

## Session record, 2026-09-20

Sixteen issues in two rounds. Seven `ready-for-human`: four became
`ready-for-agent` with their decisions written down (two of them as
"write the spec" issues for S07 and S08), three were closed after their
entries were split into six new issues and nine entries were dropped with
reasons. Nine `needs-triage` that already carried a triage comment from an
earlier pass: seven relabeled `ready-for-agent` with their blocker named,
one `ready-for-agent` with a one-line spec addition folded in, one
`ready-for-human` for a trace only the maintainer can run.
