"""Runs sample/count_forms.py from the top of the copy, as the lesson does."""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    result = subprocess.run([sys.executable, "sample/count_forms.py"], cwd=HERE)
    sys.exit(result.returncode)
