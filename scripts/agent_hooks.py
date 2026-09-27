#!/usr/bin/env python3
"""Claude Code hooks for this repo (`.claude/settings.json`, issues #349 and #342).

Four entry points, each reading the hook's JSON event on stdin:

- `guard-bash` (PreToolUse on Bash) rejects a command that breaks a rule
  of `AGENTS.md` or `docs/agents/orchestration.md` and exits 2 with a
  reason that names the alternative, which Claude Code shows the agent.
- `review-bash` (PreToolUse on Bash in the `code-reviewer` agent,
  `.claude/agents/code-reviewer.md`, #348) allows only the read-only
  commands a review needs: `git diff|log|show|status|ls-files`,
  `gh pr diff|view`, `gh issue view`, `mise tasks`, `mise run` of a check
  task in `REVIEW_TASKS`, `cd`, `ls`, `grep`, `cat`, `echo`, `head`,
  `tail`, `wc`, `sort`, `uniq`, `sed -n` with print scripts, and `for`
  loops over these, with no redirect to a file. The command inside each
  `$(...)`, backtick pair or process substitution is checked the same
  way. `git -c`, `git --output` and assignments (`NAME=value`) are
  rejected. Anything else exits 2, and so does a command it can't read.
- `format` (PostToolUse on Edit and Write) runs Biome on an edited file
  under `site/` and ruff on an edited `.py` file. It never fails the tool
  call: a formatter that is missing or errors is skipped.
- `session-title` (UserPromptSubmit, #373) names a dispatcher session
  `wave <name> <kind> <yyyy-mm-dd>` from its `/wave` prompt. It never
  blocks the prompt: on any failure it sets no title and exits 0.

The guard matches shell text, so it catches mistakes and not an agent that
works around it on purpose. It splits the command at `&&`, `||`, `;`, `|`
and newlines outside quotes, skips here-document bodies (a commit message
is data), follows `cd`, and reads `git -C <dir>`. A command it can't
follow, with a `~` path it can't resolve (an unknown user, a zsh
directory-stack entry such as `~+` or a named directory) or a path with a
null character, exits 2 as well: Claude Code runs a command after a hook's
exit 1 (#449).

Besides pushes, merges and discarding commands, it rejects a long `sleep`,
polling (a `gh` loop, or a `sleep` before `tail`, `cat` or `ls`),
`--no-verify`, deletes on GitHub, and an `rm` that leaves `.scratch/`
(#391).

No agent pushes to `main` (#353): every change reaches it through a pull
request. `gh pr merge` is allowed only when `AI_TRAINING_ROLE` names a
role that may merge, either in the hook's environment or as a prefix on
the command itself (`AI_TRAINING_ROLE=wave-lead gh pr merge`).
"""

import contextlib
import json
import os
import re
import shlex
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import run_name

ROLE_VAR = "AI_TRAINING_ROLE"
PUSH_MAIN_ROLES: frozenset[str] = frozenset()
MERGE_ROLES = frozenset({"dispatcher", "wave-lead", "coordinator"})
MAX_SLEEP_SECONDS = 60
MAIN_BRANCH = "main"

OPERATORS = frozenset({"&&", "||", ";", "|", "&", "\n", ";;", "|&"})
KEYWORDS = frozenset({"do", "then", "else", "elif", "{", "(", "!", "time"})
LOOP_WORDS = frozenset({"for", "while", "until"})
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
SLEEP_ARG = re.compile(r"^(\d+(?:\.\d+)?)([smhd]?)$")
GH_SUBSHELL = re.compile(r"(?:\$\(|`)\s*gh\s")
UNITS = {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400}

BIOME_SUFFIXES = frozenset(
    {".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json", ".jsonc", ".astro", ".css"}
)


@dataclass(frozen=True)
class Segment:
    """One simple command: its words, the role prefix it carries, and where it runs."""

    words: list[str]
    role: str | None
    cwd: str


class UnknownHomeError(RuntimeError):
    """A `~` path Python reads as an unknown user, so the hook can't tell where it points."""

    def __init__(self, word: str) -> None:
        super().__init__(f"no home directory for `{word}`")
        self.word = word


def expand_user(word: str) -> Path:
    """`Path(word).expanduser()`, raising `UnknownHomeError` for an unknown `~user` (#449).

    `Path.expanduser` raises a bare `RuntimeError` then. An uncaught one makes
    a hook exit 1, and Claude Code runs the command after a hook's exit 1.
    """
    try:
        return Path(word).expanduser()
    except RuntimeError as error:
        raise UnknownHomeError(word) from error


def strip_heredocs(command: str) -> str:
    """The command without the bodies of its here-documents, which are data."""
    lines = command.split("\n")
    kept: list[str] = []
    ends: list[str] = []
    for line in lines:
        if ends:
            if line.strip() == ends[0]:
                ends.pop(0)
            continue
        kept.append(line)
        ends.extend(m.group(2) for m in HEREDOC.finditer(line))
    return "\n".join(kept)


def tokens(command: str, strict: bool = False) -> list[str]:
    """Shell words and control operators, with quotes respected and newlines kept.

    On unbalanced quotes the words are split at whitespace, or with `strict`
    the `ValueError` is raised, so the review hook can reject the command.
    """
    lexer = shlex.shlex(strip_heredocs(command), posix=True, punctuation_chars=";&|\n")
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        return list(lexer)
    except ValueError:
        if strict:
            raise
        return command.split()


