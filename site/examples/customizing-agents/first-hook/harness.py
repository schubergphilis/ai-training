"""Runs the lockfile hook the way Claude Code would, in a throwaway repository.

For the lesson "Writing a hook that blocks a mistake". `blocked.py` and
`cases.py` import it. Nothing here is part of the hook itself.

`fresh_repo` copies `fixture-repo/` into a temporary directory, renames the
two sample files to `package.json` and `package-lock.json`, and makes the
first commit. `run_hook` sends `lockfile_guard.py` the JSON that Claude Code
sends a PreToolUse hook for a Bash tool call, and returns the exit code and
the stderr text.

Every git command, and the hook with it, runs with an allow-list
environment: PATH, a temporary HOME, LC_ALL=C, a fixed identity and date,
and the global and system config at /dev/null. No setting or hook from the
machine that runs the fixture reaches the repository, so the output is the
same everywhere.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixture-repo"
GUARD = HERE / "lockfile_guard.py"
RENAMES = {
    "package.sample.json": "package.json",
    "package-lock.sample.json": "package-lock.json",
}
FIXED_DATE = "2026-09-25T12:00:00+00:00"


def git_env(home: Path) -> dict[str, str]:
    """The only variables git sees. Nothing else from the caller's environment passes."""
    return {
        "PATH": os.environ.get("PATH", os.defpath),
        "HOME": str(home),
        "LC_ALL": "C",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_AUTHOR_NAME": "Learner",
        "GIT_AUTHOR_EMAIL": "learner@example.com",
        "GIT_AUTHOR_DATE": FIXED_DATE,
        "GIT_COMMITTER_NAME": "Learner",
        "GIT_COMMITTER_EMAIL": "learner@example.com",
        "GIT_COMMITTER_DATE": FIXED_DATE,
    }


class Repo:
    """A copy of the fixture repository with its own git history."""

    def __init__(self, path: Path, home: Path) -> None:
        self.path = path
        self.env = git_env(home)

    def write(self, name: str, text: str) -> None:
        """Create or overwrite one file, making its directory if needed."""
        path = self.path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def git(self, *args: str) -> None:
        result = subprocess.run(
            # maintenance.auto=false: a commit starts no detached `git maintenance`
            # run, which could still hold a lock when the temporary directory is removed.
            ["git", "-c", "maintenance.auto=false", *args],
            cwd=self.path,
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")

    def set_version(self, name: str, old: str, new: str) -> None:
        """Replace every `"version": old` in one file, as a hand edit would."""
        path = self.path / name
        text = path.read_text(encoding="utf-8")
        path.write_text(
            text.replace(f'"version": "{old}"', f'"version": "{new}"'),
            encoding="utf-8",
        )


def fresh_repo(root: Path) -> Repo:
    """The fixture, renamed and committed once, under `root`."""
    home = root / "home"
    home.mkdir()
    path = root / "shelf-notes"
    shutil.copytree(FIXTURE, path)
    for sample, real in RENAMES.items():
        (path / sample).rename(path / real)
    repo = Repo(path, home)
    repo.git("init", "-q", "--initial-branch=main")
    repo.git("add", "-A")
    repo.git("commit", "-q", "-m", "fixture")
    return repo


def run_hook(repo: Repo, command: str, subdir: str = "") -> "tuple[int, str]":
    """Run the hook on one Bash command, with `cwd` at the root or in `subdir`.

    Returns the exit code and stderr.
    """
    call = {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
        "cwd": str(repo.path / subdir),
    }
    return run_hook_raw(repo, json.dumps(call))


def run_hook_raw(repo: Repo, stdin: str) -> "tuple[int, str]":
    """Run the hook on any text as its input. Returns the exit code and stderr."""
    result = subprocess.run(
        [sys.executable, str(GUARD)],
        input=stdin,
        cwd=repo.path,
        env=repo.env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, result.stderr
