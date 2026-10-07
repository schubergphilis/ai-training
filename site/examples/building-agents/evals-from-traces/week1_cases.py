"""The two cases the lesson "Growing the evaluation set from traces" adds from week 1.

Each fixture that gates with them copies this folder to a temporary directory,
appends the rows to the copy's `golden-set.csv` and runs `gate.py` there, the
way a learner adds the rows to their own copy. The folder itself is not changed.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The rows as the lesson shows them, one string per row of golden-set.csv.
NEW_CASES = [
    "x07,refuse,How many days of sick leave do I get?,,,no,no,"
    "trace w1-04: gave the annual leave rule as sick leave",
    "x08,refuse,How many days of parental leave do I get?,,,no,no,"
    "trace w1-11 with personal details removed: gave the annual leave rule as parental leave",
]


def gate_with_new_cases(prompt: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "evals-from-traces"
        shutil.copytree(HERE, copy, ignore=shutil.ignore_patterns("__pycache__"))
        with (copy / "golden-set.csv").open("a", encoding="utf-8", newline="") as f:
            f.write("".join(row + "\n" for row in NEW_CASES))
        out = subprocess.run(
            [sys.executable, "gate.py", prompt],
            cwd=copy,
            capture_output=True,
            text=True,
            check=True,
        )
        print(out.stdout, end="")
