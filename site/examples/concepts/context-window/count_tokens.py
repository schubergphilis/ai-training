"""Estimate the token count of a text, for the lesson "What the model can see".

Run it on your own text:   python3 count_tokens.py page.txt
Run it with no argument and it counts the meeting notes in sample/notes.txt.

This is an estimate. Every vendor has its own tokenizer, and only that
tokenizer gives the exact count for its models. The rule used here is the
common rule of thumb for English, about four characters per token: a word
of up to six characters is one token, a longer word is one token per four
characters (rounded up), and every punctuation mark is a token of its own.
"""

import math
import os
import re
import sys

CHARS_PER_TOKEN = 4
ONE_TOKEN_WORD = 6

# A piece is a run of letters and digits, or a single mark of punctuation.
# Whitespace is not a piece: the space before a word is part of that word's
# token in most real tokenizers.
PIECE = re.compile(r"\w+|[^\w\s]")

# The sample is a file so that the counter on the lesson page shows the same
# text in its box.
SAMPLE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample", "notes.txt")


def estimate_tokens(text: str) -> int:
    """Return the estimated number of tokens in `text`."""
    total = 0
    for piece in PIECE.findall(text):
        if not piece[0].isalnum() or len(piece) <= ONE_TOKEN_WORD:
            total += 1
        else:
            total += math.ceil(len(piece) / CHARS_PER_TOKEN)
    return total


def report(text: str) -> str:
    """Return the three-line report the lesson shows."""
    return "\n".join(
        [
            f"characters: {len(text)}",
            f"words: {len(text.split())}",
            f"tokens (estimate): {estimate_tokens(text)}",
        ]
    )


def main(argv: "list[str]") -> None:
    if len(argv) > 1:
        with open(argv[1], encoding="utf-8") as handle:
            text = handle.read()
    else:
        with open(SAMPLE_FILE, encoding="utf-8") as handle:
            text = handle.read()
    print(report(text))


if __name__ == "__main__":
    main(sys.argv)
