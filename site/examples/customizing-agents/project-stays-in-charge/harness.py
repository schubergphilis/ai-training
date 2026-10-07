"""Runs the no-push hook the way Claude Code would.

For the lesson "Keeping the project in charge". `deny.py` and
`spellings.py` import it. Nothing here is part of the hook itself.

`run_guard` sends `no_push_guard.py` the JSON that Claude Code sends a
PreToolUse hook for a Bash tool call, and returns the exit code and what the
hook wrote to standard output. The hook reads only the command text, so it
runs with an environment that holds PATH alone, and no repository is needed.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).resolve().parent / "no_push_guard.py"


def run_guard(command: str) -> "tuple[int, str]":
    """Run the hook on one Bash command. Returns the exit code and stdout."""
    call = {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
        "cwd": str(Path.cwd()),
    }
    result = subprocess.run(
        [sys.executable, str(GUARD)],
        input=json.dumps(call),
        env={"PATH": os.environ.get("PATH", os.defpath)},
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, result.stdout
