"""Runs the checker on the committed JSON sample.

The lesson page loads sample/items.json into its format checker and shows
this report in a `text` fence. The lesson file lists this script in
`proofs`. Every item in the sample passes, so this exits with the
checker's exit status.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import check_items  # noqa: E402  (imported after sys.path knows this directory)

if __name__ == "__main__":
    sys.exit(check_items.main(["check_items.py", os.path.join(HERE, "sample", "items.json")]))
