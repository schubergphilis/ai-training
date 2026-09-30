"""Runs the ranker twice, names swapped, and prints only the totals line.

The line is the one the lesson page asks the learner to predict, and it
is on the page in a `text` fence.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import rank  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    rank.main(["rank.py", "--totals"])
