#!/usr/bin/env python3
"""The directory every agent worktree goes in (`mise run worktree-root`, #698).

Usage: mise run worktree-root

Prints the worktree root as an absolute path:

- `/tmp/ai-training-wt` inside claude-docker, which an agent knows from the
  environment variable `CLAUDE_DOCKER_FLAGS`, set even when it is empty.
  The main checkout's parent, `/workspaces`, is read-only there.
- `<parent of the main checkout>/ai-training-wt` everywhere else. The main
  checkout is the parent of `git rev-parse --path-format=absolute
  --git-common-dir`, so the answer is the same in the main checkout and in
  every linked worktree.

`scripts/agent_hooks.py` names the same path in its messages.

Exit codes: 0 with the path on stdout, 1 when git can't tell where the
main checkout is, with one line on stderr.
"""

import os
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path

DOCKER_MARKER = "CLAUDE_DOCKER_FLAGS"
DOCKER_ROOT = Path("/tmp/ai-training-wt")
DIR_NAME = "ai-training-wt"


class WorktreeRootError(RuntimeError):
    """git can't tell where the main checkout is."""


def main_checkout(cwd: str) -> Path:
    """The main checkout of the repository that `cwd` is in."""
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise WorktreeRootError(f"git can't find the repository at {cwd}: {error}") from error
    if not out:
        raise WorktreeRootError(f"git printed no common directory for {cwd}")
    return Path(out).parent


def worktree_root(cwd: str, env: Mapping[str, str]) -> Path:
    """The absolute directory that agent worktrees go in, seen from `cwd`."""
    if DOCKER_MARKER in env:
        return DOCKER_ROOT
    return main_checkout(cwd).parent / DIR_NAME


def main(cwd: str, env: Mapping[str, str]) -> int:
    try:
        print(worktree_root(cwd, env))
    except WorktreeRootError as error:
        print(f"worktree-root: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(str(Path.cwd()), os.environ))
