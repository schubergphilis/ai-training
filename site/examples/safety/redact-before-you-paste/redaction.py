"""The document, the redaction map and the two operations the lesson
"Redacting a document before you paste it" runs.

Every person and company here is invented. The email is a support request
about a leaking dishwasher, and the task the lesson runs on it (draft a
reply that offers a second visit and asks for a time window) needs none of
the names, numbers or addresses in it.

The email is `sample/email.txt` and the map is `sample/email-map.txt`, one
`value => placeholder` per line: one row per value the task does not need,
and the same placeholder everywhere the value appears, so the redacted text
still says which person did what. The lesson page shows the same files in
its redaction widget.

The scripts next to this file import it: `redact.py` prints the redacted
email, `check_partial.py` shows what a half-done redaction leaves in, and
`restore.py` puts the real values back into a reply drafted on the
redacted text.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "sample")


def read_sample(name: str) -> str:
    """The text of one file in `sample/`, which the lesson page's widgets show too."""
    with open(os.path.join(SAMPLE, name), encoding="utf-8") as handle:
        return handle.read()


def redact(text: str, replacements: "list[tuple[str, str]]") -> str:
    """Replace every value in `replacements` with its placeholder.

    Longer values go first, so a value that contains a shorter one (a full
    name that contains a first name) is replaced whole.
    """
    for value, placeholder in sorted(replacements, key=lambda row: -len(row[0])):
        text = text.replace(value, placeholder)
    return text


def restore(text: str, replacements: "list[tuple[str, str]]") -> str:
    """Put the real values back for every placeholder that appears in `text`.

    Longer placeholders go first, so `Person 10` is restored whole and not
    as `Person 1` followed by a `0`.
    """
    for value, placeholder in sorted(replacements, key=lambda row: -len(row[1])):
        text = text.replace(placeholder, value)
    return text


def parse_map(text: str) -> "list[tuple[str, str]]":
    """Parse a map: one `value => placeholder` per line, blank lines skipped."""
    rows = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        value, separator, placeholder = line.partition(" => ")
        if not separator:
            raise SystemExit(f"map line without ' => ': {line}")
        rows.append((value, placeholder))
    return rows


def read_map(path: str) -> "list[tuple[str, str]]":
    """Read a map file: one `value => placeholder` per line, blank lines skipped."""
    with open(path, encoding="utf-8") as handle:
        return parse_map(handle.read())


EMAIL = read_sample("email.txt")
MAP = parse_map(read_sample("email-map.txt"))