def split_segments(
    command: str, cwd: str, strict: bool = False, keep_assignments: bool = False
) -> list[Segment]:
    """The simple commands of a shell line, with `cd` followed for the ones after it.

    Assignment prefixes (`NAME=value cmd`) are dropped, and the value of the
    role variable becomes the segment's role. With `keep_assignments` they
    stay in the words, so the review hook sees them (#415). `strict` is
    passed to `tokens`.
    """
    segments: list[Segment] = []
    here = cwd
    current: list[str] = []
    for token in [*tokens(command, strict), ";"]:
        if token not in OPERATORS and not set(token) <= set(";&|\n"):
            current.append(token)
            continue
        words = current
        current = []
        while words and words[0] in KEYWORDS:
            words = words[1:]
        role: str | None = None
        while not keep_assignments and words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
            name, _, value = words[0].partition("=")
            if name == ROLE_VAR:
                role = value
            words = words[1:]
        if not words:
            continue
        if words[0] == "cd" and len(words) > 1:
            here = str(Path(here, expand_user(words[1])))
        segments.append(Segment(words, role, here))
    return segments


def is_gh_poll_loop(segments: Sequence[Segment]) -> bool:
    """True when the command polls GitHub: a loop that calls `gh` and waits.

    A `while` or `until` loop waits by its nature. A `for` loop over a list
    (`for n in 359 360; do gh issue view $n; done`) runs once per item and
    polls only when it also sleeps.
    """
    starts = {seg.words[0] for seg in segments}
    if not starts & LOOP_WORDS:
        return False
    if not any(calls_gh(seg.words) for seg in segments):
        return False
    return bool(starts & {"while", "until"}) or "sleep" in starts


def calls_gh(words: Sequence[str]) -> bool:
    """True when a simple command runs `gh`, directly, as a loop condition or in `$(...)`."""
    if words[0] == "gh" or (words[0] in LOOP_WORDS and words[1:2] == ["gh"]):
        return True
    return any(GH_SUBSHELL.search(w) for w in words)


def git_args(words: Sequence[str], cwd: str) -> tuple[list[str], str] | None:
    """The git subcommand and its arguments, and the directory it runs in, or None."""
    if not words or words[0] != "git":
        return None
    rest = list(words[1:])
    here = cwd
    while rest and rest[0].startswith("-"):
        flag = rest.pop(0)
        if flag == "-C" and rest:
            here = str(Path(here, expand_user(rest.pop(0))))
        elif flag in {"-c", "--git-dir", "--work-tree", "--namespace"} and rest:
            rest.pop(0)
    return rest, here


