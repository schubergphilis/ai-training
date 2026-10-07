"""Shared helpers for the reviewing-the-diff fixtures.

The fixtures start from the spec-driven-increments fixture repository and its
spec, two directories over, and never change them. Each fixture copies that
directory to a temporary place, turns the copy into a git repository with the
program and the spec on `main`, and then lands the prepared agent branch
`due-dates` as one commit. The branch is the one the lesson reviews. It does
most of what `SPEC.md` asks and hides five problems: `overdue` prints nothing
instead of `nothing overdue`, a malformed date is refused with the message but
exit status 0, `render.py` drops the `nothing to do` line and the test for it
is deleted, `store.py` gets a new default file name, and `test_clear.py` is
reformatted.

`review-in-a-fresh-session/check_findings.py` loads this module by path and
calls `in_copy`, so a change to the branch or to `in_copy` reaches that lesson.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from typing import Callable

HERE = os.path.dirname(os.path.abspath(__file__))
SIBLING = os.path.join(os.path.dirname(HERE), "spec-driven-increments")
REPO = os.path.join(SIBLING, "fixture-repo")
SPEC = os.path.join(SIBLING, "SPEC.md")
AGENT_TEST = os.path.join(HERE, "test_due_dates.py")

COMMIT_SUBJECT = "feat: due dates with overdue and date validation"

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
    "GIT_AUTHOR_NAME": "Agent",
    "GIT_AUTHOR_EMAIL": "agent@example.com",
    "GIT_COMMITTER_NAME": "Agent",
    "GIT_COMMITTER_EMAIL": "agent@example.com",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
}

# The agent's todo.py. `due` and `overdue` are there, `valid_date` is there,
# and the malformed date prints its message but the command still exits 0.
AGENT_TODO = '''"""todo: a small to-do list kept in a JSON file.

Usage:
    python3 todo.py add "Buy milk"
    python3 todo.py list
    python3 todo.py done 1
    python3 todo.py due 1 2026-10-01
    python3 todo.py overdue
    python3 todo.py clear
"""

import datetime
import os
import sys

import render
import store


def add(items, text):
    items.append({"text": text, "done": False})
    return f"added #{len(items)}: {text}"


def done(items, number):
    index = number - 1
    if index < 0 or index >= len(items):
        return f"no item #{number}"
    items[index]["done"] = True
    return f"done #{number}: {items[index]['text']}"


def valid_date(text):
    try:
        datetime.date.fromisoformat(text)
    except ValueError:
        return False
    return True


def due(items, number, date):
    index = number - 1
    if index < 0 or index >= len(items):
        return f"no item #{number}"
    items[index]["due"] = date
    return f"due #{number}: {items[index]['text']} by {date}"


def overdue(items):
    today = os.environ.get("TODO_TODAY") or datetime.date.today().isoformat()
    lines = []
    for number, item in enumerate(items, start=1):
        if not item["done"] and item.get("due") and item["due"] < today:
            lines.append(f"{number}. [ ] {item['text']} (due {item['due']})")
    return "\\n".join(lines)


def clear(items):
    removed = store.remove_done(items)
    noun = "item" if removed == 1 else "items"
    return f"removed {removed} done {noun}"


def main(argv):
    items = store.load()
    command = argv[1] if len(argv) > 1 else "list"
    if command == "add" and len(argv) > 2:
        message = add(items, " ".join(argv[2:]))
    elif command == "list":
        message = render.list_items(items)
    elif command == "done" and len(argv) == 3 and argv[2].isdigit():
        message = done(items, int(argv[2]))
    elif command == "due" and len(argv) == 4 and argv[2].isdigit():
        if valid_date(argv[3]):
            message = due(items, int(argv[2]), argv[3])
        else:
            message = f"bad date: {argv[3]}"
    elif command == "overdue":
        message = overdue(items)
    elif command == "clear":
        message = clear(items)
    else:
        print((__doc__ or "").strip(), file=sys.stderr)
        return 2
    store.save(items)
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
'''

# The agent's render.py shows the date, and the empty list now gets the
# count line instead of `nothing to do`.
AGENT_RENDER = '''"""Formatting the list for the terminal."""


def list_items(items):
    lines = []
    for number, item in enumerate(items, start=1):
        mark = "x" if item["done"] else " "
        line = f"{number}. [{mark}] {item['text']}"
        if item.get("due"):
            line += f" (due {item['due']})"
        lines.append(line)
    done = sum(1 for item in items if item["done"])
    lines.append(f"{len(items) - done} open, {done} done")
    return "\\n".join(lines)
'''

# The test the agent deleted from test_todo.py, because its render.py change
# made it fail.
DELETED_TEST = """
    def test_list_empty(self):
        self.assertEqual(render.list_items([]), "nothing to do")
