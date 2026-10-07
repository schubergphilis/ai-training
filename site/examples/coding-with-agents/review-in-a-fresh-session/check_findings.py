"""Checks the findings of a fresh-session review against the branch itself.

The branch is the prepared agent branch `due-dates` from the reviewing-the-diff
lesson, built by that lesson's `_common.py` on a temporary copy. The review the
lesson shows makes seven findings. Five of them say what a command does, so
this script runs each of those commands on the branch and prints what came
back, numbered as in the review. `confirmed` means the branch does what the
finding says, and `refuted` means it doesn't. Finding 5 is about the diff of
`test_clear.py`, which the reviewing-the-diff lesson reads, and finding 7 is a
suggestion, which no command can confirm. Every command runs on the temporary
copy, so nothing in your clone changes.
"""

import importlib.machinery
import importlib.util
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COMMON = os.path.join(os.path.dirname(HERE), "reviewing-the-diff", "_common.py")


def load_common():
    name = "reviewing_the_diff_common"
    loader = importlib.machinery.SourceFileLoader(name, COMMON)
    spec = importlib.util.spec_from_loader(name, loader)
    if spec is None:
        raise SystemExit(f"cannot load {COMMON}")
    module = importlib.util.module_from_spec(spec)
    # No __pycache__ next to the other lesson's fixtures.
    sys.dont_write_bytecode = True
    loader.exec_module(module)
    return module


def run(repo: str, *args: str, todo_file: "str | None", today: "str | None" = None):
    """Runs one todo.py command in the copy. todo_file None leaves TODO_FILE unset."""
    env = {
        key: value for key, value in os.environ.items() if key not in ("TODO_FILE", "TODO_TODAY")
    }
    if todo_file is not None:
        env["TODO_FILE"] = todo_file
    if today is not None:
        env["TODO_TODAY"] = today
    return subprocess.run(
        [sys.executable, "todo.py", *args],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
    )


def shown(output: str) -> str:
    text = output.rstrip("\n")
    return "an empty line" if text == "" else repr(text)


def main(repo: str) -> int:
    committed = os.path.join(repo, "todos.json")
    empty = os.path.join(os.path.dirname(repo), "empty.json")
    lines = []

    result = run(repo, "overdue", todo_file=committed, today="2026-09-30")
    verdict = "refuted" if result.stdout == "nothing overdue\n" else "confirmed"
    lines.append(f"1. overdue, nothing due: prints {shown(result.stdout)}, {verdict}")

    result = run(repo, "due", "1", "tomorrow", todo_file=committed)
    verdict = "refuted" if result.returncode == 2 else "confirmed"
    lines.append(f"2. due 1 tomorrow: exit status {result.returncode}, {verdict}")

    result = run(repo, "list", todo_file=empty)
    verdict = "refuted" if result.stdout == "nothing to do\n" else "confirmed"
    lines.append(f"3. list, empty list: prints {shown(result.stdout)}, {verdict}")

    result = run(repo, "list", todo_file=None)
    verdict = "refuted" if "Buy milk" in result.stdout else "confirmed"
    lines.append(f"4. list, TODO_FILE unset: prints {shown(result.stdout)}, {verdict}")

    result = run(repo, "due", "1", "2026-02-30", todo_file=committed)
    verdict = "refuted" if result.stdout.startswith("bad date:") else "confirmed"
    lines.append(f"6. due 1 2026-02-30: prints {shown(result.stdout)}, {verdict}")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(load_common().in_copy(main))
