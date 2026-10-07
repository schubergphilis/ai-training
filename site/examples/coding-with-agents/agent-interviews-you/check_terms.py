"""check_terms: find the words a term list says to avoid.

Usage:
    python3 check_terms.py TERMS.md SPEC.md [MORE.md ...]

The term list has one line per term, in this form:

    - **archive**: move every done item to `archive.json`. Avoid: hide, hides.

For each file after the term list, the script prints every line that uses an
avoided word, with the term to use in its place. Matching ignores case and
counts whole words only, so list each form of a word you want to catch.
"""

import re
import sys

TERM_LINE = re.compile(r"^- \*\*(?P<term>[^*]+)\*\*: .*Avoid: (?P<avoid>[^.]+)\.?\s*$")


def read_terms(path: str) -> list[tuple[str, str]]:
    """Returns (avoided word, term) pairs, in the order of the term list."""
    pairs = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            match = TERM_LINE.match(line.strip())
            if not match:
                continue
            for word in match.group("avoid").split(","):
                if word.strip():
                    pairs.append((word.strip(), match.group("term").strip()))
    return pairs


def check(path: str, terms_path: str, pairs: list[tuple[str, str]]) -> int:
    found = 0
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            for word, term in pairs:
                if re.search(r"\b" + re.escape(word) + r"\b", line, re.IGNORECASE):
                    print(f'{path}:{number}: "{word}" where {terms_path} says "{term}"')
                    found += 1
    return found


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print((__doc__ or "").strip(), file=sys.stderr)
        return 2
    terms_path = argv[1]
    pairs = read_terms(terms_path)
    if not pairs:
        print(f"no terms found in {terms_path}", file=sys.stderr)
        print("each term is a line like: - **term**: meaning. Avoid: word, word.", file=sys.stderr)
        return 2
    found = 0
    for path in argv[2:]:
        found += check(path, terms_path, pairs)
    if found == 0:
        print(f"no avoided words in {', '.join(argv[2:])}")
    else:
        noun = "word" if found == 1 else "words"
        print(f"{found} {noun} to check")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
