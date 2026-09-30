"""Shared helpers for the project-instructions fixtures.

Every fixture copies `fixture-repo` to a temporary directory, makes the copy a
git repository with one commit, and replays on it what a session in the lesson
did. The committed fixture stays in its starting state. `sessions/` holds the
two recorded session logs the lesson reads; they sit next to `fixture-repo`,
so an agent working in a copy of the repository never reads them.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from typing import Callable

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "fixture-repo")
SESSIONS = os.path.join(HERE, "sessions")
RENAME_TEST = os.path.join(HERE, "test_rename.py")
REMOVE_TEST = os.path.join(HERE, "test_remove.py")

# git runs with only these variables, so nothing in the learner's environment
# (a GIT_DIR pointing elsewhere, GIT_TEMPLATE_DIR, GIT_CONFIG_PARAMETERS) can
# reach it. HOME is set per copy, below, so no user config is read either.
# The same list is in the `_common.py` of reversible-changes,
# reviewing-the-diff and project-instructions: keep the three in step.
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

# The rule the fixture's AGENTS.md starts with, and the one line that replaces it.
RULE_BEFORE = "- Do not edit `todos.json`; the tests use their own lists.\n"
RULE_AFTER = (
    "- Never change `todos.json`, by hand or by running `todo.py`. To try a command,"
    " copy the list first: `cp todos.json /tmp/todos.json`, then run"
    " `TODO_FILE=/tmp/todos.json python3 todo.py ...`.\n"
)

UNDO_FUNCTION_END = """    items[index]["done"] = False
    return f"open #{number}: {items[index]['text']}"
"""

RENAME_FUNCTION = """

def rename(items, number, text):
    index = number - 1
    if index < 0 or index >= len(items):
        return f"no item #{number}"
    items[index]["text"] = text
    return f"renamed #{number}: {text}"
"""

REMOVE_FUNCTION = """

def remove(items, number):
    index = number - 1
    if index < 0 or index >= len(items):
        return f"no item #{number}"
    item = items.pop(index)
    return f"removed #{number}: {item['text']}"
"""

UNDO_BRANCH = """    elif command == "undo" and len(argv) == 3 and argv[2].isdigit():
        message = undo(items, int(argv[2]))
"""

RENAME_BRANCH = """    elif command == "rename" and len(argv) > 3 and argv[2].isdigit():
        message = rename(items, int(argv[2]), " ".join(argv[3:]))
"""

REMOVE_BRANCH = """    elif command == "remove" and len(argv) == 3 and argv[2].isdigit():
        message = remove(items, int(argv[2]))
"""


def _replace(repo: str, name: str, before: str, after: str) -> None:
    path = os.path.join(repo, name)
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    if before not in source:
        raise SystemExit(f"{name} no longer holds the text the lesson changes")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(source.replace(before, after, 1))


def git(repo: str, *args: str) -> str:
    """Runs one git command in the copy, with a fixed identity and no user config."""
    result = subprocess.run(
        # maintenance.auto=false: a commit starts no detached `git maintenance`
        # run, which could still hold a lock when the temporary directory is removed.
        [
            "git",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "maintenance.auto=false",
            "-c",
            "core.quotepath=false",
            *args,
        ],
        cwd=repo,
        env=dict(GIT_ENV_BASE, HOME=os.path.dirname(repo)),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
    return result.stdout


def copy_repo(parent: str) -> str:
    """Copies the fixture into `parent` and gives the copy one commit, as the page says."""
    copy = os.path.join(parent, "fixture-repo")
    # A learner who ran git or the program inside the committed fixture leaves
    # a .git/ or a cache there. Neither is part of the fixture.
    shutil.copytree(REPO, copy, ignore=shutil.ignore_patterns(".git", "__pycache__"))
    git(copy, "init", "-q")
    git(copy, "add", "-A")
    git(copy, "commit", "-qm", "start")
    return copy


def fix_instructions(repo: str) -> None:
    """The learner's one-line fix to AGENTS.md, committed before the fresh session."""
    _replace(repo, "AGENTS.md", RULE_BEFORE, RULE_AFTER)
    git(repo, "commit", "-qam", "docs: say how to try a command without changing todos.json")


def apply_rename(repo: str) -> None:
    """What session 1 changed: `rename` in todo.py and its test file."""
    _replace(repo, "todo.py", UNDO_FUNCTION_END, UNDO_FUNCTION_END + RENAME_FUNCTION)
    _replace(repo, "todo.py", UNDO_BRANCH, UNDO_BRANCH + RENAME_BRANCH)
    shutil.copyfile(RENAME_TEST, os.path.join(repo, "test_rename.py"))


def apply_remove(repo: str) -> None:
    """What session 2 changed: `remove` in todo.py and its test file."""
    _replace(repo, "todo.py", UNDO_FUNCTION_END, UNDO_FUNCTION_END + REMOVE_FUNCTION)
    _replace(repo, "todo.py", UNDO_BRANCH, UNDO_BRANCH + REMOVE_BRANCH)
    shutil.copyfile(REMOVE_TEST, os.path.join(repo, "test_remove.py"))


def python_env(**extra: str) -> "dict[str, str]":
    """The only variables the program and the suite see, plus `extra`.

    An allow-list, like git's above, so a variable in the learner's
    environment (PYTHONSAFEPATH, PYTHONPATH, a TODO_FILE) can't change what
    the lesson shows.
    """
    env = {
        "PATH": os.environ.get("PATH", ""),
        "LANG": "C",
        "LC_ALL": "C",
        "PYTHON_COLORS": "0",
        "NO_COLOR": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    env.update(extra)
    return env


def run_todo(repo: str, todo_file: "str | None", *args: str) -> str:
    """Runs a todo.py command in the copy and returns what it printed.

    With `todo_file` None the command runs the way the agent ran it in the
    recorded sessions: no TODO_FILE, so it reads and writes the copy's own
    `todos.json`.
    """
    env = python_env() if todo_file is None else python_env(TODO_FILE=todo_file)
    result = subprocess.run(
        [sys.executable, "todo.py", *args],
        cwd=repo,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return result.stdout


def test_verdict(repo: str) -> str:
    """Runs the suite and returns its last line, OK or FAILED."""
    env = python_env()
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "-q"],
        cwd=repo,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    lines = result.stdout.strip().splitlines()
    # A suite that prints nothing returns "", which matches neither OK nor a
    # recorded log line, so the caller fails instead of passing on silence.
    return lines[-1] if lines else ""


def status(repo: str) -> list[str]:
    """`git status --short`, one line per changed file."""
    return git(repo, "status", "--short").splitlines()


def in_copy(fn: Callable[[str, str], int]) -> int:
    """Calls `fn(repo, scratch)` with a fresh committed copy and a scratch directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        scratch = os.path.join(tmpdir, "scratch")
        os.mkdir(scratch)
        return fn(copy_repo(tmpdir), scratch)
