"""A status line for Claude Code, for the lesson "Seeing what the agent sends".

Claude Code runs the status line command with the session data as JSON on
standard input and shows what the command prints. This script prints the
share of the context window in use, the input tokens of the last request
and the file name of the session record, from the fields
`context_window.used_percentage`, `context_window.total_input_tokens` and
`transcript_path`. A field can be missing or null early in a session, and
the script prints a dash for it then.

It reads its input and prints one line. It writes no file and sends
nothing anywhere.
"""

import json
import os
import sys


def line(data):
    """The status line for one JSON object of session data."""
    window = data.get("context_window") or {}
    used = window.get("used_percentage")
    total = window.get("total_input_tokens")
    transcript = data.get("transcript_path")
    used_text = "-" if used is None else f"{round(used)}%"
    total_text = "-" if total is None else f"{total:,} tokens"
    record = "-" if not transcript else os.path.basename(transcript)
    return f"context {used_text} | {total_text} | record {record}"


if __name__ == "__main__":
    print(line(json.load(sys.stdin)))
