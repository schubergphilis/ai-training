"""Runs sample/count_forms.py from fixture-repo in the copy, as the lesson does."""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "sample/count_forms.py")

if __name__ == "__main__":
    result = subprocess.run(
        [sys.executable, SCRIPT],
        cwd=os.path.join(HERE, "fixture-repo"),
    )
    sys.exit(result.returncode)
