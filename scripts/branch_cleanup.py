#!/usr/bin/env python3
"""Delete merged branches on GitHub and locally (`mise run branch-cleanup`).

For human maintainers only. No agent runs this script: it exits when
`CLAUDECODE` is set, and the `guard-bash` hook in scripts/agent_hooks.py
rejects a command that names it.

The script fetches `origin` with `--prune` and lists the remote branches
that are fully merged into `main` and whose tip commit is older than the
window (14 days, or `--days N`). A branch is fully merged when every commit
on it has a commit with the same patch in `origin/main` (`git cherry`). A
branch whose tip is an ancestor of `main` counts, and so does a branch that
was merged with a rebase. A squash-merged branch doesn't count. The script
skips `main` and every branch that is the head or the base of an open pull
request.

Without `--apply` it only prints the branches it would delete. With
`--apply` it deletes each one in turn:

1. On GitHub, with `gh api -X DELETE`, after it checks with `gh` that the
   branch still points at the commit it listed.
2. The remote-tracking branch `origin/<name>`.
3. The local branch `<name>`, when there is one, it isn't checked out in a
   worktree, and its commits are in `main` too. Otherwise the local branch
   stays and the listing says why.

It stops at the first `gh` or `git` error.

Exit codes: 0 on success, 1 when `gh` or `git` fails or an agent runs the
script, and 2 for a usage error.
"""

import argparse
import os
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from urllib.parse import quote

REPO = "schubergphilis/ai-training"
REMOTE = "origin"
MAIN = "main"
DEFAULT_DAYS = 14
ORIGIN_URLS = frozenset(
    {
        f"https://github.com/{REPO}",
        f"git@github.com:{REPO}",
        f"ssh://git@github.com/{REPO}",
    }
)
"""The URLs of `origin`, without `.git`, that point at REPO."""
REF_FORMAT = "--format=%(refname)%00%(objectname)%00%(committerdate:iso-strict)"
AGENT_VAR = "CLAUDECODE"
"""Claude Code sets this in the environment of every command it runs."""

type Run = Callable[[Sequence[str]], str]
"""Runs a command and returns its stdout. Raises CleanupError when it fails."""


class CleanupError(Exception):
    """A `gh` or `git` command failed, or GitHub disagrees with the listing."""


@dataclass(frozen=True)
class Ref:
    """A branch as `git for-each-ref` prints it."""

    name: str
    sha: str
    committed: datetime


@dataclass(frozen=True)
class Candidate:
    """A remote branch to delete, and what happens to the local branch of the same name."""

    remote: Ref
    delete_local: bool
    local_note: str


def run_command(argv: Sequence[str]) -> str:
    """Run a command and return its stdout. Raises CleanupError when it fails."""
    try:
        done = subprocess.run(
            list(argv),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=True,
            text=True,
        )
    except OSError as e:
        raise CleanupError(f"branch-cleanup: {' '.join(argv)} failed: {e}") from e
    except subprocess.CalledProcessError as e:
        stderr = str(e.stderr).strip()
        raise CleanupError(
            f"branch-cleanup: {' '.join(argv)} failed with exit code {e.returncode}: {stderr}"
        ) from e
    return done.stdout


def parse_refs(output: str, prefix: str) -> list[Ref]:
    """The refs in `git for-each-ref` output, in the format of REF_FORMAT.

    `prefix` is stripped from each ref name, and refs outside it are left out.
    """
    refs: list[Ref] = []
    for line in output.splitlines():
        if not line:
            continue
        refname, sha, date = line.split("\0")
        if not refname.startswith(prefix):
            continue
        refs.append(Ref(refname.removeprefix(prefix), sha, datetime.fromisoformat(date)))
    return refs


def cherry_merged(output: str) -> bool:
    """True when `git cherry <main> <branch>` found every commit of the branch in main.

    git cherry prints `- <sha>` for a commit with an equivalent patch in
    main and `+ <sha>` for one without. An ancestor of main prints nothing.
    """
    return all(not line.startswith("+") for line in output.splitlines())


def worktree_branches(output: str) -> set[str]:
    """The local branches checked out in a worktree, from `git worktree list --porcelain`."""
    prefix = "branch refs/heads/"
    return {line.removeprefix(prefix) for line in output.splitlines() if line.startswith(prefix)}


def open_pr_branches(output: str) -> set[str]:
    """The head and base branches of the open pull requests, one per line of `gh --jq` output."""
    return {line for line in output.splitlines() if line}


def local_plan(
    remote: Ref,
    local: Ref | None,
    checked_out: set[str],
    git: Run,
) -> tuple[bool, str]:
    """Whether to delete the local branch named like `remote`, and a note for the listing."""
    if local is None:
        return False, "no local branch"
    if local.name in checked_out:
        return False, "local branch kept: checked out in a worktree"
    if local.sha == remote.sha:
        return True, "local branch deleted too"
    if cherry_merged(git(["git", "cherry", f"{REMOTE}/{MAIN}", f"refs/heads/{local.name}"])):
        return True, "local branch deleted too (merged, different tip)"
    return False, "local branch kept: it has commits that are not in main"


