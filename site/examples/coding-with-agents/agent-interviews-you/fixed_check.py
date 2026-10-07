"""Runs check_terms.py on the sample spec after the two fixes the lesson makes.

The fixes are applied to a temporary copy of `sample/`, so the committed
sample keeps both drifted words.
"""

import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIXES = [
    ("the text of each task.", "the text of each item."),
    (
        "`clear` deletes the completed items and empties `archive.json`.",
        "`clear` deletes the done items and leaves `archive.json` as it is.",
    ),
]

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmpdir:
        sample = os.path.join(tmpdir, "sample")
        shutil.copytree(os.path.join(HERE, "sample"), sample)
        spec_path = os.path.join(sample, "SPEC.md")
        with open(spec_path, encoding="utf-8") as handle:
            spec = handle.read()
        for old, new in FIXES:
            if old not in spec:
                sys.exit(f"sample/SPEC.md no longer has: {old}")
            spec = spec.replace(old, new)
        with open(spec_path, "w", encoding="utf-8") as handle:
            handle.write(spec)
        result = subprocess.run(
            [
                sys.executable,
                os.path.join(HERE, "check_terms.py"),
                "sample/TERMS.md",
                "sample/SPEC.md",
            ],
            cwd=tmpdir,
        )
    sys.exit(result.returncode)
