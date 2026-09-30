# Issue tracker

This project uses [GitHub Issues](https://github.com/schubergphilis/ai-training/issues).

Use the `gh` CLI to read and write issues:

```bash
gh issue list
gh issue view <number>
gh issue create --title "..." --body "..." --label needs-triage
gh issue comment <number> --body "..."
gh issue edit <number> --add-label ready-for-agent --remove-label needs-triage
```

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

## Triage flow

1. New issues get `needs-triage`.
2. A maintainer reads the issue and either asks for more detail
   (`needs-info`), closes it (`wontfix`), or specifies it fully.
3. The maintainer labels a fully specified issue `ready-for-agent` when an
   autonomous agent can implement it, or `ready-for-human` when it needs
   judgment, design or access an agent doesn't have.
4. Agents only pick up `ready-for-agent` issues. Reference the issue number in
   the branch name and the PR.
