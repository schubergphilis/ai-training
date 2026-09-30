"""Shared helpers for the tests-and-docs-that-hold fixtures.

The program is `shop/`, a small pricing module with tests a coding agent
wrote. The fixtures never change it there. Each one copies `shop/` to a
temporary place, the same copy the lesson tells the learner to make, and
edits the copy: a break on purpose, a rewritten test, or the agent's change
to the free-shipping threshold. `replace` stops with an error when a file no
longer holds the text the lesson edits, so a change to `shop/` that the
lesson doesn't follow fails the build.

Everything the fixtures need is in this directory, so no other lesson's
fixture can change their output.
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHOP = os.path.join(HERE, "shop")

# The break the lesson makes on purpose: a wrong shipping price.
PRICE = "SHIPPING = 4.95\n"
WRONG_PRICE = "SHIPPING = 5.95\n"

# The test that passed through the break, and the rewrite that pins the price.
MIRROR_TEST = "    assert shipping(10.00) == SHIPPING, shipping(10.00)\n"
PINNED_TEST = "    assert shipping(10.00) == 4.95, shipping(10.00)\n"

# External commands run with only these variables, so nothing in the
# learner's environment (a GIT_DIR pointing elsewhere, GIT_TEMPLATE_DIR,
# GIT_EXTERNAL_DIFF, GIT_CONFIG_PARAMETERS, GREP_OPTIONS) can reach them.
# HOME is set per copy, in `run_command` below, so no user config is read
# either. The `_common.py` of self-checking-loops sets the same keys.
ENV_BASE = {
    "PATH": os.environ.get("PATH", ""),
    "LANG": "C",
    "LC_ALL": "C",
    "GIT_AUTHOR_NAME": "Learner",
    "GIT_AUTHOR_EMAIL": "learner@example.com",
    "GIT_COMMITTER_NAME": "Learner",
    "GIT_COMMITTER_EMAIL": "learner@example.com",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
}


def make_copy(tmpdir: str) -> str:
    """Copy `shop/` into `tmpdir` and return the copy's path."""
    copy = os.path.join(tmpdir, "shop")
    # shop/.gitignore is copied, so that __pycache__ stays out of `git add -A`
    # in the copy, as it does in the learner's `cp -R`.
    shutil.copytree(SHOP, copy, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
    return copy


def replace(path: str, old: str, new: str) -> None:
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    if old not in source:
        raise SystemExit(f"{os.path.basename(path)} no longer holds the text the lesson edits")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(source.replace(old, new))


def run_tests(copy: str) -> "tuple[int, str]":
    """Run `python3 test_pricing.py` in the copy and return (status, output)."""
    result = subprocess.run(
        [sys.executable, "-B", "test_pricing.py"],
        cwd=copy,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.stderr:
        raise SystemExit(f"the tests wrote to stderr:\n{result.stderr}")
    return result.returncode, result.stdout


def print_tests(copy: str) -> None:
    """Print what the learner sees: the command, its output and its exit status."""
    status, output = run_tests(copy)
    print("$ python3 test_pricing.py")
    print(output, end="")
    print(f"exit status {status}")


def run_command(copy: str, *args: str, allowed: "tuple[int, ...]" = (0,)) -> str:
    """Run one command in the copy, with a fixed identity and no user config."""
    result = subprocess.run(
        list(args),
        cwd=copy,
        env=dict(ENV_BASE, HOME=os.path.dirname(copy)),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode not in allowed:
        raise SystemExit(f"{' '.join(args)} failed:\n{result.stdout}{result.stderr}")
    return result.stdout


def git(copy: str, *args: str) -> str:
    # maintenance.auto=false: a commit starts no detached `git maintenance`
    # run, which could still hold a lock when the temporary directory is removed.
    return run_command(
        copy, "git", "-c", "commit.gpgsign=false", "-c", "maintenance.auto=false", *args
    )
