"""Runs the checker on the sample that a bare "return JSON" prompt produced.

The lesson page loads sample/bare.json into its format checker for its
pitfall, and shows this report in a `text` fence. The lesson file lists
this script in `proofs`. The model chose its own keys and its own priority
words, so every item fails and the checker returns 1. That status is
dropped here on purpose, because the example runner treats a non-zero exit
as a broken fixture, and this fixture shows a failing run.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import check_items  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    check_items.main(["check_items.py", os.path.join(HERE, "sample", "bare.json")])
