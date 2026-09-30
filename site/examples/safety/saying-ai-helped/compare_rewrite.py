"""Run the comparison on sample/rewritten.py, a version written from the requirement.

    python3 compare_rewrite.py

Prints the same report as `python3 compare.py sample/rewritten.py`.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import compare  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    compare.main(["compare.py", os.path.join("sample", "rewritten.py")])
