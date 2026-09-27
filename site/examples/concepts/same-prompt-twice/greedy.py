"""Ten runs at temperature 0, summary line only: sample.py with
--temperature 0 --runs 10 --quiet.

A proof of the lesson (its lesson file lists it in proofs): the page shows
the line this prints in a text fence.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sample  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    sys.exit(sample.main(["sample.py", "--temperature", "0", "--runs", "10", "--quiet"]))
