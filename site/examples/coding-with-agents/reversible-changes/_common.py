"""Shared helpers for the reversible-changes fixtures.

The fixtures start from the spec-driven-increments fixture repository and its
spec, one directory over, and never change them. Each fixture copies that
directory to a temporary place, turns the copy into a git repository, lands
the three increments of `SPEC.md` as one commit each on a branch, and then
works on the commits. The copy is what the learner's session would have
produced at that point in the lesson.
"""

import os
import shutil
import subprocess
import sys
from importlib.machinery import SourceFileLoader
from types import ModuleType
from typing import Callable

HERE = os.path.dirname(os.path.abspath(__file__))
SIBLING = os.path.join(os.path.dirname(HERE), "spec-driven-increments")
REPO = os.path.join(SIBLING, "fixture-repo")
SPEC = os.path.join(SIBLING, "SPEC.md")
DUE_TEST = os.path.join(SIBLING, "test_due.py")
OVERDUE_TEST = os.path.join(HERE, "test_overdue.py")
BAD_DATE_TEST = os.path.join(HERE, "test_bad_date.py")


def _load_sibling_common() -> ModuleType:
    """Loads the sibling's `_common.py` under another name, since this module is `_common` too."""
    loader = SourceFileLoader("spec_driven_common", os.path.join(SIBLING, "_common.py"))
    module = ModuleType(loader.name)
    module.__file__ = loader.path
    loader.exec_module(module)
    return module


# The first increment's text edits, the repo copy and the todo.py runner are the
# sibling lesson's, so they are imported from there rather than kept in step.
_spec_driven = _load_sibling_common()
copy_repo = _spec_driven.copy_repo
run_todo = _spec_driven.run_todo
in_copy = _spec_driven.in_copy
_replace = _spec_driven._replace

# git runs with only these variables, so nothing in the learner's environment
# (a GIT_DIR pointing elsewhere, GIT_TEMPLATE_DIR, GIT_EXTERNAL_DIFF,
# GIT_CONFIG_PARAMETERS) can reach it. HOME is set per copy, in `git` below,
# so no user config is read either. The same list is in the `_common.py` of
# reversible-changes, reviewing-the-diff and project-instructions: keep the
# three in step.
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

# Increment 2: `overdue`, with today from TODO_TODAY or the clock.

OVERDUE_FUNCTION_BEFORE = """def clear(items):
"""

OVERDUE_FUNCTION_AFTER = """def overdue(items):
    import datetime
    import os

    today = os.environ.get("TODO_TODAY") or datetime.date.today().isoformat()
    lines = []
    for number, item in enumerate(items, start=1):
        if not item["done"] and item.get("due") and item["due"] < today:
            lines.append(f"{number}. [ ] {item['text']} (due {item['due']})")
    return "\\n".join(lines) if lines else "nothing overdue"


def clear(items):
"""

OVERDUE_DISPATCH_BEFORE = """    elif command == "list":
        message = render.list_items(items)
"""

OVERDUE_DISPATCH_AFTER = """    elif command == "list":
        message = render.list_items(items)
    elif command == "overdue":
        message = overdue(items)
"""

# Increment 3: refuse a malformed date and change nothing.

BAD_DATE_FUNCTION_BEFORE = """def due(items, number, date):
    index = number - 1
"""

BAD_DATE_FUNCTION_AFTER = """def valid_date(text):
    import datetime

    try:
        datetime.date.fromisoformat(text)
    except ValueError:
        return False
    return True


def due(items, number, date):
    index = number - 1
"""

BAD_DATE_DISPATCH_BEFORE = """    elif command == "due" and len(argv) == 4 and argv[2].isdigit():
        message = due(items, int(argv[2]), argv[3])
"""

BAD_DATE_DISPATCH_AFTER = """    elif command == "due" and len(argv) == 4 and argv[2].isdigit():
        if not valid_date(argv[3]):
            print(f"bad date: {argv[3]}")
            return 2
        message = due(items, int(argv[2]), argv[3])
"""


