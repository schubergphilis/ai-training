"""Count the lines an instruction file puts in context at the start of a session.

For the lesson "Load it, point at it, or cut it".

Run it from this directory:   python3 startup.py

It follows Claude Code's import rule as the memory documentation states it
(https://code.claude.com/docs/en/memory, "Import additional files"),
simplified: an `@path` outside a code span or a fenced code block is expanded
at start-up, the path is relative to the file that holds it, and imports nest
at most four hops deep. A path without the `@`, such as `docs/release.md` in
a pointer line, adds nothing, because the agent reads that file only when it
decides to open it.
"""

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILES = ["AGENTS.long.md", "AGENTS.imports.md", "AGENTS.pruned.md"]
MAX_HOPS = 4

CODE_SPAN = re.compile(r"`[^`]*`")
IMPORT = re.compile(r"(?:^|\s)@(\S+)")


def imports(text):
    """The `@path` imports in `text`, skipping code spans and fenced blocks."""
    found = []
    in_fence = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        found.extend(IMPORT.findall(CODE_SPAN.sub("", line)))
    return found


def startup_lines(path, hops=0):
    """Lines of `path` plus the lines of every file it imports."""
    text = path.read_text(encoding="utf-8")
    total = len(text.splitlines())
    if hops < MAX_HOPS:
        for name in imports(text):
            target = path.parent / name
            if target.is_file():
                total += startup_lines(target, hops + 1)
    return total


if __name__ == "__main__":
    for name in FILES:
        print(f"{name}: {startup_lines(HERE / name)} lines at start")
