"""Report how much of one file also appears in another, line for line.

This is the rule of the line comparer widget on the lesson page
(`site/src/scripts/line-compare-logic.ts`), and the page shows what it
prints in `text` fences. The lesson file lists this script and
`compare_rewrite.py` as proofs.

No arguments:   python3 compare.py
    Compares sample/generated.py, the function an assistant returned, with
    sources/truncate.py, the library function it resembles.

One argument:   python3 compare.py sample/rewritten.py
    Compares another file in this directory with the same library function.

A line counts as shared when its text, with the spaces around it removed,
is also a line of the library file. Blank lines are skipped.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIBRARY = os.path.join("sources", "truncate.py")
GENERATED = os.path.join("sample", "generated.py")


def code_lines(path: str) -> "list[str]":
    """The non-blank lines of the file at `path`, each stripped of surrounding spaces."""
    with open(os.path.join(HERE, path), encoding="utf-8") as handle:
        return [line.strip() for line in handle if line.strip()]


def report(candidate: str, library: str = LIBRARY) -> str:
    """Count the lines of `candidate` that also appear in `library`, and list the rest."""
    library_lines = set(code_lines(library))
    candidate_lines = code_lines(candidate)
    shared = [line for line in candidate_lines if line in library_lines]
    only_here = [line for line in candidate_lines if line not in library_lines]
    name = os.path.basename(library)
    lines = [
        f"{len(shared)} of {len(candidate_lines)} lines also appear in {name}",
        f"lines not in {name}:",
    ]
    lines.extend("  " + line for line in only_here)
    return "\n".join(lines)


def main(argv: "list[str]") -> None:
    if len(argv) == 1:
        candidate = GENERATED
    elif len(argv) == 2:
        candidate = argv[1]
    else:
        raise SystemExit("usage: python3 compare.py [file.py]")
    print(report(candidate))


if __name__ == "__main__":
    main(sys.argv)