"""

# The default the agent changed in store.py, which no line of the spec asks for.
STORE_DEFAULT_BEFORE = 'TODO_FILE = os.environ.get("TODO_FILE", "todos.json")\n'
STORE_DEFAULT_AFTER = 'TODO_FILE = os.environ.get("TODO_FILE", ".todos.json")\n'

# test_clear.py, reformatted from double quotes to single quotes and nothing else.
AGENT_TEST_CLEAR = """import unittest

import store


class ClearTests(unittest.TestCase):
    def test_remove_done_removes_every_done_item(self):
        items = [
            {'text': 'Buy milk', 'done': False},
            {'text': 'Call the plumber', 'done': True},
            {'text': 'Renew the passport', 'done': True},
            {'text': 'Water the plants', 'done': False},
        ]
        removed = store.remove_done(items)
        self.assertEqual(removed, 2)
        self.assertEqual([item['text'] for item in items], ['Buy milk', 'Water the plants'])


if __name__ == '__main__':
    unittest.main()
"""


def copy_repo(tmpdir: str) -> str:
    copy = os.path.join(tmpdir, "fixture-repo")
    shutil.copytree(REPO, copy)
    return copy


def _write(repo: str, name: str, source: str) -> None:
    with open(os.path.join(repo, name), "w", encoding="utf-8") as handle:
        handle.write(source)


def _replace(repo: str, name: str, before: str, after: str) -> None:
    path = os.path.join(repo, name)
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    if before not in source:
        raise SystemExit(f"{name} no longer holds the text the lesson changes")
    _write(repo, name, source.replace(before, after))


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
    """The repository as the agent received it: the program and the spec on main."""
    git(repo, "init", "-q", "--initial-branch=main")
    _write(repo, ".gitignore", "__pycache__/\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "chore: the to-do program before due dates")
    shutil.copyfile(SPEC, os.path.join(repo, "SPEC.md"))
    git(repo, "add", "SPEC.md")
    git(repo, "commit", "-q", "-m", "docs: spec for due dates")


def land_agent_branch(repo: str) -> None:
    """The prepared agent branch: one commit with the whole feature and the five problems."""
    git(repo, "switch", "-q", "-c", "due-dates")
    _write(repo, "todo.py", AGENT_TODO)
    _write(repo, "render.py", AGENT_RENDER)
    _replace(repo, "test_todo.py", DELETED_TEST, "")
    _replace(repo, "store.py", STORE_DEFAULT_BEFORE, STORE_DEFAULT_AFTER)
    _write(repo, "test_clear.py", AGENT_TEST_CLEAR)
    shutil.copyfile(AGENT_TEST, os.path.join(repo, "test_due_dates.py"))
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", COMMIT_SUBJECT)


def run_todo(
    repo: str, *args: str, today: "str | None" = None
) -> "subprocess.CompletedProcess[str]":
    """Runs a todo.py command against the copy's own todos.json and captures it."""
    env = dict(os.environ, TODO_FILE=os.path.join(repo, "todos.json"))
    if today is not None:
        env["TODO_TODAY"] = today
    return subprocess.run(
        [sys.executable, "todo.py", *args],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
    )


def test_verdict(repo: str) -> str:
    """Runs the suite and returns its last line, OK or FAILED."""
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
    return lines[-1] if lines else ""


def build(parent: str) -> str:
    """Copies the fixture into `parent`, makes it a repository and lands the branch."""
    repo = copy_repo(parent)
    init_repo(repo)
    land_agent_branch(repo)
    return repo


def in_copy(fn: Callable[[str], int]) -> int:
    with tempfile.TemporaryDirectory() as tmpdir:
        return fn(build(tmpdir))
