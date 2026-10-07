"""Fixture for "Watch the context meter": statusline.py on two sample inputs.

The first input is session data before the first request, when the
context fields can be null. The second is the data after a request, with
the fields the status line reads. The values are written for this lesson.
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "statusline.py")

RECORD = (
    "/Users/you/.claude/projects/-Users-you-handbook-inspect/"
    "2f6c0d1e-5a7b-4c9d-8e3f-1a2b3c4d5e6f.jsonl"
)

SAMPLES = [
    {
        "session_id": "2f6c0d1e-5a7b-4c9d-8e3f-1a2b3c4d5e6f",
        "transcript_path": RECORD,
        "context_window": {
            "total_input_tokens": 0,
            "context_window_size": 200000,
            "used_percentage": None,
        },
    },
    {
        "session_id": "2f6c0d1e-5a7b-4c9d-8e3f-1a2b3c4d5e6f",
        "transcript_path": RECORD,
        "context_window": {
            "total_input_tokens": 23480,
            "context_window_size": 200000,
            "used_percentage": 11.74,
        },
    },
]

if __name__ == "__main__":
    for sample in SAMPLES:
        result = subprocess.run(
            [sys.executable, SCRIPT],
            input=json.dumps(sample),
            capture_output=True,
            text=True,
            check=True,
        )
        print(result.stdout, end="")
