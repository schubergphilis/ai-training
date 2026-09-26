"""Shared helpers for the self-checking-loops fixtures.

The program is the nightly import from the observing-and-debugging lesson,
one directory over, and the fixtures never change it there. Each fixture
copies its `nightly/` directory to a temporary place, adds this lesson's
`test_nights.py` next to `importer.py`, and works on the copy. That is the
same copy the lesson tells the learner to make.

The two agent runs the lesson shows are text edits on the copy: the fix that
reads each export with the `csv` module, and a run without limits that skips
the bad rows and then removes the check that caught it. The fix is the one
the observing-and-debugging lesson briefs for. Its two text edits are read
from that lesson's `after_fix.py`, so a change there reaches this lesson too.
The added `import csv` line is written out here as well, and `replace` stops
with an error if the importer no longer holds the text it edits.
"""

import ast
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SIBLING = os.path.join(os.path.dirname(HERE), "observing-and-debugging")
NIGHTLY = os.path.join(SIBLING, "nightly")
TEST = os.path.join(HERE, "test_nights.py")

# git runs with only these variables, so nothing in the learner's environment
# (a GIT_DIR pointing elsewhere, GIT_TEMPLATE_DIR, GIT_EXTERNAL_DIFF,
# GIT_CONFIG_PARAMETERS) can reach it. HOME is set per copy, in `git` below,
# so no user config is read either. The `_common.py` of reversible-changes,
# reviewing-the-diff and project-instructions set the same keys.
GIT_ENV_BASE = {
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
    """Copy `nightly/` into `tmpdir`, add the test, and return the copy's path."""
    copy = os.path.join(tmpdir, "nightly")
    shutil.copytree(NIGHTLY, copy, ignore=shutil.ignore_patterns(".*", "__pycache__"))
    shutil.copy(TEST, os.path.join(copy, "test_nights.py"))
    return copy


def run_test(copy: str) -> "tuple[int, str]":
    """Run `python3 test_nights.py` in the copy and return (status, output)."""
    result = subprocess.run(
        [sys.executable, "test_nights.py"],
        cwd=copy,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.stderr:
        raise SystemExit(f"the test wrote to stderr:\n{result.stderr}")
    return result.returncode, result.stdout


def git(copy: str, *args: str) -> str:
    """Run one git command in the copy, with a fixed identity and no user config.

    `maintenance.auto=false` stops a commit from starting
    `git maintenance run --auto` after its own work
    (https://git-scm.com/docs/git-config, "maintenance.auto"). That run
    detaches by default ("maintenance.autoDetach") and takes a lock in the
    object database (https://git-scm.com/docs/git-maintenance). It can
    still hold that lock when the fixture removes its temporary directory,
    and the cleanup then fails with "Directory not empty: 'objects'" (#472).
    """
    result = subprocess.run(
        ["git", "-c", "commit.gpgsign=false", "-c", "maintenance.auto=false", *args],
        cwd=copy,
        env=dict(GIT_ENV_BASE, HOME=os.path.dirname(copy)),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
    return result.stdout


def start_repository(copy: str) -> None:
    """Make the copy a git repository with one tagged commit, as the learner does before the run."""
    git(copy, "init", "--quiet", "--initial-branch=main")
    git(copy, "add", ".")
    git(copy, "commit", "--quiet", "-m", "Before the agent's run")
    git(copy, "tag", "before-run")


def replace(path: str, old: str, new: str) -> None:
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    if old not in source:
        raise SystemExit(f"{os.path.basename(path)} no longer holds the text the lesson edits")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(source.replace(old, new))


def sibling_fix() -> "dict[str, str]":
    """Read the fix's text constants from the sibling's `after_fix.py`, without running it."""
    names = {"BUGGY_READ_ROWS", "FIXED_READ_ROWS", "BUGGY_TOTAL", "FIXED_TOTAL"}
    with open(os.path.join(SIBLING, "after_fix.py"), encoding="utf-8") as handle:
        tree = ast.parse(handle.read())
    found: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name) and target.id in names:
                found[target.id] = ast.literal_eval(node.value)
    missing = names - set(found)
    if missing:
        raise SystemExit(f"observing-and-debugging/after_fix.py lacks {sorted(missing)}")
    return found


def apply_fix(copy: str) -> None:
    """The bounded run's change: the sibling lesson's fix, with the csv module."""
    fix = sibling_fix()
    importer = os.path.join(copy, "importer.py")
    replace(importer, fix["BUGGY_READ_ROWS"], fix["FIXED_READ_ROWS"])
    replace(importer, fix["BUGGY_TOTAL"], fix["FIXED_TOTAL"])
    replace(importer, "import json\n", "import csv\nimport json\n")


def apply_unbounded_run(copy: str) -> None:
    """The run without limits: skip the bad rows, then drop the row check."""
    replace(
        os.path.join(copy, "importer.py"),
        """        log("ERROR", f"{bad} row(s) with the wrong number of fields, batch rejected")
        return 1
""",
        """        log("WARNING", f"{bad} row(s) with the wrong number of fields, skipped")
""",
    )
    replace(
        os.path.join(copy, "test_nights.py"),
        """    expected = data_rows(paths)
    parsed = f"INFO parsed {expected} rows"
    if parsed not in result.stdout.splitlines():
        found = [line for line in result.stdout.splitlines() if "parsed" in line]
        seen = found[0].split("parsed ", 1)[1] if found else "no rows"
        problems.append(f"parsed {seen}, expected {expected} rows")
""",
        "",
    )
