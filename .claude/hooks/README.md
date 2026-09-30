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
  (`while` or `until`, or a `for` loop that sleeps), and a `sleep` of any
  length followed by `tail`, `cat`, `ls`, `head`, `grep` or `wc`, which
  polls a background run. It also rejects
  `--no-verify` on `git commit`, `push`, `merge`, `pull` or `rebase` (and
  `git commit -n`), a `SKIP=<hook>` or `PREK_SKIP=<hook>` prefix or
  export, `core.hooksPath` set with `git -c`, `git --config-env`,
  `git config core.hooksPath <value>`, a `GIT_CONFIG_KEY_<n>` or a
  `GIT_CONFIG_PARAMETERS` assignment, every `gh <noun> delete`,
  `gh pr merge` or `gh pr close` with `--delete-branch` or `-d`, a
  `gh api` call with the DELETE method in any flag form or place, a
  `gh api graphql` mutation that calls a `delete...` field, a push that
  deletes a remote branch or tag (`--delete`, `-d`, `:<branch>`,
  `--prune`, `--mirror`), and an `rm` that names `.scratch` and also a
  path outside `.scratch/`, such as `.scratch/../..`. A role sets
  `AI_TRAINING_ROLE` in the environment or as a prefix on the command
  (`AI_TRAINING_ROLE=wave-lead gh pr merge`).
- `review-bash.sh`, PreToolUse on Bash in the `code-reviewer` agent only,
  registered in that agent's frontmatter. It allows the read-only review
  commands and rejects everything else, and any redirect to a file but
  `/dev/null`. It allows `mise run` only for the check tasks in
  `REVIEW_TASKS` in `scripts/agent_hooks.py`, and for
  `mise run issue-brief -- <issue>` with one issue number and nothing
  else (#606). `fast` and `ci` aren't in that list, because their `lint`
  step runs fixers. It rejects a `gh issue view` or `gh pr view` that
  prints the comments: `--comments`, `-c` in a short-option cluster, a
  `--json` list with `comments`, `reviews` or `latestReviews`, and any
  word the shell decides (a `$` expansion, a substitution, `*`, `?` or
  `[`), since a loop's `$f` can become `--comments`. The issue brief
  prints only the trusted comments. It checks the command inside each `$(...)`, backtick pair and process substitution (`<(...)`,
  `>(...)`, `=(...)`) as a command of its own, and drops the `\` before
  `$`, `` ` `` and `\` in a backtick body first, as the shell does. It
  rejects a command it can't read: an unclosed quote, `$((...))`, the zsh
  flags `${(e)X}` and `${~X}`, any other unquoted `(` or `)` (zsh glob
  qualifiers such as `*(e:...:)` run code), an unquoted brace expansion
  such as `{-o,out.txt}`, also with an escaped or quoted space in it, and
  an unquoted here-document (`<<EOF`, where `<<'EOF'` passes). In a
  `sed -n` script a `$` is only the last-line address or the anchor
  before a regex's closing `/`. It also rejects `git -c` and
  `git --config-env`, `--output` on `git diff`, `git log` and `git show`,
  any `NAME=value` assignment, on its own or as a prefix, and a `for` loop
  over an upper-case name or a zsh tied array such as `path`, since a git
  config value or an environment variable such as `GIT_EXTERNAL_DIFF` can
  run a program. The hook catches mistakes and isn't a sandbox, since the
  branch under review defines the tasks it runs.
- `security-bash.sh`, PreToolUse on Bash in the `security-reviewer` agent
  only, registered in that agent's frontmatter (#495). It applies every
  rule of `review-bash.sh` and also allows `mise run audit`,
  `mise run site-audit` and `mise run vuln`, which the #384 pass needs,
  and `python3 scripts/agent_hooks.py` with `guard-bash`, `review-bash`
  or `security-bash`, so the reviewer can feed a command to a hook on
  stdin to check a bypass. `SECURITY_REVIEW` in `scripts/agent_hooks.py`
  holds that list. The audits query remote databases and write nothing
  to the tree, as `.mise.toml` defines them in the checkout the reviewer
  runs them in. The hook-call path is relative to the shell's directory,
  so the hook allows a hook call only in a command without `cd`,
  `chdir`, `pushd` or `popd`, substitutions included. It then runs the
  copy in the directory the session started in.
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
