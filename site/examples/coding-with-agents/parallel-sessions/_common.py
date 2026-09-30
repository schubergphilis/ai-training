"""Shared helpers for the parallel-sessions fixtures.

Each fixture copies `shop/` to a temporary place, turns the copy into a git
repository with one commit on `main`, and opens the two worktrees the page
names, `../shop-api` and `../shop-docs`, next to it. The edits that the two
agent sessions would make are applied from the strings below, so the output
is what the learner's own sessions would leave at that point in the lesson.
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHOP = os.path.join(HERE, "shop")

API_BRANCH = "api-half-kilo"
DOCS_BRANCH = "docs-usage"

# git runs with only these variables, so nothing in the learner's environment
# (a GIT_DIR pointing elsewhere, GIT_TEMPLATE_DIR, GIT_EXTERNAL_DIFF,
# GIT_CONFIG_PARAMETERS) can reach it. HOME is set per copy in `git` below,
# and the global and system config files are /dev/null, so no user config is
# read either. The fixed dates keep every commit hash the same on each run.
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

# The API session's change: the price per started half kilo.
API_EDITS = {
    "shipping.py": [
        (
            '"""The price of one parcel: 4.00 plus 1.50 per started kilo."""',
            '"""The price of one parcel: 4.00 plus 0.75 per started half kilo."""',
        ),
        (
            "cents = 400 + 150 * math.ceil(weight_kg)",
            "cents = 400 + 75 * math.ceil(weight_kg * 2)",
        ),
    ],
    "test_shipping.py": [
        (
            'self.assertEqual(quote(2.3), "EUR 8.50")\n',
            'self.assertEqual(quote(2.3), "EUR 7.75")\n\n'
            "    def test_started_half_kilo(self) -> None:\n"
            '        self.assertEqual(quote(0.4), "EUR 4.75")\n',
        ),
    ],
}
API_SUBJECT = "feat: price per started half kilo"

# The docs session's change: a usage section with two checked examples,
# written against `main` as it was when the session started.
USAGE = """
## Usage

    >>> quote(1)
    'EUR 5.50'
    >>> quote(2.3)
    'EUR 8.50'

A weight of 0 kg or less raises `ValueError`.
"""
DOCS_SUBJECT = "docs: usage examples for quote"

# What the docs session changes after its rebase, when the check fails.
DOCS_FIX = [("    'EUR 8.50'\n", "    'EUR 7.75'\n")]
DOCS_FIX_SUBJECT = "docs: example for the half-kilo price"


def git(cwd: str, *args: str) -> "subprocess.CompletedProcess[str]":
    """Runs one git command with the fixed identity and no user config."""
    return subprocess.run(
        # maintenance.auto=false: a commit starts no detached `git maintenance`
        # run, which could still hold a lock when the temporary directory is removed.
        ["git", "-c", "commit.gpgsign=false", "-c", "maintenance.auto=false", *args],
        cwd=cwd,
        env=dict(GIT_ENV_BASE, HOME=os.path.dirname(cwd)),
        capture_output=True,
        text=True,
    )


def git_ok(cwd: str, *args: str) -> str:
    """Runs git and stops the fixture with git's own message when it fails."""
    result = git(cwd, *args)
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
    return result.stdout


def make_shop(tmpdir: str) -> str:
    """The learner's copy of the project: one commit on `main`."""
    shop = os.path.join(tmpdir, "shop")
    # copytree copies every file in shop/, tracked or not, so a stray file a
    # learner adds there (another test_*.py, say) changes the counts the page shows.
    shutil.copytree(SHOP, shop, ignore=shutil.ignore_patterns("__pycache__"))
    with open(os.path.join(shop, ".gitignore"), "w", encoding="utf-8") as handle:
        handle.write("__pycache__/\n")
    git_ok(shop, "init", "-q", "--initial-branch=main")
    git_ok(shop, "add", ".")
    git_ok(shop, "commit", "-q", "-m", "chore: the shipping module")
    return shop


def add_worktrees(shop: str) -> "tuple[str, str]":
    """Opens one worktree per session, each on a new branch from `main`."""
    git_ok(shop, "worktree", "add", "-q", "-b", API_BRANCH, "../shop-api")
    git_ok(shop, "worktree", "add", "-q", "-b", DOCS_BRANCH, "../shop-docs")
    parent = os.path.dirname(shop)
    return os.path.join(parent, "shop-api"), os.path.join(parent, "shop-docs")


def replace(tree: str, name: str, edits: "list[tuple[str, str]]") -> None:
    """Applies exact text replacements to one file, and fails if one doesn't match."""
    path = os.path.join(tree, name)
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    for old, new in edits:
        if old not in text:
            raise SystemExit(f"{name}: expected text not found: {old!r}")
        text = text.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def edit_api(tree: str) -> None:
    for name, edits in API_EDITS.items():
        replace(tree, name, edits)


def edit_docs(tree: str) -> None:
    with open(os.path.join(tree, "README.md"), "a", encoding="utf-8") as handle:
        handle.write(USAGE)


def commit_all(tree: str, subject: str) -> None:
    git_ok(tree, "add", ".")
    git_ok(tree, "commit", "-q", "-m", subject)


def run_check(tree: str) -> int:
    """Runs the project's check in one worktree and prints its output."""
    result = subprocess.run(
        [sys.executable, "check.py"],
        cwd=tree,
        env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    sys.stdout.write(result.stdout)
    return result.returncode


def prompt(tree: str, command: str) -> None:
    """Prints a command the way the page shows it, after the worktree's folder name."""
    print(f"{os.path.basename(tree)}$ {command}")
