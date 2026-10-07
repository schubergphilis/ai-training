"""Runs check_terms.py on the sample term list and spec, as the lesson does."""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    result = subprocess.run(
        [sys.executable, "check_terms.py", "sample/TERMS.md", "sample/SPEC.md"],
        cwd=HERE,
    )
    sys.exit(result.returncode)
