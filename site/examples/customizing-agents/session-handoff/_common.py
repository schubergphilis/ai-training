"""Shared helpers for the session-handoff fixtures.

`build` copies `project/` into a directory, turns the copy into a git
repository with one commit on `main`, and then makes the one edit that the
session in `session.md` left behind: the expected value of
`test_export_timezone` changed to the UTC time. The edit is not committed,
so `git status` and `git diff` show it, and the tests pass because of it.
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(HERE, "project")

# The edit the agent made in the session, which the user ruled out.
TEST_FILE = "test_reports.py"
EDIT_BEFORE = 'self.assertEqual(format_ts(created), "2026-03-01T00:00:00+13:00")'
EDIT_AFTER = 'self.assertEqual(format_ts(created), "2026-02-28T11:00:00Z")'

# git runs with only these variables, so nothing in the learner's environment
# (a GIT_DIR pointing elsewhere, GIT_TEMPLATE_DIR, GIT_EXTERNAL_DIFF,
# GIT_CONFIG_PARAMETERS) can reach it. HOME is set per repository in `git`
# below, and the global and system config files are /dev/null, so no user
# config is read either. The fixed dates keep the commit hash the same.
GIT_ENV_BASE = {
    "PATH": os.environ.get("PATH", ""),
    "LANG": "C",
    "LC_ALL": "C",
    "GIT_AUTHOR_NAME": "Learner",
    "GIT_AUTHOR_EMAIL": "learner@example.com",
    "GIT_AUTHOR_DATE": "2026-09-25T09:00:00+00:00",
    "GIT_COMMITTER_NAME": "Learner",
    "GIT_COMMITTER_EMAIL": "learner@example.com",
    "GIT_COMMITTER_DATE": "2026-09-25T09:00:00+00:00",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
}


def git(repo: str, *args: str) -> "subprocess.CompletedProcess[str]":
    """Runs one git command in the repository, with a fixed identity and no user config."""
    result = subprocess.run(
        # maintenance.auto=false: a commit starts no detached `git maintenance`
        # run, which could still hold a lock when the temporary directory is removed.
        ["git", "-c", "commit.gpgsign=false", "-c", "maintenance.auto=false", *args],
        cwd=repo,
        env=dict(GIT_ENV_BASE, HOME=repo),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
    return result


def build(repo: str) -> None:
    """Makes `repo`, which must not exist, the practice repository."""
    shutil.copytree(PROJECT, repo, ignore=shutil.ignore_patterns("__pycache__"))
    with open(os.path.join(repo, ".gitignore"), "w", encoding="utf-8") as handle:
        handle.write("__pycache__/\n")
    git(repo, "init", "-q", "--initial-branch=main")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "feat: CSV export for reports")
    path = os.path.join(repo, TEST_FILE)
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    if EDIT_BEFORE not in source:
        raise SystemExit(f"{TEST_FILE} no longer holds the line the session changed")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(source.replace(EDIT_BEFORE, EDIT_AFTER))


def test_verdict(repo: str) -> str:
    """Runs the suite and returns its last line, OK or FAILED with the count."""
    env = dict(os.environ, PYTHON_COLORS="0", NO_COLOR="1", PYTHONDONTWRITEBYTECODE="1")
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "-q"],
        cwd=repo,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    lines = result.stdout.strip().splitlines()
    return lines[-1] if lines else ""