def is_main_checkout(path: str) -> bool:
    """True when `path` is inside the repository's first worktree (not a linked one)."""
    try:
        out = subprocess.run(
            ["git", "-C", path, "rev-parse", "--absolute-git-dir", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.split()
    except OSError, subprocess.CalledProcessError:
        return False
    if len(out) != 2:
        return False
    git_dir, common = out
    return Path(git_dir).resolve() == Path(path, common).resolve()


def current_branch(path: str) -> str:
    """The checked-out branch at `path`, or "" when there is none."""
    try:
        return subprocess.run(
            ["git", "-C", path, "branch", "--show-current"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except OSError, subprocess.CalledProcessError:
        return ""


def role_of(segment: Segment, env: Mapping[str, str]) -> str:
    return segment.role or env.get(ROLE_VAR, "")


def pushes_main(args: Sequence[str], branch: str) -> bool:
    """True when a `git push` argument list updates `main` on the remote."""
    positional = [a for a in args if not a.startswith("-")]
    refspecs = positional[1:]
    if not refspecs:
        return branch == MAIN_BRANCH
    for spec in refspecs:
        dest = spec.lstrip("+").split(":")[-1]
        if dest in {MAIN_BRANCH, f"refs/heads/{MAIN_BRANCH}"}:
            return True
        if dest == "HEAD" and branch == MAIN_BRANCH:
            return True
    return False


def force_push(args: Sequence[str]) -> bool:
    for a in args:
        if a in {"--force", "-f"}:
            return True
        if re.match(r"^-[a-zA-Z]*f[a-zA-Z]*$", a) and not a.startswith("--"):
            return True
    positional = [a for a in args if not a.startswith("-")]
    return any(spec.startswith("+") for spec in positional[1:])


def sleep_seconds(words: Sequence[str]) -> float:
    """The total a `sleep` command waits (GNU sleep adds its arguments), or 0."""
    if not words or words[0] != "sleep":
        return 0
    total = 0.0
    for arg in words[1:]:
        m = SLEEP_ARG.match(arg)
        if m:
            total += float(m.group(1)) * UNITS[m.group(2)]
    return total


def stash_reason(sub: str, rest: list[str], args: list[str]) -> str | None:
    """The reason a `git stash` that changes the stash is rejected, in any directory."""
    if sub != "stash" or (rest and rest[0] in {"list", "show"}):
        return None
    return (
        f"`git {' '.join(args)}`: every worktree of the clone shares one stash "
        "(`refs/stash`), so a `git stash pop` can return another agent's changes. Commit "
        "your work in progress instead. You can also save it with "
        "`git diff HEAD > .scratch/x.patch` and restore it with `git apply` (run "
        "`git add -N` first for untracked files), or run `git worktree add --detach` "
        "for a separate checkout under `../ai-training-wt/`."
    )


READ_COMMANDS = frozenset({"tail", "cat", "ls"})
COMMIT_VALUE_FLAGS = frozenset({"-m", "-F", "-c", "-C", "-t", "--message", "--file", "--template"})
COMMIT_SHORT_VALUE = frozenset("mFcCtuS")
SCRATCH = ".scratch"


def sleeps_then_reads(segments: Sequence[Segment]) -> bool:
    """True when a `sleep` comes before a `tail`, `cat` or `ls` in one command.

    That is how a builder polls a command it started in the background
    (`sleep 55 && tail -5 out.txt`), and a foreground run replaces it.
    """
    slept = False
    for seg in segments:
        if seg.words[0] == "sleep":
            slept = True
        elif slept and seg.words[0] in READ_COMMANDS:
            return True
    return False


def skips_hooks(sub: str, args: Sequence[str]) -> bool:
    """True when `git commit` or `git push` arguments turn the git hooks off.

    Both take `--no-verify`, and git accepts a long option cut to any
    unambiguous prefix (`--no-veri`). For `git commit` only, `-n` is the
    same option, also inside a group of short flags (`-an`). For `git push`,
    `-n` is `--dry-run`.
    """
    if sub not in {"commit", "push"}:
        return False
    skip_next = False
    for arg in args:
        if skip_next:
            skip_next = False
            continue
        if arg == "--":
            return False
        if len(arg) >= len("--no-veri") and "--no-verify".startswith(arg):
            return True
        if sub != "commit":
            continue
        if arg in COMMIT_VALUE_FLAGS:
            skip_next = True
        elif re.match(r"^-[A-Za-z]", arg):
            for i, flag in enumerate(arg[1:], start=1):
                if flag == "n":
                    return True
                if flag in COMMIT_SHORT_VALUE:
                    # A value flag that ends the group (`-am`) takes the next word.
                    skip_next = i == len(arg) - 1 and flag in "mFcCt"
                    break
    return False


def gh_deletes(words: Sequence[str]) -> bool:
    """True for `gh repo delete` and for a `gh api` call with the DELETE method.

    gh reads flags anywhere after the subcommand, and the method as
    `-X DELETE`, `-XDELETE`, `-X=DELETE`, `--method DELETE` or
    `--method=DELETE`.
    """
    if words[:1] != ["gh"]:
        return False
    if words[1:3] == ["repo", "delete"]:
        return True
    if words[1:2] != ["api"]:
        return False
    rest = list(words[2:])
    for i, arg in enumerate(rest):
        following = rest[i + 1] if i + 1 < len(rest) else ""
        if arg in {"-X", "--method"}:
            method = following
        elif arg.startswith("--method="):
            method = arg.removeprefix("--method=")
        elif arg.startswith("-X"):
            method = arg.removeprefix("-X").removeprefix("=")
        else:
            continue
        if method.upper() == "DELETE":
            return True
    return False


def rm_leaves_scratch(words: Sequence[str], cwd: str) -> str | None:
    """The first `rm` target outside `.scratch/` when another target is inside it, or None.

    `settings.json` lets `rm -rf .scratch/*` run without a prompt, and that
    rule also matches `rm -rf .scratch/x ../other` and `rm -rf .scratch/../..`.
    Every target of an `rm` that names `.scratch` must resolve inside a
    `.scratch` directory. A target with `$` or a backtick can't be resolved
    from the text, so it counts as outside.
    """
    if words[:1] != ["rm"]:
        return None
    targets: list[str] = []
    options = True
    for arg in words[1:]:
        if options and arg == "--":
            options = False
        elif options and arg.startswith("-") and arg != "-":
            continue
        else:
            targets.append(arg)
    if not any(SCRATCH in Path(t).parts for t in targets):
        return None
    for target in targets:
        if "$" in target or "`" in target:
            return target
        try:
            resolved = Path(cwd, expand_user(target)).resolve()
        except RuntimeError, OSError, ValueError:
            return target
        if SCRATCH not in resolved.parts:
            return target
    return None


def check_hooks_and_deletes(segment: Segment) -> str | None:
    """The reason a simple command is rejected by the rules of #391, or None."""
    words = segment.words
    if gh_deletes(words):
        return (
            "`gh repo delete` and `gh api` with the DELETE method are for the maintainer. "
            "Report what should go."
        )
    parsed = git_args(words, segment.cwd)
    if parsed and parsed[0] and skips_hooks(parsed[0][0], parsed[0][1:]):
        return (
            "`--no-verify` (or `git commit -n`) skips the git hooks, and the hooks are "
            "checks. Fix what the hook reports, run `mise run fast`, and commit again."
        )
    outside = rm_leaves_scratch(words, segment.cwd)
    if outside is not None:
        return (
            f"`rm` of `{outside}` with a `.scratch` target: every target must be inside "
            "a `.scratch/` directory. Remove the other paths in a separate command."
        )
    return None


def check_segment(
    segment: Segment,
    env: Mapping[str, str],
    main_checkout: Callable[[str], bool],
    branch_of: Callable[[str], str],
) -> str | None:
    """The reason a simple command is rejected, or None when it may run."""
    words = segment.words
    waited = sleep_seconds(words)
    if waited > MAX_SLEEP_SECONDS:
        return (
            f"`sleep` of {waited:g} seconds: the limit is {MAX_SLEEP_SECONDS}. End your turn "
            "and let the agents' notifications wake you, or wait on the thing itself in one "
            "blocking call (`gh pr checks <n> --watch`, `gh run watch <id>`, or a Bash call "
            "with run_in_background)."
        )
    if words[:3] == ["gh", "pr", "merge"] and role_of(segment, env) not in MERGE_ROLES:
        return (
            "`gh pr merge` is for the wave lead, the dispatcher, or a coordinator the "
            "maintainer asked to merge. Report the pull request as ready instead. A role "
            f"that may merge prefixes the command with `{ROLE_VAR}=<role>`."
        )
    reason = check_hooks_and_deletes(segment)
    if reason:
        return reason
    parsed = git_args(words, segment.cwd)
    if parsed is None:
        return None
    args, where = parsed
    if not args:
        return None
    sub, rest = args[0], args[1:]
    if sub == "push":
        if force_push(rest):
            return (
                "Force push: use `git push --force-with-lease` on your own branch instead, "
                "and never on a branch another branch is stacked on."
            )
        if pushes_main(rest, branch_of(where)) and role_of(segment, env) not in PUSH_MAIN_ROLES:
            return (
                "Push to `main`: no agent pushes to `main`. Push your own branch and open "
                "a pull request. A dispatcher keeps its record in its run issue, not in git."
            )
        return None
    stash = stash_reason(sub, rest, args)
    if stash is not None:
        return stash
    destructive = (
        (sub == "reset" and "--hard" in rest)
        or (sub == "checkout" and "--" in rest and "." in rest[rest.index("--") :])
        or (sub == "checkout" and rest == ["."])
        or (sub == "restore" and "." in rest)
    )
    if destructive and main_checkout(where):
        return (
            f"`git {' '.join(args)}` in the main checkout: other agents' work may be in it. "
            "Work in your own worktree (`../ai-training-wt/<branch>`), and leave the main "
            "checkout as you found it."
        )
    return None


def check_command(
    command: str,
    cwd: str,
    env: Mapping[str, str],
    main_checkout: Callable[[str], bool] = is_main_checkout,
    branch_of: Callable[[str], str] = current_branch,
) -> str | None:
    """The reason a Bash command is rejected, or None when it may run."""
    segments = split_segments(command, cwd)
    if is_gh_poll_loop(segments):
        return (
            "A loop that calls `gh` and waits is a poll loop. Wait in one blocking call "
            "(`gh pr checks <n> --watch`, `gh run watch <id>`), or end your turn and let "
            "the notifications wake you. Reviews come back in the reviewer's hand-back, so "
            "never poll a pull request for comments."
        )
    if sleeps_then_reads(segments):
        return (
            "`sleep` and then `tail`, `cat` or `ls` polls a command that runs in the "
            "background. Run the command in the foreground instead, with a long Bash "
            "timeout (600000 ms for `mise run fast`), and read its output when it ends."
        )
    for segment in segments:
        reason = check_segment(segment, env, main_checkout, branch_of)
        if reason:
            return reason
    return None


def guard_bash(event: Mapping[str, Any], env: Mapping[str, str]) -> tuple[int, str]:
    """Exit code and message for a PreToolUse event: 2 blocks the call, 0 lets it run."""
    tool_input: Mapping[str, Any] = event.get("tool_input") or {}
    command = tool_input.get("command")
    if not isinstance(command, str):
        return 0, ""
    cwd = event.get("cwd")
    try:
        reason = check_command(command, cwd if isinstance(cwd, str) else str(Path.cwd()), env)
    except UnknownHomeError as error:
        reason = unknown_home(error)
    except ValueError as error:
        # Such as a null character in a path, which `os` and `subprocess` refuse.
        reason = unreadable(f"text it can't read ({error})", "remove any unusual character.")
    if reason:
        return 2, f"Blocked by .claude/hooks/guard-bash.sh: {reason}"
    return 0, ""


REVIEW_COMMANDS = (
    ("git", "diff"),
    ("git", "log"),
    ("git", "show"),
    ("git", "status"),
    ("gh", "pr", "diff"),
    ("gh", "pr", "view"),
    ("gh", "issue", "view"),
    ("git", "ls-files"),
    ("mise", "tasks"),
    ("head",),
    ("tail",),
    ("grep",),
    ("wc",),
    ("ls",),
    ("cat",),
    ("echo",),
    ("sort",),
    ("uniq",),
)

# The `mise run` tasks a reviewer may run: checks that write only to
# ignored paths (site/dist, site/.astro, site/coverage, .venv, the caches).
# `setup` stays: its installs are frozen (`bun install --frozen-lockfile`,
# `uv sync --locked`), so they fail instead of rewriting a lockfile, and
# they write only site/node_modules, .venv and .vale/styles, which are
# ignored. `fast` and `ci` are left out: both run `lint`, whose prek hooks
# include fixers (ruff-check --fix, ruff-format, mdformat,
# trailing-whitespace, end-of-file-fixer) that rewrite a tracked file on a
# branch that isn't formatted, even in a clean checkout. The formatters
# (`site-format`, `py-format`) and the installs that may update a lockfile
# (`site-install`, `py-install`) are left out for the same reason (#388).
REVIEW_TASKS = (
    "setup",
    "py-lint",
    "py-typecheck",
    "py-test",
    "prose",
    "spell",
    "examples",
    "data",
    "site-check",
    "site-lint",
    "site-test",
    "site-build",
    "checkpoints",
    "bundles",
)

# `mise tasks` subcommands that change or run something.
MISE_TASKS_WRITERS = frozenset({"add", "edit", "run", "r"})

# A `$` is the last-line address or the anchor right before a regex's
# closing `/`. Any other `$` in a sed script comes from the shell, such as
# the zsh `/$~X/p` (#414).
SED_ADDRESS = r"(\d+|\$|/(?:[^/\\$]|\\.)*\$?/)"
SED_PRINT = re.compile(rf"{SED_ADDRESS}(,{SED_ADDRESS})?p(;{SED_ADDRESS}(,{SED_ADDRESS})?p)*")


REDIRECT_END = frozenset(" \t\n;|&<>()")


def output_redirects(command: str) -> list[str]:
    """The targets of the unquoted `>` redirects in a command, as written.

    `2>&1` gives `&1`, and `>> f`, `>| f` and `&> f` give `f`. Text inside
    quotes or after a backslash is not a redirect.
    """
    targets: list[str] = []
    quote = ""
    i = 0
    while i < len(command):
        char = command[i]
        if quote:
            if char == "\\" and quote == '"':
                i += 1
            elif char == quote:
                quote = ""
        elif char == "\\":
            i += 1
        elif char in "'\"":
            quote = char
        elif char == ">":
            j = i + 1
            if j < len(command) and command[j] in ">|":
                j += 1
            if j < len(command) and command[j] == "&":
                k = j + 1
                while k < len(command) and (command[k].isdigit() or command[k] == "-"):
                    k += 1
                targets.append(command[j:k])
                i = k
                continue
            while j < len(command) and command[j] in " \t":
                j += 1
            k = j
            while k < len(command) and command[k] not in REDIRECT_END:
                k += 1
            targets.append(command[j:k])
            i = k
            continue
        i += 1
    return targets


def writes_a_file(command: str) -> bool:
    """True when a redirect writes somewhere other than /dev/null or another descriptor."""
    return any(
        target != "/dev/null" and not re.fullmatch(r"&(\d+|-)", target)
        for target in output_redirects(command)
    )


# Stands for the `$` of a shell expansion in the words `review_bash` checks,
# so a sed script built from a variable is rejected (#388 review).
EXPANSION = "\x00"


def mark_expansions(command: str) -> str:
    """The command with the `$` of each shell expansion replaced by `EXPANSION`.

    A `$` starts an expansion outside single quotes and without a backslash
    before it, when a name, a digit, `{`, `(`, a quote, a special parameter
    or a zsh parameter flag (`$=X`, `$~X`, `$^X`, `$+X`) follows. The `$` of
    the sed last-line address (`'$p'`) and of a regex anchor (`/foo$/`)
    stays.
    """
    out: list[str] = []
    quote = ""
    i = 0
    while i < len(command):
        char = command[i]
        if quote == "'":
            if char == "'":
                quote = ""
        elif char == "\\":
            out.append(command[i : i + 2])
            i += 2
            continue
        elif char == '"':
            quote = "" if quote else '"'
        elif char == "'" and not quote:
            quote = "'"
        elif char == "$" and re.match(r"[A-Za-z0-9_{('\"@*#?!$=~^+-]", command[i + 1 : i + 2]):
            char = EXPANSION
        out.append(char)
        i += 1
    return "".join(out)


# Stands for a command or process substitution that `extract_substitutions`
# took out of a review command (#414). The block message shows it as `$(...)`.
SUBSTITUTION = "\x01"
SUBSTITUTION_STARTS = ("$(", "<(", ">(", "=(")
BRACE_WORD_END = frozenset(" \t\n;|&<>()}")


def extract_substitutions(command: str) -> tuple[str, list[str]]:
    """The command with each substitution replaced by `SUBSTITUTION`, and the inner commands.

    The substitutions are `$(...)`, backticks, and the process substitutions
    `<(...)`, `>(...)` and zsh's `=(...)`, also inside double quotes and
    nested. The review hook checks each inner command like a command of its
    own, so `for f in $(git ls-files site)` passes and `echo $(rm -rf .)`
    doesn't.

    Raises `ValueError` for text the hook rejects without a closer look:
    an unclosed quote or substitution, a nested backtick, arithmetic
    `$((...))`, the zsh parameter flags `${(e)X}`, `${~X}` and `$~X`, which
    evaluate or glob a variable's value, and `${=X}`, `${^X}` and `${+X}`,
    which also start a combined flag such as `${^~X}`, any other unquoted `(` or
    `)`, which covers the zsh glob qualifiers that run code (`*(e:...:)`,
    `*(+f)`), and an unquoted brace expansion such as `{-o,out.txt}` or
    `{1..3}`, which turns one word the hook reads into several.
    """
    inner: list[str] = []
    outer, _ = scan_substitutions(command, 0, "", inner)
    return outer, inner


def scan_substitutions(text: str, i: int, stop: str, inner: list[str]) -> tuple[str, int]:
    """Scan `text` from `i` to the unquoted `stop` (`)`, `"`, or "" for the end of the text).

    Returns the scanned text with its substitutions replaced and the index
    after `stop`, and appends each inner command to `inner`.
    """
    quoted = stop == '"'
    out: list[str] = []
    while i < len(text):
        char = text[i]
        pair = text[i : i + 2]
        if char == stop:
            return "".join(out), i + 1
        if char == "\\":
            out.append(text[i : i + 2])
            i += 2
            continue
        if pair == "$~" or re.match(r"\$\{[(=^~+]", text[i : i + 3]):
            raise ValueError("a zsh parameter flag that evaluates or globs a value")
        if pair == "$(" or (not quoted and pair in SUBSTITUTION_STARTS):
            if text[i : i + 3] == "$((":
                raise ValueError("an arithmetic expansion")
            body, i = scan_substitutions(text, i + 2, ")", inner)
            inner.append(body)
            out.append(SUBSTITUTION)
            continue
        if char == "`":
            body, i = backtick_body(text, i + 1)
            inner.append(scan_substitutions(body, 0, "", inner)[0])
            out.append(SUBSTITUTION)
            continue
        if not quoted:
            if char == '"':
                body, i = scan_substitutions(text, i + 1, '"', inner)
                out.append(f'"{body}"')
                continue
            end = quote_end(text, i)
            if end is not None:
                out.append(text[i:end])
                i = end
                continue
            if char in "()":
                raise ValueError(f"an unquoted `{char}`")
            if char == "{" and text[i - 1 : i] != "$" and is_brace_expansion(text, i):
                raise ValueError("a brace expansion")
        out.append(char)
        i += 1
    if stop:
        raise ValueError("an unclosed quote or substitution")
    return "".join(out), i


def quote_end(text: str, i: int) -> int | None:
    """The index after the `'...'` or `$'...'` string at `i`, or None when none starts there.

    Raises `ValueError` when the quote isn't closed.
    """
    if text[i] == "'":
        end = text.find("'", i + 1)
        if end < 0:
            raise ValueError("an unclosed quote")
        return end + 1
    if text[i : i + 2] == "$'":
        j = i + 2
        while j < len(text) and text[j] != "'":
            j += 2 if text[j] == "\\" else 1
        if j >= len(text):
            raise ValueError("an unclosed quote")
        return j + 1
    return None


def backtick_body(text: str, i: int) -> tuple[str, int]:
    """The command between backticks that starts at `i`, and the index after the closing one."""
    j = i
    while j < len(text) and text[j] != "`":
        if text[j : j + 2] == "\\`":
            raise ValueError("a nested backtick")
        j += 2 if text[j] == "\\" else 1
    if j >= len(text):
        raise ValueError("an unclosed backtick")
    return text[i:j], j + 1


def is_brace_expansion(text: str, i: int) -> bool:
    """True when the `{` at `i` opens a brace expansion such as `{a,b}` or `{1..3}`."""
    j = i + 1
    while j < len(text) and text[j] not in BRACE_WORD_END:
        j += 1
    body = text[i + 1 : j]
    return text[j : j + 1] == "}" and ("," in body or ".." in body)


def sed_prints_only(args: Sequence[str]) -> bool:
    """True for `sed -n` with print-only scripts (`1,20p`, `/a/,/b/p`).

    Any other option, including `-i` in any spelling, and any other sed
    command, such as `w` (write a file) or `e` (run a command), is rejected.
    """
    quiet = False
    scripts: list[str] = []
    operands: list[str] = []
    i = 0
    while i < len(args):
        word = args[i]
        cluster = re.fullmatch(r"-([nErsuz]*)(e?)", word)
        if cluster and word != "-":
            quiet = quiet or "n" in cluster.group(1)
            if cluster.group(2):
                i += 1
                if i == len(args):
                    return False
                scripts.append(args[i])
        elif word.startswith("-"):
            return False
        else:
            operands.append(word)
        i += 1
    if not scripts and operands:
        scripts.append(operands.pop(0))
    return (
        quiet
        and bool(scripts)
        and all(
            SED_PRINT.fullmatch(s) and not {EXPANSION, SUBSTITUTION, "`"} & set(s) for s in scripts
        )
    )


def sort_writes(args: Sequence[str]) -> bool:
    """True when `sort` writes a file (`-o`) or runs a program (`--compress-program`)."""
    return any(
        # GNU and BSD sort accept any unambiguous prefix of a long option.
        word.startswith(("--o", "--co")) or re.fullmatch(r"-[a-zA-Z]*o.*", word) is not None
        for word in args
    )


def uniq_writes(args: Sequence[str]) -> bool:
    """True when `uniq` gets a second operand, which it writes to."""
    operands = 0
    skip = False
    for word in args:
        if skip:
            skip = False
        elif word in {"-f", "-s", "-w"}:
            skip = True
        elif not word.startswith("-") or word == "-":
            operands += 1
    return operands > 1


GIT_OUTPUT_COMMANDS = frozenset({"diff", "log", "show"})


def git_sets_config(options: Sequence[str]) -> bool:
    """True when git's global options set a config value (`-c k=v`, `--config-env`).

    A config value such as `core.fsmonitor` or `diff.external` runs a
    program, so a reviewer's git takes its config from the files only (#415).
    """
    return any(word.startswith(("-c", "--config-env")) for word in options)


def is_git_output_option(word: str) -> bool:
    """True for `--output` of `git diff|log|show`, which writes the output to a file.

    git 2.55 rejects an abbreviation such as `--outp=f`, but a prefix counts
    too, in case a git version accepts it.
    """
    name = word.split("=", 1)[0]
    return len(name) > len("--") and "--output".startswith(name)


def review_allows(words: Sequence[str]) -> bool:
    """True when a simple command is one the code reviewer may run.

    An assignment prefix (`GIT_EXTERNAL_DIFF=sh git diff`) or an
    assignment on its own (`PATH=.; ls`) is never one (#415).
    """
    if words[0] in {"cd", "done"}:
        return True
    if words[0] == "for":
        # The loop header. The body segments are checked one by one, and
        # review_reason checks a substitution in the word list (#414).
        return len(words) >= 2 and words[1].isidentifier() and words[2:3] in ([], ["in"])
    if words[0] == "sed":
        return sed_prints_only(words[1:])
    if words[0] == "sort" and sort_writes(words[1:]):
        return False
    if words[0] == "uniq" and uniq_writes(words[1:]):
        return False
    if words[:2] == ["mise", "run"]:
        return len(words) == 3 and words[2] in REVIEW_TASKS
    if words[:2] == ["mise", "tasks"] and MISE_TASKS_WRITERS & set(words[2:]):
        return False
    if words[0] == "git":
        parsed = git_args(words, ".")
        args = parsed[0] if parsed else []
        if not args or ("git", args[0]) not in REVIEW_COMMANDS:
            return False
        return not git_sets_config(words[1 : len(words) - len(args)]) and not (
            args[0] in GIT_OUTPUT_COMMANDS and any(map(is_git_output_option, args[1:]))
        )
    return any(tuple(words[: len(allowed)]) == allowed for allowed in REVIEW_COMMANDS)


def review_reason(command: str) -> str | None:
    """The reason the code reviewer may not run a command, or None when it may.

    Each command or process substitution in it is checked as a command of
    its own (#414).
    """
    if writes_a_file(command):
        return (
            "the command redirects output to a file. A reviewer never writes files. "
            "Read the output instead, or send it to /dev/null."
        )
    outer, inner = extract_substitutions(command)
    for body in inner:
        reason = review_reason(body)
        if reason:
            return reason
    # The splitter reads the `&` of `2>&1` as an operator, so drop the
    # redirects writes_a_file allows before splitting.
    harmless = re.sub(r"(\d*|&)>>?(&(\d+|-)|\s*/dev/null)", " ", outer)
    segments = split_segments(mark_expansions(harmless), ".", strict=True, keep_assignments=True)
    for segment in segments:
        if segment.role is not None or not review_allows(segment.words):
            allowed = ", ".join(" ".join(c) for c in REVIEW_COMMANDS)
            tasks = ", ".join(REVIEW_TASKS)
            shown = " ".join(segment.words).replace(EXPANSION, "$")
            shown = shown.replace(SUBSTITUTION, "$(...)")
            return (
                f"`{shown}` is not a review command. A reviewer runs only {allowed}, "
                "sed -n with p scripts, for loops over these, cd, and mise run with one "
                f"of {tasks}. A reviewer never edits."
            )
    return None


QUOTING_HINT = "quote a `(`, `)` or `{` that is text, and run the commands one by one."


def unreadable(what: str, hint: str = QUOTING_HINT) -> str:
    """The block message for a command the review checks can't read."""
    return f"the hook can't check a command with {what}. Write the command without it: {hint}"


def unknown_home(error: UnknownHomeError) -> str:
    """The block message for a `~` path that `Path.expanduser` can't resolve.

    That is a user that doesn't exist, and also zsh forms Python reads as a
    user name: `~+`, `~-`, `~2` and named directories (`hash -d`).
    """
    return unreadable(f"a `~` path it can't resolve (`{error.word}`)", "use an absolute path.")


def review_bash(event: Mapping[str, Any]) -> tuple[int, str]:
    """Exit code and message for the code reviewer's PreToolUse event on Bash.

    A command the checks can't read, such as one with an unclosed quote or
    a zsh glob qualifier, is blocked too: only exit 2 blocks the call.
    """
    tool_input: Mapping[str, Any] = event.get("tool_input") or {}
    command = tool_input.get("command")
    if not isinstance(command, str):
        return 0, ""
    try:
        reason = review_reason(command)
    except RecursionError:
        reason = unreadable("substitutions nested too deep")
    except ValueError as error:
        reason = unreadable(str(error))
    except UnknownHomeError as error:
        reason = unknown_home(error)
    if reason:
        return 2, f"Blocked by the code-reviewer hook: {reason}"
    return 0, ""


def formatter_for(path: Path, root: Path) -> tuple[list[str], Path] | None:
    """The formatter command for an edited file and the directory to run it in, or None."""
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        return None
    if rel.suffix == ".py":
        ruff = root / ".venv" / "bin" / "ruff"
        return ([str(ruff), "format", "--quiet", str(rel)], root) if ruff.exists() else None
    if rel.parts[:1] == ("site",) and rel.suffix in BIOME_SUFFIXES:
        biome = root / "site" / "node_modules" / ".bin" / "biome"
        if not biome.exists():
            return None
        inner = Path(*rel.parts[1:])
        cmd = [str(biome), "check", "--write", "--no-errors-on-unmatched", str(inner)]
        return cmd, root / "site"
    return None


def repo_root(path: Path) -> Path | None:
    """The worktree that holds `path`, so an edit in a linked worktree formats there."""
    try:
        out = subprocess.run(
            ["git", "-C", str(path.parent), "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except OSError, subprocess.CalledProcessError:
        return None
    return Path(out) if out else None


def format_file(event: Mapping[str, Any]) -> int:
    """Run the formatter for a PostToolUse event's file. Always 0."""
    tool_input: Mapping[str, Any] = event.get("tool_input") or {}
    file_path = tool_input.get("file_path")
    if not isinstance(file_path, str):
        return 0
    path = Path(file_path)
    root = repo_root(path)
    if root is None:
        return 0
    found = formatter_for(path, root)
    if found is None:
        return 0
    cmd, where = found
    with contextlib.suppress(OSError, subprocess.TimeoutExpired):
        subprocess.run(cmd, cwd=where, capture_output=True, timeout=25, check=False)
    return 0


SESSION_TITLE_MAX = 100
"""The longest title the hook sets, as #373 decided: a longer one is cut."""
WAVE_KINDS = frozenset({"lessons", "content", "code", "harness"})
DEFAULT_WAVE_KIND = "lessons"
SESSION_GH_TIMEOUT = 20
"""Seconds for each gh call, under the 30-second UserPromptSubmit hook timeout."""


def session_gh(args: Sequence[str]) -> object:
    """Run gh for the session title and parse its output, or raise RunNameError."""
    try:
        done = subprocess.run(
            ["gh", *args],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=True,
            text=True,
            timeout=SESSION_GH_TIMEOUT,
        )
        return cast("object", json.loads(done.stdout))
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as e:
        raise run_name.RunNameError(f"session-title: gh {' '.join(args[:2])} failed: {e}") from e


def wave_arguments(prompt: str) -> dict[str, str] | None:
    """The `--kind` and `--resume` values of a `/wave` prompt, or None for any other prompt.

    Only the first line counts, and its first word must be `/wave`
    exactly, so `/wave-status` is not a `/wave` prompt. Both `--kind code`
    and `--kind=code` are read. A flag without a value is None, since the
    skill stops on it.
    """
    lines = prompt.strip().splitlines()
    words = lines[0].split() if lines else []
    if not words or words[0] != "/wave":
        return None
    found: dict[str, str] = {}
    rest = words[1:]
    i = 0
    while i < len(rest):
        word = rest[i]
        for flag in ("--kind", "--resume"):
            if word == flag:
                if i + 1 >= len(rest):
                    return None
                found[flag] = rest[i + 1]
                i += 1
            elif word.startswith(flag + "="):
                found[flag] = word.removeprefix(flag + "=")
        i += 1
    return found


def wave_title(name: str, kind: str, date: str) -> str:
    """`wave <name> <kind> <yyyy-mm-dd>` in lowercase, cut to SESSION_TITLE_MAX characters."""
    return f"wave {name} {kind} {date}".lower()[:SESSION_TITLE_MAX]


def session_title(
    event: Mapping[str, Any],
    gh: run_name.Gh | None = None,
    now: Callable[[], datetime] | None = None,
    names_file: Path | None = None,
) -> str | None:
    """The session title for a UserPromptSubmit event, or None to leave the title alone.

    A `/wave --resume <Name>` prompt gets the open run's name, kind and the
    date its issue was opened. Any other `/wave` prompt gets the name
    `run-name` gives the next run, the `--kind` (default `lessons`) and
    today's date. Dates are in UTC, as GitHub gives `createdAt`, so a
    resume shows the date the new run showed. None for a prompt that
    isn't `/wave`, an unknown kind, a resume name no open run holds, and
    when gh or the names file fails: the dispatcher then prints the
    `/rename` line.
    """
    prompt = event.get("prompt")
    if not isinstance(prompt, str):
        return None
    args = wave_arguments(prompt)
    if args is None:
        return None
    issues = run_name.fetch_issues(None, gh or session_gh)
    runs = [run for issue in issues if (run := run_name.run_of(issue)) is not None]
    resume = args.get("--resume")
    if resume is not None:
        match = next(
            (r for r in runs if r["open"] and r["name"].lower() == resume.lower()),
            None,
        )
        if match is None:
            return None
        return wave_title(match["name"], match["kind"], match["createdAt"][:10])
    kind = args.get("--kind", DEFAULT_WAVE_KIND)
    if kind not in WAVE_KINDS:
        return None
    text = (names_file or run_name.NAMES_FILE).read_text(encoding="utf-8")
    name = run_name.next_run_name(run_name.run_name_sequence(text), runs)
    today = (now or (lambda: datetime.now(UTC)))().date().isoformat()
    return wave_title(name, kind, today)


def session_title_hook(event: Mapping[str, Any]) -> int:
    """Print the hook output that sets the session title, if there is one. Always 0.

    A UserPromptSubmit hook that exits 2 blocks the prompt, so every
    failure, whatever it raises, leaves the title alone and exits 0.
    """
    try:
        title = session_title(event)
    except Exception as e:  # the hook never blocks /wave, whatever went wrong
        print(f"session-title: no title: {e}", file=sys.stderr)
        return 0
    if title is not None:
        output = {
            "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "sessionTitle": title}
        }
        print(json.dumps(output))
    return 0


def main(argv: Sequence[str], stdin: str, env: Mapping[str, str]) -> int:
    if len(argv) != 2 or argv[1] not in {"guard-bash", "review-bash", "format", "session-title"}:
        print(
            "usage: agent_hooks.py guard-bash|review-bash|format|session-title < event.json",
            file=sys.stderr,
        )
        return 1
    try:
        parsed: object = json.loads(stdin)
    except json.JSONDecodeError:
        return 0
    if not isinstance(parsed, dict):
        return 0
    event = cast("dict[str, Any]", parsed)
    if argv[1] == "format":
        return format_file(event)
    if argv[1] == "session-title":
        return session_title_hook(event)
    if argv[1] == "review-bash":
        code, message = review_bash(event)
    else:
        code, message = guard_bash(event, env)
    if message:
        print(message, file=sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv, sys.stdin.read(), os.environ))
