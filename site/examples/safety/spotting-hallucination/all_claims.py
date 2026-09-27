"""Runs the checker on the first sample summary with the full report.

This is `check_claims.py sample/summary_1.txt`, and the lesson page shows
this output in a `text` fence. Every claim gets an entry, found or not, so
the learner can compare a found figure with the sentence it was found in.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import check_claims  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    summary = os.path.join(HERE, "sample", "summary_1.txt")
    check_claims.main(["check_claims.py", summary])
