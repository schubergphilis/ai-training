"""Runs the checker on the first sample summary and prints only the claims with no source.

This is `check_claims.py sample/summary_1.txt --missing`. The lesson page
shows this output in a `text` fence. The summary has four claims the
sources do not support, so the checker itself exits 1, and this wrapper
does not pass that status on.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import check_claims  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    summary = os.path.join(HERE, "sample", "summary_1.txt")
    check_claims.main(["check_claims.py", summary, "--missing"])
