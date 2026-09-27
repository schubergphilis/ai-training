# Claude Code hooks

The scripts here are thin wrappers. The rules and their tests are in
`scripts/agent_hooks.py` and `tests/test_agent_hooks.py`, from issues #349
and #342. `.claude/settings.json` registers them. `session-title.sh` runs
only after the maintainer adds its `UserPromptSubmit` entry there (#373),
since agents may not edit that file.

- `guard-bash.sh`, PreToolUse on Bash. It exits 2 with a reason that names
  the alternative for a force push, any push to `main`, `gh pr merge`
  outside the wave lead, the dispatcher or a coordinator, `git stash` in
  every worktree (all but `list` and `show`), `git reset --hard`,
  `git checkout -- .` or `git restore .` in the main checkout, a
  `sleep` over 60 seconds, a loop that polls `gh`
  (`while` or `until`, or a `for` loop that sleeps), and a `sleep` followed
  by `tail`, `cat` or `ls`, which polls a background run. It also rejects
  `--no-verify` on `git commit` or `git push` (and `git commit -n`),
  `gh repo delete`, a `gh api` call with the DELETE method in any flag form
  or place, and an `rm` that names `.scratch` and also a path outside
  `.scratch/`, such as `.scratch/../..`. A role sets
  `AI_TRAINING_ROLE` in the environment or as a prefix on the command
  (`AI_TRAINING_ROLE=wave-lead gh pr merge`).
- `review-bash.sh`, PreToolUse on Bash in the `code-reviewer` agent only,
  registered in that agent's frontmatter. It allows the read-only review
  commands and rejects everything else, and any redirect to a file but
  `/dev/null`. It allows `mise run` only for the check tasks in
  `REVIEW_TASKS` in `scripts/agent_hooks.py`. `fast` and `ci` aren't in
  that list, because their `lint` step runs fixers. It checks the command
  inside each `$(...)`, backtick pair and process substitution (`<(...)`,
  `>(...)`, `=(...)`) as a command of its own. It rejects a command it
  can't read: an unclosed quote, `$((...))`, the zsh flags `${(e)X}` and
  `${~X}`, any other unquoted `(` or `)` (zsh glob qualifiers such as
  `*(e:...:)` run code), and an unquoted brace expansion such as
  `{-o,out.txt}`. In a `sed -n` script a `$` is only the last-line address
  or the anchor before a regex's closing `/`. It also rejects `git -c` and
  `git --config-env`, `--output` on `git diff`, `git log` and `git show`,
  and any `NAME=value` assignment, on its own or as a prefix, since a git
  config value or an environment variable such as `GIT_EXTERNAL_DIFF` can
  run a program. The hook catches mistakes and isn't a sandbox, since the
  branch under review defines the tasks it runs.
- `format-file.sh`, PostToolUse on Edit and Write. It runs Biome on an
  edited file under `site/` and ruff on an edited `.py` file, in the
  worktree that holds the file, and never fails the tool call.
- `session-title.sh`, UserPromptSubmit (#373). Once `settings.json`
  registers it, for a prompt that starts with `/wave` it names the
  session `wave <name> <kind> <yyyy-mm-dd>` through
  `hookSpecificOutput.sessionTitle`
  (<https://code.claude.com/docs/en/hooks>, "UserPromptSubmit decision
  control"). With `--resume <Name>` it uses the open run's kind and the
  date its issue was opened. Otherwise it uses the next name from
  `scripts/run_name.py`, the `--kind` (default `lessons`) and today's
  date, both in UTC. A hook that exits 2 here blocks the prompt (same
  page, "Exit code 2 behavior per event"), so this one always exits 0:
  for any other prompt, an unknown kind, a name no open run holds, bad
  JSON, a `gh` that fails or takes over 20 seconds, or any other error,
  it sets no title.

JSON has no comments, so this file says what each layer covers:

- The deny rules in `settings.json` stop the forms they spell out:
  `Edit` on `settings.json` itself, `gh repo delete`, and a `gh api` call
  with `-X DELETE`, `-XDELETE`, `-X=DELETE`, `--method DELETE` or
  `--method=DELETE` anywhere after `api`. They miss a lowercase method and
  a quoted method, such as `gh api <path> -X 'DELETE'`. They also deny a
  call whose text only mentions one of those forms, such as a comment body
  that contains `-X DELETE`. A deny rule stops only the command text it
  matches (<https://code.claude.com/docs/en/permissions>, "What a Bash
  rule doesn't match").
- The allow rules run the commands they match without a prompt. The rule
  `rm -rf .scratch/*` also matches `rm -rf .scratch/x ../other`, so the
  guard hook rejects an `rm` that leaves `.scratch/`.
- The guard hook reads every part of a compound command and covers the
  flag forms the deny rules miss. A hook that exits 2 blocks the call even
  when an allow rule matches it (same page, "Extend permissions with
  hooks"). It matches shell text, so an agent that works around it on
  purpose gets past it.
