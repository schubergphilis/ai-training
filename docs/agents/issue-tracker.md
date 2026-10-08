# Issue tracker

This project uses [GitHub Issues](https://github.com/schubergphilis/ai-training/issues).

Use the `gh` CLI to read and write issues:

```bash
gh issue list
gh issue view <number>
gh issue create --title "..." --body "..." --label needs-triage
gh issue comment <number> --body "..."
gh issue edit <number> --add-label ready-for-agent --remove-label needs-triage
gh issue create --title "..." --body-file <file> --label harness --parent <n> --blocked-by <m>
gh issue edit <number> --add-blocked-by <m>     # or --remove-blocked-by, --add-blocking, --remove-blocking
gh issue edit <number> --parent <n>             # or --remove-parent, --add-sub-issue, --remove-sub-issue
gh issue view <number> --json blockedBy,blocking,parent,subIssues,closedByPullRequestsReferences
gh pr view <number> --json closingIssuesReferences
mise run issue-brief -- <number>
```

An agent that builds or reviews an issue reads it with
`mise run issue-brief -- <number>` (`scripts/issue_brief.py`, #606). It
prints the title, the labels, the body and only the comments by the
accounts in `TRUSTED_VERDICT_AUTHORS` (`scripts/wave_status.py`), with
`Decision` and `Triage` comments first and each with its URL, and counts
the other comments without their text. The wave dispatcher reads the
run issue's standing-approval comments the same way (#631). It withholds the body when another account opened
the issue. Anyone can comment on a public issue, so
`gh issue view --comments` puts an outsider's text in the agent's
context, and the review hooks reject it.

The relationship flags and fields need gh 2.94.0 or later, the release
that added sub-issues and relationships to `gh issue`
([release notes](https://github.com/cli/cli/releases/tag/v2.94.0)). `gh`
isn't pinned in `.mise.toml`, so check `gh --version` when a flag is
unknown.

## Labels

| Label           | Description                                                              | Color   |
| --------------- | ------------------------------------------------------------------------ | ------- |
| bug             | Something isn't working                                                  | #d73a4a |
| content         | Adds, changes or improves content: lessons, courses, specs, docs         | #0e8a16 |
| code            | Adds, changes or improves source code: the site's TypeScript, Python, CI | #1d76db |
| harness         | Improves the agent harness: AGENTS.md, .claude, docs/agents, skills      | #5319e7 |
| dispatcher-run  | One /wave dispatcher run: its arguments, waves and state                 | #fbca04 |
| harness-review  | One periodic harness review: its numbers and the issues filed from it    | #c5def5 |
| documentation   | Improvements or additions to documentation                               | #0075ca |
| enhancement     | New feature or request                                                   | #a2eeef |
| needs-triage    | Maintainer needs to evaluate this issue                                  | #e6e6fa |
| needs-info      | Waiting on reporter for more information                                 | #e6e6fa |
| ready-for-agent | Fully specified, ready for an autonomous agent                           | #e6e6fa |
| ready-for-human | Requires human implementation                                            | #e6e6fa |
| wontfix         | This won't be worked on                                                  | #ffffff |

GitHub's default labels (`duplicate`, `good first issue`, `help wanted`,
`invalid`, `question`, `accessibility`) also exist and may be used.

Every open issue has exactly one of `content`, `code` and `harness`,
saying what kind of change it asks for. A lesson issue (title
`Lesson: ...`) is `content`. `harness` is for changes to how agents work
on this repo: `AGENTS.md`, `.claude/`, `docs/agents/` and the
orchestration skills. When several kinds fit, `harness` wins over
`code`, and `code` wins over `content`. A fix to a hook that is Python
code is `harness`, and a lesson change that also changes its fixture is
`code`. The reviewers follow the branch's diff, whatever the label says.
`/wave --kind harness` picks the `harness` issues, and a harness run
starts only when no other `dispatcher-run` issue is open
(`docs/agents/meta-orchestration.md`, "Harness runs").

`dispatcher-run` marks the one issue per `/wave` run, titled
`Run: <Name> (<kind>)`. The dispatcher opens it, keeps its body current
and closes it when the run stops (`docs/agents/meta-orchestration.md`).
`harness-review` marks the one issue per harness review, titled
`Harness review <date>` (`docs/agents/harness-review.md`). These two
kinds of issue are never triaged, picked or claimed, and they are the
only open issues without `content`, `code` or `harness`.

## Relationships

GitHub records these links between issues and pull requests, and new
issues use them instead of body text. `triage.md` has the rules and
the checks behind them.

- **Blocked by and blocking**, for order only: the issue can't start
  before the other is done (`triage.md`, "Dependencies"). The picker also
  reads `Blocked by #N` body lines, which stay the form for a pull request
  blocker and sit next to `Not before YYYY-MM-DD` lines.
- **Parent and sub-issue**, for where an issue came from: a split, a
  kept entry of a list issue, an issue filed from a `Harness review <date>`
  issue, or a follow-up from the review of an issue (`triage.md`, "Where
  an issue came from").
- **Issue and pull request**, through `Closes #N` in the pull request
  body. GitHub then lists the pull request under the issue's Development
  section and closes the issue when the pull request merges into `main`
  ([Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).
  A script reads the link as `closedByPullRequestsReferences` on the issue
  or `closingIssuesReferences` on the pull request, before it parses text.

A pull request can't be linked to an issue without closing it. GitHub's
page on linking says, for linked pull requests in general, that merging
one into the default branch closes its linked issue. The page then lists
the ways to link: a keyword in the body, the Development section of the
pull request's sidebar, and the Development section of the issue's
sidebar. A branch made for an issue with `gh issue develop` or the
issue's "Create a branch" is linked too, and a pull request from that
branch becomes a linked pull request
([Creating a branch to work on an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-a-branch-for-an-issue)).
Only a linked pull request closes an issue, so to name an issue without
closing it, write `#N` with no closing keyword (`close`, `fix`,
`resolve` and their forms) before it. GitHub shows it as a reference
([Autolinked references and URLs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls)).

## Triage flow

1. New issues get `needs-triage`.
2. A maintainer reads the issue and either asks for more detail
   (`needs-info`), closes it (`wontfix`), or specifies it fully.
3. The maintainer labels a fully specified issue `ready-for-agent` when an
   autonomous agent can implement it, or `ready-for-human` when it needs
   judgment, design or access an agent doesn't have.
4. Agents only pick up `ready-for-agent` issues. Reference the issue number in
   the branch name and the PR.
