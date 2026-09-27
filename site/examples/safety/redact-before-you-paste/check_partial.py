"""Show what a half-done redaction still gives away.

A colleague redacted the lesson's email by hand: they shortened the
customer's name to initials and took the phone number and the email address
out. Their version is `sample/partial.txt`. The script checks it for the
details from the original that would let someone work out who the customer
is, listed in `sample/watch.txt` as `value => label` in report order, and
prints the labels of the ones it finds. The lesson page runs the same check
in its redaction widget.

    python3 check_partial.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import redaction  # noqa: E402  (imported after sys.path knows this directory)

PARTIAL = redaction.read_sample("partial.txt")

# What to look for, and the label the report uses for it, in report order.
IDENTIFYING = [
    (label, value) for value, label in redaction.parse_map(redaction.read_sample("watch.txt"))
]


def still_identifying(text: str) -> "list[str]":
    """Return the labels of the identifying details that are still in `text`."""
    return [label for label, value in IDENTIFYING if value in text]


if __name__ == "__main__":
    print("still identifying: " + ", ".join(still_identifying(PARTIAL)))
