"""Fixture for "Read the request log": a sample log, read with read_log.py.

It writes a small request log into a temporary directory, in the layout
Claude Code uses with OTEL_LOG_RAW_API_BODIES=file:<dir>: one
`<uuid>.request.json` per request and an `index.jsonl` that lists them.
The first request is a side request without tools, which asks for a
title for the session. The other three are one prompt that took three
model calls. The agent has three built-in tools and one MCP server,
`notes`, with five tools, and every definition is sent with every request,
as with tool search off. All the text is written for this lesson. The
`query_source` of the main requests, `repl_main_thread`, is a value the
monitoring page names, and `title` for the side request is made up.
Then it prints what read_log.py reports for the log.
"""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import read_log

SYSTEM = [
    {
        "type": "text",
        "text": (
            "You are a coding agent working in the user's project directory. "
            "Read files before you change them, keep changes small, and say what you changed. "
            "Ask before you run a command that deletes files or reaches the network. "
            "Answer in the language of the user's question. "
        )
        * 6,
    }
]


def tool(name, description, properties, required):
    """A tool definition in the form the Messages API takes."""
    return {
        "name": name,
        "description": description,
        "input_schema": {"type": "object", "properties": properties, "required": required},
    }


def text_param(description):
    return {"type": "string", "description": description}


BUILT_IN = [
    tool(
        "Read",
        "Read a file from the project. Returns the text with line numbers. "
        "Use an offset and a limit for a large file.",
        {
            "path": text_param("Path of the file to read."),
            "offset": {"type": "integer", "description": "First line to read."},
            "limit": {"type": "integer", "description": "Number of lines to read."},
        },
        ["path"],
    ),
    tool(
        "Bash",
        "Run a shell command in the project directory and return its output. "
        "Commands that change files or reach the network need the user's approval.",
        {
            "command": text_param("The command to run."),
            "timeout": {"type": "integer", "description": "Seconds."},
        },
        ["command"],
    ),
    tool(
        "Edit",
        "Replace one exact string in a file with another. "
        "The old string must appear once in the file.",
        {
            "path": text_param("Path of the file to change."),
            "old": text_param("The text to replace, exactly as it is in the file."),
            "new": text_param("The text to put in its place."),
        },
        ["path", "old", "new"],
    ),
]

NOTES = [
    tool(
        "mcp__notes__list_notes",
        "List the meeting notes in the team's notes folder, newest first. "
        "Each entry has the file name, the meeting date and the project name. "
        "Use a project filter to list the notes of one project only.",
        {
            "project": text_param("Only list notes of this project. Leave empty for all projects."),
            "since": text_param(
                "Only list notes of meetings on or after this date, as YYYY-MM-DD."
            ),
            "limit": {
                "type": "integer",
                "description": "The most entries to return. The default is 50.",
            },
        },
        [],
    ),
    tool(
        "mcp__notes__read_note",
        "Read one meeting note and return its full text. "
        "The name is a file name as list_notes returns it. "
        "Notes are plain text, and a long note is returned in full.",
        {"name": text_param("File name of the note, such as 2026-03-14-lantern.txt.")},
        ["name"],
    ),
    tool(
        "mcp__notes__search_notes",
        "Search the text of every meeting note for a word or a phrase. "
        "Returns the file name and the matching line of each hit. "
        "The search ignores case and matches whole words.",
        {
            "query": text_param("The word or phrase to search for."),
            "project": text_param("Only search the notes of this project."),
            "limit": {
                "type": "integer",
                "description": "The most hits to return. The default is 20.",
            },
        },
        ["query"],
    ),
    tool(
        "mcp__notes__add_note",
        "Write a new meeting note to the notes folder. "
        "The file name is built from the date and the project name. "
        "Fails when a note with that name exists.",
        {
            "date": text_param("Meeting date as YYYY-MM-DD."),
            "project": text_param("Project name, in lower case."),
            "text": text_param("The full text of the note."),
        },
        ["date", "project", "text"],
    ),
    tool(
        "mcp__notes__delete_note",
        "Delete one meeting note from the notes folder. This cannot be undone. "
        "The name is a file name as list_notes returns it.",
        {"name": text_param("File name of the note to delete.")},
        ["name"],
    ),
]

PROMPT = {"role": "user", "content": "Which meeting note mentions the June delivery?"}

LIST_CALL = {
    "role": "assistant",
    "content": [
        {"type": "tool_use", "id": "call_1", "name": "mcp__notes__list_notes", "input": {}}
    ],
}
LIST_RESULT = {
    "role": "user",
    "content": [
        {
            "type": "tool_result",
            "tool_use_id": "call_1",
            "content": "2026-03-28-lantern.txt  2026-03-28  lantern\n"
            "2026-03-21-budget.txt  2026-03-21  budget\n"
            "2026-03-14-lantern.txt  2026-03-14  lantern\n",
        }
    ],
}
READ_CALL = {
    "role": "assistant",
    "content": [
        {
            "type": "tool_use",
            "id": "call_2",
            "name": "mcp__notes__read_note",
            "input": {"name": "2026-03-14-lantern.txt"},
        }
    ],
}
READ_RESULT = {
    "role": "user",
    "content": [
        {
            "type": "tool_result",
            "tool_use_id": "call_2",
            "content": "Project Lantern, 14 March.\n"
            "Present: Ana, Joost, Priya.\n"
            "Sensor boards moved from April to June, because the supplier changed the chip.\n"
            "Ana confirms the date with the supplier by Friday.\n"
            "Joost updates the plan and tells the customer.\n"
            "Next meeting: 28 March.\n",
        }
    ],
}

REQUESTS = [
    [PROMPT],
    [PROMPT, LIST_CALL, LIST_RESULT],
    [PROMPT, LIST_CALL, LIST_RESULT, READ_CALL, READ_RESULT],
]


TITLE_REQUEST = {
    "model": "sample-model",
    "max_tokens": 64,
    "system": [
        {"type": "text", "text": "Write a title of at most six words for this conversation."}
    ],
    "messages": [PROMPT],
}


def write_log(log_dir):
    """Write the side request, the three requests and their index into `log_dir`."""
    bodies = [("title", TITLE_REQUEST)]
    for messages in REQUESTS:
        body = {
            "model": "sample-model",
            "max_tokens": 4096,
            "system": SYSTEM,
            "tools": BUILT_IN + NOTES,
            "messages": messages,
        }
        bodies.append(("repl_main_thread", body))
    with open(os.path.join(log_dir, "index.jsonl"), "w") as index:
        for number, (source, body) in enumerate(bodies, start=1):
            name = f"00000000-0000-0000-0000-00000000000{number}.request.json"
            with open(os.path.join(log_dir, name), "w") as handle:
                json.dump(body, handle, indent=2)
            entry = {"session_id": "sample-session", "query_source": source, "request_file": name}
            index.write(json.dumps(entry) + "\n")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as log_dir:
        write_log(log_dir)
        for line in read_log.summarize(log_dir):
            print(line)