def git(repo: str, *args: str) -> "subprocess.CompletedProcess[str]":
    """Runs one git command in the copy, with a fixed identity and no user config."""
    result = subprocess.run(
        # maintenance.auto=false: a commit starts no detached `git maintenance`
        # run, which could still hold a lock when the temporary directory is removed.
        ["git", "-c", "commit.gpgsign=false", "-c", "maintenance.auto=false", *args],
        cwd=repo,
        env=dict(GIT_ENV_BASE, HOME=os.path.dirname(repo)),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
    return result


def init_repo(repo: str) -> None:
    """The fixture as the learner receives it: one commit on main, and a branch."""
    git(repo, "init", "-q", "--initial-branch=main")
    with open(os.path.join(repo, ".gitignore"), "w", encoding="utf-8") as handle:
        handle.write("__pycache__/\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "chore: the to-do program before due dates")
    shutil.copyfile(SPEC, os.path.join(repo, "SPEC.md"))
    git(repo, "add", "SPEC.md")
    git(repo, "commit", "-q", "-m", "docs: spec for due dates")
    git(repo, "switch", "-q", "-c", "due-dates")


def land_increment_1(repo: str) -> None:
    _replace(
        repo,
        "todo.py",
        [
            (_spec_driven.TODO_USAGE_BEFORE, _spec_driven.TODO_USAGE_AFTER),
            (_spec_driven.TODO_DONE_BEFORE, _spec_driven.TODO_DONE_AFTER),
            (_spec_driven.TODO_DISPATCH_BEFORE, _spec_driven.TODO_DISPATCH_AFTER),
        ],
    )
    _replace(repo, "render.py", [(_spec_driven.RENDER_BEFORE, _spec_driven.RENDER_AFTER)])
    shutil.copyfile(DUE_TEST, os.path.join(repo, "test_due.py"))


def land_increment_2(repo: str) -> None:
    _replace(
        repo,
        "todo.py",
        [
            (OVERDUE_FUNCTION_BEFORE, OVERDUE_FUNCTION_AFTER),
            (OVERDUE_DISPATCH_BEFORE, OVERDUE_DISPATCH_AFTER),
        ],
    )
    shutil.copyfile(OVERDUE_TEST, os.path.join(repo, "test_overdue.py"))


def land_increment_3(repo: str) -> None:
    _replace(
        repo,
        "todo.py",
        [
            (BAD_DATE_FUNCTION_BEFORE, BAD_DATE_FUNCTION_AFTER),
            (BAD_DATE_DISPATCH_BEFORE, BAD_DATE_DISPATCH_AFTER),
        ],
    )
    shutil.copyfile(BAD_DATE_TEST, os.path.join(repo, "test_bad_date.py"))


# Each increment with its commit subject, in the order the branch lands them.
INCREMENTS: "list[tuple[Callable[[str], None], str]]" = [
    (land_increment_1, "feat: due command and the date in list"),
    (land_increment_2, "feat: overdue command with TODO_TODAY"),
    (land_increment_3, "feat: refuse a malformed date"),
]


def commit_each_increment(repo: str) -> None:
    """Lands the three increments as one commit each on the branch."""
    for land, subject in INCREMENTS:
        land(repo)
        git(repo, "add", ".")
        git(repo, "commit", "-q", "-m", subject)


def revert_middle_increment(repo: str) -> None:
    """Reverts the second commit of the branch, the `overdue` command."""
    git(repo, "revert", "--no-edit", "HEAD~1")


def print_log(repo: str) -> None:
    """Prints the branch's commit subjects, newest first, without the hashes."""
    sys.stdout.write(git(repo, "log", "--format=%s", "main..HEAD").stdout)


def print_test_verdict(repo: str) -> int:
    """Runs the suite, prints only its last line, OK or FAILED, and returns its exit status."""
    env = dict(os.environ, PYTHON_COLORS="0", NO_COLOR="1")
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "-q"],
        cwd=repo,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    lines = result.stdout.strip().splitlines()
    print(lines[-1] if lines else "")
    return result.returncode
