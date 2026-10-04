#!/usr/bin/env python3
"""Claude Code hooks for this repo (`.claude/settings.json`, issues #349 and #342).

Five entry points, each reading the hook's JSON event on stdin:

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
  A backtick body is unescaped before the check, a `for` loop over an
  upper-case name or `path` and an unquoted here-document are rejected,
  and a brace expansion counts with escaped or quoted text in it (#448).
- `security-bash` (PreToolUse on Bash in the `security-reviewer` agent,
  `.claude/agents/security-reviewer.md`, #495) applies the `review-bash`
  rules and also allows `mise run audit`, `site-audit` and `vuln`, and
  `python3 scripts/agent_hooks.py` with a Bash hook mode, so the
  reviewer can feed a command to the hooks (`SECURITY_REVIEW`).
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
polling (a `gh` loop, or a `sleep` before `tail`, `cat`, `ls`, `head`,
`grep` or `wc`, #422),
`--no-verify`, deletes on GitHub, and an `rm` that leaves `.scratch/`
(#391).
It rejects a write to `osv-scanner.toml`, the maintainer's advisory
overrides (docs/agents/supply-chain.md).
It also rejects the other ways to skip the git hooks (`SKIP`, `PREK_SKIP`,
`core.hooksPath`, `--no-verify` on `git merge`, `pull` and `rebase`), every
`gh <noun> delete`, a `gh api graphql` delete mutation, and a push that
deletes a remote branch (#421).

No agent runs `mise run branch-cleanup` (scripts/branch_cleanup.py), not
even as a dry run: it is for human maintainers only.

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
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

ROLE_VAR = "AI_TRAINING_ROLE"
PUSH_MAIN_ROLES: frozenset[str] = frozenset()
MERGE_ROLES = frozenset({"dispatcher", "wave-lead", "coordinator"})
MAX_SLEEP_SECONDS = 60
MAIN_BRANCH = "main"

OPERATORS = frozenset({"&&", "||", ";", "|", "&", "\n", ";;", "|&"})
KEYWORDS = frozenset({"do", "then", "else", "elif", "{", "(", "!", "time"})
LOOP_WORDS = frozenset({"for", "while", "until"})
# `(?<!<)` and `(?!<)` leave out the zsh here-string `<<<word`, whose next
# lines are commands, and `\?` reads a delimiter with a backslash before it,
# `<<\EOF`, which the shell reads as quoted (#448,
# https://zsh.sourceforge.io/Doc/Release/Redirection.html).
HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*\\?(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
SLEEP_ARG = re.compile(r"^(\d+(?:\.\d+)?)([smhd]?)$")
GH_SUBSHELL = re.compile(r"(?:\$\(|`)\s*gh\s")
UNITS = {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400}

BIOME_SUFFIXES = frozenset(
    {".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json", ".jsonc", ".astro", ".css"}
)


@dataclass(frozen=True)
class Segment:
    """One simple command: its words, the role prefix it carries, and where it runs.

    `assignments` holds the assignment prefixes the parser dropped from
    `words`, as written (`SKIP=ruff` for `SKIP=ruff git commit`, #421).
    """

    words: list[str]
    role: str | None
    cwd: str
    assignments: tuple[str, ...] = ()


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
        # An empty word (`''`) is an argument: its empty set of characters
        # would otherwise pass as an operator and split the command.
        if token not in OPERATORS and (token == "" or not set(token) <= set(";&|\n")):
            current.append(token)
            continue
        words = current
        current = []
        while words and words[0] in KEYWORDS:
            words = words[1:]
        role: str | None = None
        dropped: list[str] = []
        while not keep_assignments and words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
            name, _, value = words[0].partition("=")
            if name == ROLE_VAR:
                role = value
            dropped.append(words[0])
            words = words[1:]
        if not words:
            continue
        if words[0] == "cd" and len(words) > 1:
            here = str(Path(here, expand_user(words[1])))
        segments.append(Segment(words, role, here, tuple(dropped)))
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


PUSH_VALUE_FLAGS = frozenset({"-o", "--push-option", "--repo", "--receive-pack", "--exec"})


def is_delete_option(arg: str) -> bool:
    """True for `--delete` of `git push`, or a prefix down to `--de`, which git accepts."""
    return len(arg) >= len("--de") and "--delete".startswith(arg)


def push_deletes(args: Sequence[str]) -> bool:
    """True when a `git push` argument list deletes a branch or tag on the remote (#421).

    That is `--delete` (or a prefix down to `--de`), `-d`, also in a group
    of short flags (`-fd`), a refspec with an empty source (`:feat/x`,
    `+:feat/x`), `--prune`, and `--mirror`, which removes the remote refs
    that aren't local. A lone `:` pushes the matching branches and deletes
    nothing (https://git-scm.com/docs/git-push).
    """
    skip_next = False
    for arg in args:
        if skip_next:
            skip_next = False
            continue
        if arg == "--":
            break
        if arg in PUSH_VALUE_FLAGS:
            skip_next = True
        elif arg in {"--prune", "--mirror"} or is_delete_option(arg):
            return True
        elif re.match(r"^-[A-Za-z0-9]", arg):
            # `-o` takes a value, so the group ends there (`-uoci.skip`).
            group = arg[1:].split("o", 1)[0]
            if "d" in group:
                return True
    positional = [a for a in args if not a.startswith("-")]
    return any(
        len(spec.lstrip("+")) > 1 and spec.lstrip("+").startswith(":") for spec in positional
    )


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


READ_COMMANDS = frozenset({"tail", "cat", "ls", "head", "grep", "wc"})
COMMIT_VALUE_FLAGS = frozenset({"-m", "-F", "-c", "-C", "-t", "--message", "--file", "--template"})
COMMIT_SHORT_VALUE = frozenset("mFcCtuS")
SCRATCH = ".scratch"


def sleeps_then_reads(segments: Sequence[Segment]) -> bool:
    """True when a `sleep` comes before a read (`READ_COMMANDS`) in one command.

    That is how a builder polls a command it started in the background
    (`sleep 55 && tail -5 out.txt`), and a foreground run replaces it. A
    `sleep` of any length counts, since every poll costs a model turn (#422).
    Polling across two Bash calls is out of reach of a per-command hook.
    """
    slept = False
    for seg in segments:
        if seg.words[0] == "sleep":
            slept = True
        elif slept and seg.words[0] in READ_COMMANDS:
            return True
    return False


NO_VERIFY_COMMANDS = frozenset({"commit", "push", "merge", "pull", "rebase"})
MERGE_VALUE_FLAGS = frozenset(
    {"-m", "-F", "-s", "-X", "--message", "--file", "--strategy", "--strategy-option"}
)


def skips_hooks(sub: str, args: Sequence[str]) -> bool:
    """True when `git commit|push|merge|pull|rebase` arguments turn the git hooks off.

    All take `--no-verify` (#421 adds `merge`, and `pull` and `rebase` with
    it, https://git-scm.com/docs/git-merge, https://git-scm.com/docs/git-pull,
    https://git-scm.com/docs/git-rebase), and git accepts a long option cut
    to any unambiguous prefix (`--no-veri`). For `git commit` only, `-n` is the same option, also
    inside a group of short flags (`-an`). For `git push`, `-n` is
    `--dry-run`, and for `merge`, `pull` and `rebase` it is `--no-stat`.
    """
    if sub not in NO_VERIFY_COMMANDS:
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
        if sub in {"merge", "pull"} and arg in MERGE_VALUE_FLAGS:
            skip_next = True
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


HOOKS_PATH_KEY = "core.hookspath"
SHELL_EXPORTS = frozenset({"export", "env", "typeset", "declare", "readonly", "local"})
GH_DELETE_VERB = re.compile(r"^(delete|delete-[a-z-]+|[a-z-]+-delete)$")
GRAPHQL_DELETE = re.compile(r"\bdelete[A-Z_]")


PREK_SKIP_VARS = frozenset({"PREK_SKIP", "SKIP"})


def sets_skip(segment: Segment) -> bool:
    """True when a command sets a variable that makes prek skip hooks (#421).

    prek reads `PREK_SKIP`, and `SKIP` as its fallback
    (https://prek.j178.dev/reference/environment-variables/). That is a
    `SKIP=<hook>` prefix, and the name after `export`, `env`, `typeset`,
    `declare`, `readonly` or `local`. Another name, such as `SKIPPED`,
    passes.
    """
    return any(name in PREK_SKIP_VARS for name, _ in assigned(segment))


def assigned(segment: Segment) -> list[tuple[str, str]]:
    """The names and values a command sets: its assignment prefixes, and the
    words after `export`, `env`, `typeset`, `declare`, `readonly` or `local`.

    A word after one of those without `=` gives the value "".
    """
    pairs = [(w.split("=", 1)[0], w.partition("=")[2]) for w in segment.assignments]
    if segment.words[0] in SHELL_EXPORTS:
        pairs += [(w.split("=", 1)[0], w.partition("=")[2]) for w in segment.words[1:]]
    return pairs


def sets_hooks_path_in_env(segment: Segment) -> bool:
    """True when a command sets `core.hooksPath` through git's environment (#421 review).

    git reads `GIT_CONFIG_COUNT` pairs of `GIT_CONFIG_KEY_<n>` and
    `GIT_CONFIG_VALUE_<n>` (https://git-scm.com/docs/git-config,
    "ENVIRONMENT"). git 2.55 also reads `GIT_CONFIG_PARAMETERS`, in which
    `git -c` passes its values to the commands it runs. That variable isn't
    on the git-config page, so this rests on a test with git 2.55. A key of
    `core.hooksPath` in any case, or a `GIT_CONFIG_PARAMETERS` value that
    mentions it, counts.
    """
    for name, value in assigned(segment):
        if re.fullmatch(r"GIT_CONFIG_KEY_\d+", name) and value.lower() == HOOKS_PATH_KEY:
            return True
        if name == "GIT_CONFIG_PARAMETERS" and HOOKS_PATH_KEY in value.lower():
            return True
    return False


def sets_hooks_path(words: Sequence[str]) -> bool:
    """True when a git command points `core.hooksPath` somewhere else (#421).

    That is `git -c core.hooksPath=...` and `git --config-env
    core.hooksPath=...` for one command, and `git config` with a value
    after the key (`git config core.hooksPath /dev/null`, `git config set
    core.hooksPath x`), which lasts. git reads the section and key names
    of a config key in any case (https://git-scm.com/docs/git-config,
    "Syntax"). Reading the key (`git config
    core.hooksPath`, `--get`) and `--unset` pass.
    """
    if words[:1] != ["git"]:
        return False
    rest = list(words[1:])
    while rest and rest[0].startswith("-"):
        flag = rest.pop(0)
        value = ""
        if flag in {"-c", "--config-env"} and rest:
            value = rest.pop(0)
        elif flag.startswith("--config-env="):
            value = flag.removeprefix("--config-env=")
        elif flag in {"-C", "--git-dir", "--work-tree", "--namespace"} and rest:
            rest.pop(0)
        if value.split("=", 1)[0].lower() == HOOKS_PATH_KEY:
            return True
    if rest[:1] != ["config"]:
        return False
    keys = [i for i, w in enumerate(rest) if w.lower() == HOOKS_PATH_KEY]
    if not keys:
        return False
    after = rest[keys[0] + 1 :]
    reads = {"--get", "--get-all", "--unset", "--unset-all", "get", "unset"}
    return not reads & set(rest[: keys[0]]) and any(not w.startswith("-") for w in after)


def gh_positional(words: Sequence[str]) -> list[str]:
    """The words of a `gh` command after `gh`, without flags and the value of `-R`/`--repo`."""
    out: list[str] = []
    skip_next = False
    for word in words[1:]:
        if skip_next:
            skip_next = False
        elif word in {"-R", "--repo"}:
            skip_next = True
        elif not word.startswith("-"):
            out.append(word)
    return out


# The short flags of `gh pr merge` and `gh pr close` that take a value
# (https://cli.github.com/manual/gh_pr_merge, https://cli.github.com/manual/gh_pr_close).
GH_PR_SHORT_VALUE = frozenset("bFAtcR")


def deletes_pr_branch(words: Sequence[str]) -> bool:
    """True when `gh pr merge|close` words carry `--delete-branch` or `-d`, also in a group."""
    for word in words:
        if word == "--":
            return False
        if word == "--delete-branch" or (
            word.startswith("--delete-branch=") and not word.endswith("=false")
        ):
            return True
        if re.match(r"^-[A-Za-z]", word):
            for flag in word[1:]:
                if flag == "d":
                    return True
                if flag in GH_PR_SHORT_VALUE:
                    break
    return False


def gh_deletes(words: Sequence[str]) -> bool:
    """True for a `gh` command that deletes something on GitHub.

    That is any `gh <noun> delete` (`gh release delete`, `gh issue delete`,
    `gh label delete`...), a verb such as `delete-asset` or `item-delete`,
    `gh repo deploy-key delete` and `gh repo autolink delete`, a
    `gh api graphql` call whose mutation names a `delete...` field (#421),
    also with flags before `graphql`, `gh pr merge` and `gh pr close` with
    `--delete-branch` or `-d` (#421 review), and a `gh api` call with the
    DELETE method. gh reads flags anywhere after the
    subcommand, and the method as `-X DELETE`, `-XDELETE`, `-X=DELETE`,
    `--method DELETE` or `--method=DELETE`.
    """
    if words[:1] != ["gh"]:
        return False
    positional = gh_positional(words)
    if positional[:1] != ["api"]:
        if len(positional) > 1 and GH_DELETE_VERB.match(positional[1]):
            return True
        if positional[:2] in (["pr", "merge"], ["pr", "close"]):
            return deletes_pr_branch(words)
        return positional[:2] in (["repo", "deploy-key"], ["repo", "autolink"]) and bool(
            positional[2:3] and GH_DELETE_VERB.match(positional[2])
        )
    text = " ".join(words[2:])
    # A flag value before the endpoint (`--method POST graphql`) is also a
    # positional word here, so look for `graphql` anywhere after `api`.
    if "graphql" in positional[1:] and "mutation" in text and GRAPHQL_DELETE.search(text):
        return True
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


OSV_CONFIG = "osv-scanner.toml"
REDIRECT = re.compile(r"^(?:\d|&)?>>?\|?(.*)$")
FILE_WRITERS = frozenset({"tee", "cp", "mv", "rm", "touch", "truncate", "ln", "install"})
IN_PLACE_EDITORS = frozenset({"sed", "perl", "ruby"})
GIT_FILE_WRITERS = frozenset({"checkout", "restore", "rm", "mv"})


def names_osv_config(word: str) -> bool:
    """True when a shell word is a path to `osv-scanner.toml`."""
    return word == OSV_CONFIG or word.endswith("/" + OSV_CONFIG)


def writes_osv_config(words: Sequence[str]) -> bool:
    """True when a simple command writes `osv-scanner.toml`, which only the maintainer edits.

    It matches a redirect into the file, a file command (`tee`, `cp`, `mv`,
    `rm`, ...) or an in-place `sed -i`, `perl -i` or `ruby -i` that names it,
    and `git checkout`, `restore`, `rm` or `mv` of it. Reading the file,
    passing it to `osv-scanner`, and a commit message or issue body that
    mentions it all pass.
    """
    for index, word in enumerate(words):
        match = REDIRECT.match(word)
        if match is None:
            continue
        target = match.group(1) or (words[index + 1] if index + 1 < len(words) else "")
        if names_osv_config(target):
            return True
    if not any(names_osv_config(w) for w in words[1:]):
        return False
    command = Path(words[0]).name
    if command in FILE_WRITERS:
        return True
    if command in IN_PLACE_EDITORS:
        # `-i` alone or in a cluster such as `perl -pi` or `sed -Ei`.
        return any(
            w.startswith("--in-place")
            or (w.startswith("-") and not w.startswith("--") and "i" in w[1:])
            for w in words[1:]
        )
    return command == "git" and any(w in GIT_FILE_WRITERS for w in words[1:])


BRANCH_CLEANUP_SCRIPT = "branch_cleanup.py"
BRANCH_CLEANUP_TASK = "branch-cleanup"
PYTHON = re.compile(r"^python[0-9.]*$")
LAUNCHERS = frozenset({"env", "exec", "nohup", "command", "time", "sudo", "uv", "uvx"})


def runs_branch_cleanup(words: Sequence[str]) -> bool:
    """True when a simple command runs scripts/branch_cleanup.py, which is for humans only.

    That is `mise` with the `branch-cleanup` task in its words, the script
    as the command, or a Python interpreter with the script or the
    `branch_cleanup` module in its words. A launcher before them (`env`,
    `uv run`, `nohup`...) and its options are skipped. A command that only
    names the file, such as `git add`, `ruff check` or `cat`, passes.
    """
    rest = list(words)
    while rest:
        name = Path(rest[0]).name
        if name == "mise":
            return BRANCH_CLEANUP_TASK in rest
        if name == BRANCH_CLEANUP_SCRIPT:
            return True
        if PYTHON.match(name):
            return "branch_cleanup" in rest or any(
                Path(word).name == BRANCH_CLEANUP_SCRIPT for word in rest[1:]
            )
        if name not in LAUNCHERS:
            return False
        rest = rest[1:]
        if name == "uv" and rest[:1] == ["run"]:
            rest = rest[1:]
        while rest and (rest[0].startswith("-") or "=" in rest[0]):
            rest = rest[1:]
    return False


def hooks_skipped(what: str) -> str:
    """The block message for a command that turns git hooks off (#391, #421)."""
    return (
        f"{what} skips the git hooks, and the hooks are checks. Fix what the hook reports "
        "and run `mise run fast`. When the maintainer means to skip a hook, they run the "
        "command in their own terminal."
    )


def check_hooks_and_deletes(segment: Segment) -> str | None:
    """The reason a simple command is rejected by the rules of #391, or None."""
    words = segment.words
    if gh_deletes(words):
        return (
            "Deletes on GitHub (`gh <noun> delete`, `gh pr merge|close --delete-branch`, "
            "`gh api` with the DELETE method or a graphql delete mutation) are for the "
            "maintainer. Report what should go."
        )
    if sets_skip(segment):
        return hooks_skipped("Setting `SKIP` or `PREK_SKIP`")
    if sets_hooks_path(words) or sets_hooks_path_in_env(segment):
        return hooks_skipped("Setting `core.hooksPath`")
    parsed = git_args(words, segment.cwd)
    if parsed and parsed[0] and skips_hooks(parsed[0][0], parsed[0][1:]):
        return hooks_skipped("`--no-verify` (or `git commit -n`)")
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
    if writes_osv_config(words):
        return (
            f"`{OSV_CONFIG}` holds the maintainer's advisory overrides, and agents never "
            "edit it (docs/agents/supply-chain.md). File an issue for the advisory and ask "
            "the maintainer whether to add, extend or remove an entry."
        )
    if runs_branch_cleanup(words):
        return (
            "`mise run branch-cleanup` (scripts/branch_cleanup.py) is for human maintainers "
            "only, also without `--apply`. Report the branches that should go instead."
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
        if push_deletes(rest):
            return (
                "Deleting a branch or tag on the remote (`--delete`, `-d`, `:<branch>`, "
                "`--prune`, `--mirror`) is for the maintainer. Report what should go."
            )
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
            "`sleep` and then `tail`, `cat`, `ls`, `head`, `grep` or `wc` polls a command "
            "that runs in the background. Run the command in the foreground instead, with "
            "a long Bash timeout (600000 ms for `mise run fast`), and read its output when "
            "it ends. A Bash call with run_in_background wakes you when it ends, so it "
            "needs no poll either."
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


# `mise run issue-brief -- <issue>` (scripts/issue_brief.py, #606) prints
# one issue with only its trusted comments, and writes nothing. A reviewer
# may run it with one issue number in digits and nothing else, so no word
# can carry a flag, an expansion or a glob. A `#` in front is left out:
# zsh reads an unquoted `#606` as the start of a comment outside an
# interactive shell, and in one with INTERACTIVE_COMMENTS set
# (https://zsh.sourceforge.io/Doc/Release/Options.html), so the task
# would run without its argument.
ISSUE_BRIEF_ARGUMENT = re.compile(r"[1-9][0-9]*")


def is_issue_brief(words: Sequence[str]) -> bool:
    """True for `mise run issue-brief -- <issue>` and nothing longer or shorter."""
    return (
        len(words) == 5
        and list(words[:4]) == ["mise", "run", "issue-brief", "--"]
        and ISSUE_BRIEF_ARGUMENT.fullmatch(words[4]) is not None
    )


# A short-option cluster of `gh issue view` or `gh pr view`, such as `-c`,
# `-cw` or `-wc=t`, with an optional `=value` after the letters. `-c` is
# `--comments` (https://cli.github.com/manual/gh_issue_view,
# https://cli.github.com/manual/gh_pr_view). Group 1 holds the letters.
SHORT_OPTIONS = re.compile(r"-([A-Za-z]+)(=.*)?", re.DOTALL)

# The `--json` fields that hold comment or review text anyone can write,
# lower case. An issue has `comments`, and a pull request also has
# `reviews` and `latestReviews` (`gh issue view --json`, `gh pr view --json`).
COMMENT_FIELDS = frozenset({"comments", "reviews", "latestreviews"})


def reads_comments(args: Sequence[str]) -> bool:
    """True when `gh issue view` or `gh pr view` arguments print the comments (#606).

    Anyone can comment on a public issue, so a reviewer reads an issue
    through `mise run issue-brief`, which prints only the trusted comments.
    That covers `--comments`, `-c` in a short-option cluster, and a
    `--json` field list with one of COMMENT_FIELDS in it. A `--jq` or
    `--template` reads only the fields `--json` asks for. A word whose
    text the shell decides (an expansion such as a loop's `$f`, a
    substitution or an unquoted glob, marked GLOB by mark_expansions)
    counts as a comment read too, since it can become `--comments`. A
    quoted `[`, such as in `-q '.labels[].name'`, is text and passes.
    """
    for i, arg in enumerate(args):
        if UNKNOWN_WORD & set(arg):
            return True
        if arg == "--comments" or arg.startswith("--comments="):
            return True
        short = SHORT_OPTIONS.fullmatch(arg)
        if short and "c" in short.group(1):
            return True
        fields = None
        if arg == "--json" and i + 1 < len(args):
            fields = args[i + 1]
        elif arg.startswith("--json="):
            fields = arg.removeprefix("--json=")
        if fields is not None and COMMENT_FIELDS & {f.strip().lower() for f in fields.split(",")}:
            return True
    return False


def is_comment_read(words: Sequence[str]) -> bool:
    """True for a `gh issue view` or `gh pr view` that prints the comments."""
    return tuple(words[:3]) in {("gh", "issue", "view"), ("gh", "pr", "view")} and reads_comments(
        words[3:]
    )


@dataclass(frozen=True)
class ReviewScope:
    """What one reviewer agent's Bash hook allows besides REVIEW_COMMANDS.

    `agent` names the agent in the block message, `tasks` are the
    `mise run` tasks it may run, and `exact` are whole commands it may run
    word for word.
    """

    agent: str
    tasks: tuple[str, ...]
    exact: frozenset[tuple[str, ...]] = frozenset()


CODE_REVIEW = ReviewScope("code-reviewer", REVIEW_TASKS)

# The security reviewer of #495 may also run the audits the #384 pass
# triages. Each one reads a lockfile or the workflows and queries a remote
# database, and none writes to the tree: `audit` runs zizmor, `site-audit`
# runs `bun audit` and `vuln` runs osv-scanner. A code review has no use
# for them, and they need the network. It may also run the Bash hooks of
# this file, reading an event on stdin, to check a guard bypass by hand.
# The path is relative, so the shell runs the `scripts/agent_hooks.py` of
# its current directory. review_reason allows these commands only in a
# command that never changes directory (DIRECTORY_CHANGERS), so that is
# the event's `cwd`, the checkout the session started in. That copy prints
# a reason and exits, and writes nothing: `guard-bash` only reads git (the
# worktree list and the branch).
SECURITY_REVIEW = ReviewScope(
    "security-reviewer",
    (*REVIEW_TASKS, "audit", "site-audit", "vuln"),
    frozenset(
        ("python3", "scripts/agent_hooks.py", mode)
        for mode in ("guard-bash", "review-bash", "security-bash")
    ),
)

# The commands that change the shell's directory. `chdir` is zsh's other
# name for `cd` (https://zsh.sourceforge.io/Doc/Release/Shell-Builtin-Commands.html).
DIRECTORY_CHANGERS = frozenset({"cd", "chdir", "pushd", "popd"})

# zsh arrays tied to a colon-separated variable (`path` is `PATH`), so a
# loop over one sets that variable (#448,
# https://zsh.sourceforge.io/Doc/Release/Parameters.html, "Parameters Used
# By The Shell").
ZSH_TIED_ARRAYS = frozenset({"path", "fpath", "cdpath", "manpath", "module_path", "mailpath"})

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


def mark_expansions(command: str, globs: bool = False) -> str:
    """The command with the `$` of each shell expansion replaced by `EXPANSION`.

    With `globs`, each unquoted `*`, `?` and `[` without a backslash before
    it becomes `GLOB` too, since zsh expands it into file names.

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
        elif globs and not quote and char in "*?[":
            char = GLOB
        out.append(char)
        i += 1
    return "".join(out)


# Stands for a command or process substitution that `extract_substitutions`
# took out of a review command (#414). The block message shows it as `$(...)`.
SUBSTITUTION = "\x01"
SUBSTITUTION_STARTS = ("$(", "<(", ">(", "=(")


# Stands for an unquoted glob character `*`, `?` or `[`
# (https://zsh.sourceforge.io/Doc/Release/Expansion.html, "Filename
# Generation") when mark_expansions marks globs.
GLOB = "\x02"

# The markers that make a word's text the shell's to decide.
# reads_comments reads them.
UNKNOWN_WORD = frozenset({EXPANSION, SUBSTITUTION, GLOB})
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
            # The shell drops the `\` before `$`, `` ` `` and `\` in a
            # backtick body before it runs the body (#448, POSIX shell
            # 2.6.3, https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html).
            body = re.sub(r"\\([$`\\])", r"\1", body)
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
            if pair == "<<" and text[i : i + 3] != "<<<" and text[i - 1 : i] != "<":
                check_heredoc_quoted(text, i + 2)
            if char == "{" and text[i - 1 : i] != "$" and is_brace_expansion(text, i):
                raise ValueError("a brace expansion")
        out.append(char)
        i += 1
    if stop:
        raise ValueError("an unclosed quote or substitution")
    return "".join(out), i


def check_heredoc_quoted(text: str, i: int) -> None:
    """Raise `ValueError` unless the here-document delimiter after `<<` at `i - 2` is quoted.

    The shell expands `$(...)` in the body of `cat <<EOF`, and reads a `'`
    there as text, so the scanner can't follow it. A reviewer doesn't need
    one, and `<<'EOF'`, `<<"EOF"` and `<<\\EOF` keep the body as data (#448).
    """
    j = i + 1 if text[i : i + 1] == "-" else i
    while text[j : j + 1] in {" ", "\t"}:
        j += 1
    if text[j : j + 1] not in {"'", '"', "\\"}:
        raise ValueError("an unquoted here-document (quote its delimiter, as in <<'EOF')")


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
    """True when the `{` at `i` opens a brace expansion such as `{a,b}` or `{1..3}`.

    An escaped character and quoted text are part of the word, so
    `{-o,\\ out.txt}` and `{-o,' out.txt'}` count (#448).
    """
    j = i + 1
    while j < len(text) and text[j] not in BRACE_WORD_END:
        if text[j] == "\\":
            j += 2
        elif text[j] in "'\"":
            j = quoted_text_end(text, j)
        else:
            j += 1
    body = text[i + 1 : j]
    return text[j : j + 1] == "}" and ("," in body or ".." in body)


def quoted_text_end(text: str, j: int) -> int:
    """The index after the quoted text that starts at `j`, or the end of the text."""
    quote = text[j]
    k = j + 1
    while k < len(text) and text[k] != quote:
        k += 2 if quote == '"' and text[k] == "\\" else 1
    return min(k + 1, len(text))


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


def review_allows(words: Sequence[str], scope: ReviewScope = CODE_REVIEW) -> bool:
    """True when a simple command is one the reviewer of `scope` may run.

    An assignment prefix (`GIT_EXTERNAL_DIFF=sh git diff`) or an
    assignment on its own (`PATH=.; ls`) is never one (#415).
    """
    if words[0] in {"cd", "done"} or tuple(words) in scope.exact:
        return True
    if words[0] == "for":
        # The loop header. The body segments are checked one by one, and
        # review_reason checks a substitution in the word list (#414).
        # A loop variable is an assignment, so an upper-case name (`PATH`,
        # `GIT_DIR`) or a zsh array tied to one (`path`) is rejected (#448).
        return (
            len(words) >= 2
            and words[1].isidentifier()
            and not words[1].isupper()
            and words[1] not in ZSH_TIED_ARRAYS
            and words[2:3] in ([], ["in"])
        )
    if words[0] == "sed":
        return sed_prints_only(words[1:])
    if words[0] == "sort" and sort_writes(words[1:]):
        return False
    if words[0] == "uniq" and uniq_writes(words[1:]):
        return False
    if words[:2] == ["mise", "run"]:
        return (len(words) == 3 and words[2] in scope.tasks) or is_issue_brief(words)
    if is_comment_read(words):
        return False
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


def review_segments(command: str, globs: bool = False) -> list[Segment]:
    """The simple commands in a command's text, as the review checks read them.

    With `globs`, an unquoted glob character in a word is `GLOB`
    (mark_expansions).
    """
    # The splitter reads the `&` of `2>&1` as an operator, so drop the
    # redirects writes_a_file allows before splitting.
    harmless = re.sub(r"(\d*|&)>>?(&(\d+|-)|\s*/dev/null)", " ", command)
    return split_segments(mark_expansions(harmless, globs), ".", strict=True, keep_assignments=True)


def changes_directory(command: str) -> bool:
    """True when a command, or a substitution in it, runs one of DIRECTORY_CHANGERS."""
    outer, inner = extract_substitutions(command)
    segments = review_segments(outer)
    if any(segment.words[:1] and segment.words[0] in DIRECTORY_CHANGERS for segment in segments):
        return True
    return any(changes_directory(body) for body in inner)


def review_reason(command: str, scope: ReviewScope = CODE_REVIEW) -> str | None:
    """The reason the reviewer of `scope` may not run a command, or None when it may.

    Each command or process substitution in it is checked as a command of
    its own (#414). The exact commands of `scope` run a script by a
    relative path, so they count only in a command that never changes
    directory, substitutions included (#495).
    """
    if scope.exact and changes_directory(command):
        for segment in review_segments(extract_substitutions(command)[0]):
            if tuple(segment.words) in scope.exact:
                return (
                    f"`{' '.join(segment.words)}` runs the script of the current directory, "
                    "so it runs only in a command without cd, chdir, pushd or popd. Run it "
                    "in a Bash call of its own, from the directory the session started in."
                )
        scope = replace(scope, exact=frozenset())
    if writes_a_file(command):
        return (
            "the command redirects output to a file. A reviewer never writes files. "
            "Read the output instead, or send it to /dev/null."
        )
    outer, inner = extract_substitutions(command)
    for body in inner:
        reason = review_reason(body, scope)
        if reason:
            return reason
    # A separate pass with the globs marked, so the other checks read the
    # words as before.
    for segment in review_segments(outer, globs=True):
        if is_comment_read(segment.words):
            return (
                f"`{' '.join(segment.words[:3])}` with `--comments`, `-c`, a `--json` "
                "comments or reviews field, or a word the shell decides (a `$`, a "
                "substitution, an unquoted `*`, `?` or `[`) can print every comment by "
                "anyone. Read an issue through `mise run issue-brief -- <issue>`, or the "
                "brief in your prompt, which hold only the trusted comments (#606)."
            )
    for segment in review_segments(outer):
        if segment.role is not None or not review_allows(segment.words, scope):
            allowed = ", ".join(" ".join(c) for c in (*REVIEW_COMMANDS, *sorted(scope.exact)))
            task_list = ", ".join(scope.tasks)
            shown = " ".join(segment.words).replace(EXPANSION, "$")
            shown = shown.replace(SUBSTITUTION, "$(...)")
            return (
                f"`{shown}` is not a review command. A reviewer runs only {allowed}, "
                "sed -n with p scripts, for loops over these, cd, mise run with one "
                f"of {task_list}, and mise run issue-brief -- <issue>. A reviewer never edits."
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


def review_bash(event: Mapping[str, Any], scope: ReviewScope = CODE_REVIEW) -> tuple[int, str]:
    """Exit code and message for a reviewer's PreToolUse event on Bash.

    `scope` says which reviewer it is. A command the checks can't read,
    such as one with an unclosed quote or a zsh glob qualifier, is blocked
    too: only exit 2 blocks the call.
    """
    tool_input: Mapping[str, Any] = event.get("tool_input") or {}
    command = tool_input.get("command")
    if not isinstance(command, str):
        return 0, ""
    try:
        reason = review_reason(command, scope)
    except RecursionError:
        reason = unreadable("substitutions nested too deep")
    except ValueError as error:
        reason = unreadable(str(error))
    except UnknownHomeError as error:
        reason = unknown_home(error)
    if reason:
        return 2, f"Blocked by the {scope.agent} hook: {reason}"
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
    import run_name  # here and not at the top, so guard-bash never depends on it

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
    gh: Callable[[Sequence[str]], object] | None = None,
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
    # Imported here and not at the top: a broken run_name.py must never stop
    # guard-bash and review-bash, which import this module too (#373).
    import run_name

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
    modes = {"guard-bash", "review-bash", "security-bash", "format", "session-title"}
    if len(argv) != 2 or argv[1] not in modes:
        print(
            "usage: agent_hooks.py guard-bash|review-bash|security-bash|format|session-title"
            " < event.json",
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
    elif argv[1] == "security-bash":
        code, message = review_bash(event, SECURITY_REVIEW)
    else:
        code, message = guard_bash(event, env)
    if message:
        print(message, file=sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv, sys.stdin.read(), os.environ))