def plan(
    remotes: Sequence[Ref],
    locals_by_name: Mapping[str, Ref],
    protected: set[str],
    checked_out: set[str],
    cutoff: datetime,
    git: Run,
) -> list[Candidate]:
    """The remote branches to delete, oldest first."""
    candidates: list[Candidate] = []
    for remote in sorted(remotes, key=lambda ref: (ref.committed, ref.name)):
        if remote.name in {MAIN, "HEAD"} or remote.name in protected:
            continue
        if remote.committed >= cutoff:
            continue
        if not cherry_merged(git(["git", "cherry", f"{REMOTE}/{MAIN}", f"{REMOTE}/{remote.name}"])):
            continue
        delete_local, note = local_plan(remote, locals_by_name.get(remote.name), checked_out, git)
        candidates.append(Candidate(remote, delete_local, note))
    return candidates


def check_origin(git: Run) -> None:
    """Raise CleanupError unless `origin` is the GitHub repository the deletes go to."""
    url = git(["git", "remote", "get-url", REMOTE]).strip()
    if url.removesuffix(".git") not in ORIGIN_URLS:
        raise CleanupError(f"branch-cleanup: {REMOTE} is {url}, not {REPO} on GitHub")


def find_candidates(days: int, now: datetime, git: Run, gh: Run) -> list[Candidate]:
    """Fetch, then list the merged remote branches older than `days` days."""
    check_origin(git)
    git(["git", "fetch", "--prune", "--quiet", REMOTE])
    remotes = parse_refs(
        git(["git", "for-each-ref", REF_FORMAT, f"refs/remotes/{REMOTE}/"]),
        f"refs/remotes/{REMOTE}/",
    )
    local_refs = parse_refs(git(["git", "for-each-ref", REF_FORMAT, "refs/heads/"]), "refs/heads/")
    checked_out = worktree_branches(git(["git", "worktree", "list", "--porcelain"]))
    protected = open_pr_branches(
        gh(
            [
                "gh",
                "pr",
                "list",
                "-R",
                REPO,
                "-s",
                "open",
                "-L",
                "1000",
                "--json",
                "headRefName,baseRefName",
                "--jq",
                ".[] | .headRefName, .baseRefName",
            ]
        )
    )
    return plan(
        remotes,
        {ref.name: ref for ref in local_refs},
        protected,
        checked_out,
        now - timedelta(days=days),
        git,
    )


def format_candidates(candidates: Sequence[Candidate], days: int, now: datetime) -> str:
    """The listing: one line per branch with its tip date, age and local note."""
    if not candidates:
        return f"No remote branch is merged into {MAIN} and older than {days} days.\n"
    lines = [f"{len(candidates)} remote branches merged into {MAIN} and older than {days} days:"]
    width = max(len(c.remote.name) for c in candidates)
    for c in candidates:
        age = (now - c.remote.committed).days
        date = c.remote.committed.date().isoformat()
        lines.append(f"  {c.remote.name:<{width}}  {date}  {age:>3}d  {c.local_note}")
    return "\n".join(lines) + "\n"


def delete(candidate: Candidate, git: Run, gh: Run) -> None:
    """Delete one branch on GitHub, its remote-tracking branch and maybe the local branch."""
    name = candidate.remote.name
    ref_path = f"repos/{REPO}/git/refs/heads/{quote(name, safe='/')}"
    sha = gh(["gh", "api", ref_path.replace("/refs/", "/ref/", 1), "--jq", ".object.sha"]).strip()
    if sha != candidate.remote.sha:
        raise CleanupError(
            f"branch-cleanup: {name} is at {sha} on GitHub, not {candidate.remote.sha}. "
            "Someone pushed to it. Stopped; run the script again."
        )
    gh(["gh", "api", "-X", "DELETE", ref_path])
    print(f"deleted {name} on GitHub")
    git(["git", "branch", "--delete", "--remotes", f"{REMOTE}/{name}"])
    if candidate.delete_local:
        git(["git", "branch", "-D", name])
        print(f"deleted local branch {name}")


def parse_args(argv: Sequence[str]) -> tuple[int, bool]:
    """The window in days and whether to apply. argparse exits with code 2 on a usage error."""
    parser = argparse.ArgumentParser(
        prog="mise run branch-cleanup --",
        description=f"List (and with --apply, delete) remote branches merged into {MAIN}.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAYS,
        help=f"only branches whose tip is older than this many days (default {DEFAULT_DAYS})",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="delete the listed branches on GitHub and locally",
    )
    args = parser.parse_args(argv)
    days = cast("int", args.days)
    if days < 0:
        parser.error("--days must be 0 or more")
    return days, cast("bool", args.apply)


def main(
    argv: Sequence[str],
    env: Mapping[str, str],
    git: Run = run_command,
    gh: Run = run_command,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> int:
    """List or delete the merged branches for the command line `argv`; return the exit code."""
    if env.get(AGENT_VAR):
        print(
            f"branch-cleanup is for human maintainers only, and {AGENT_VAR} is set. "
            "An agent reports the branches that should go instead.",
            file=sys.stderr,
        )
        return 1
    days, apply = parse_args(argv)
    at = now()
    try:
        candidates = find_candidates(days, at, git, gh)
        sys.stdout.write(format_candidates(candidates, days, at))
        if not candidates:
            return 0
        if not apply:
            print("Dry run: nothing was deleted. Run again with --apply to delete these.")
            return 0
        for candidate in candidates:
            delete(candidate, git, gh)
    except CleanupError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"Deleted {len(candidates)} branches.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], os.environ))
