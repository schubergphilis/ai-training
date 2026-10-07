"""Runs check_money.py on a fresh copy of the nightly import.

The project is the nightly sales import from the observing-and-debugging
lesson, copied to a temporary directory together with `check_money.py`, so
nothing in your clone changes. The script runs the check the way a CI step
would, from the copy, and prints what the check printed and its exit
status.
"""

import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
NIGHTLY = os.path.join(os.path.dirname(HERE), "observing-and-debugging", "nightly")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        copy = os.path.join(tmpdir, "nightly")
        shutil.copytree(NIGHTLY, copy)
        shutil.copy(os.path.join(HERE, "check_money.py"), copy)
        print("$ python3 check_money.py importer.py")
        result = subprocess.run(
            [sys.executable, "check_money.py", "importer.py"],
            cwd=copy,
            capture_output=True,
            text=True,
            check=False,
        )
        print(result.stdout, end="")
        print(f"exit status {result.returncode}")


if __name__ == "__main__":
    main()
