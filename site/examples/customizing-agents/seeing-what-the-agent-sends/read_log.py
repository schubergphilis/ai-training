"""Read a local request log, for the lesson "Seeing what the agent sends".

Claude Code writes one file per model request, `<uuid>.request.json`, into
the directory named by OTEL_LOG_RAW_API_BODIES=file:<dir>, and appends one
line per successful response to `<dir>/index.jsonl`, with the
`query_source` that sent it. Both are described on the monitoring page,
https://code.claude.com/docs/en/monitoring-usage. Each request file holds
the Messages API request: the system prompt, the tool definitions and the
messages.

This script reads the request files, oldest first, and prints, for each
request, how many tokens each part takes, and how many of them are the
tool definitions of each MCP server. It skips a request without tool
definitions, such as a side request, and says how many it skipped. A
definition marked `defer_loading` stays out of the model's context window
until the model loads it, so the counts leave it out and the report says
how many there were. The `defer_loading` field is described on the API
tool search page,
https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool.
An MCP tool is named `mcp__<server>__<tool>`, as the permissions page
shows, https://code.claude.com/docs/en/permissions, and the script groups
the tools by the server in that name. The source column is the request's
`query_source` from `index.jsonl`, printed as it is, or `-` when the
index has no value for it.

The counts are estimates at four characters per token, the rule of thumb
from the concepts course. The model's own tokenizer gives other numbers.
The JSON text escapes characters outside ASCII (`\\u00e9`), so the estimate
is too high for text that has many of them.

The script only reads, and it prints counts and names, never the text of
a request. It sends nothing anywhere.

Run it:  python3 read_log.py ~/claude-request-log
"""

import json
import os
import sys
from typing import NoReturn


def tokens(text):
    """Estimate the tokens in `text` at four characters per token."""
    return round(len(text) / 4)


def size(part):
    """The estimated tokens of one part of a request, as JSON text."""
    return tokens(json.dumps(part))


def fail(message) -> NoReturn:
    """Stop with one line on standard error."""
    sys.exit(f"read_log: {message}")


def load(path):
    """Parse one JSON file. On an error, name the file and never its content."""
    try:
        with open(path) as handle:
            body = json.load(handle)
    except ValueError:
        fail(f"{path} is not valid JSON")
    except OSError:
        fail(f"{path} can't be read")
    if not isinstance(body, dict):
        fail(f"{path} is not a request body")
    tools = body.get("tools") or []
    if not isinstance(tools, list) or not all(isinstance(tool, dict) for tool in tools):
        fail(f"{path} has a tools field that is not a list of definitions")
    return body


def request_files(log_dir):
    """The request files, oldest first. A file name breaks a tie."""
    if not os.path.isdir(log_dir):
        fail(f"{log_dir} is not a directory")
    names = [name for name in os.listdir(log_dir) if name.endswith(".request.json")]
    if not names:
        fail(
            f"no *.request.json files in {log_dir}. Was Claude Code started with "
            "CLAUDE_CODE_ENABLE_TELEMETRY=1 and OTEL_LOG_RAW_API_BODIES=file:<dir>?"
        )
    paths = [os.path.join(log_dir, name) for name in names]
    return sorted(paths, key=lambda path: (os.path.getmtime(path), path))


def sources(log_dir):
    """The query_source of each request file, from index.jsonl when it exists."""
    found = {}
    path = os.path.join(log_dir, "index.jsonl")
    if not os.path.exists(path):
        return found
    try:
        with open(path) as index:
            lines = index.read().splitlines()
    except ValueError:
        fail(f"{path} is not text")
    except OSError:
        fail(f"{path} can't be read")
    for line in lines:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            fail(f"{path} has a line that is not valid JSON")
        if not isinstance(entry, dict):
            fail(f"{path} has a line that is not an index entry")
        name = os.path.basename(str(entry.get("request_file", "")))
        found[name] = entry.get("query_source") or "-"
    return found


def server_of(tool):
    """The MCP server of a tool named mcp__<server>__<tool>, or None for any other tool."""
    parts = tool.get("name", "").split("__")
    if len(parts) >= 3 and parts[0] == "mcp":
        return parts[1]
    return None


def summarize(log_dir):
    """Return the report as a list of lines."""
    lines = [
        "estimated tokens, 4 characters per token",
        "request  system   tools  messages   total  mcp tools   source",
    ]
    servers = {}
    source_of = sources(log_dir)
    skipped = 0
    deferred = 0
    number = 0
    for path in request_files(log_dir):
        body = load(path)
        all_tools = body.get("tools") or []
        if not all_tools:
            skipped += 1
            continue
        tools = [tool for tool in all_tools if not tool.get("defer_loading")]
        deferred += len(all_tools) - len(tools)
        number += 1
        system = size(body.get("system", ""))
        tool_tokens = size(tools)
        messages = size(body.get("messages", []))
        total = system + tool_tokens + messages
        mcp = 0
        for tool in tools:
            server = server_of(tool)
            if server is not None:
                mcp += size(tool)
                servers.setdefault(server, set()).add(tool["name"])
        percent = f"{round(100 * mcp / total)}%" if total else "-"
        share = f"{mcp:,} ({percent})"
        source = source_of.get(os.path.basename(path), "-")
        lines.append(
            f"{number:>7}  {system:>6,}  {tool_tokens:>6,}  {messages:>8,}  {total:>6,}"
            f"  {share:<10}  {source}"
        )
    for server in sorted(servers):
        lines.append(f"mcp__{server}: {len(servers[server])} tools")
    lines.append(f"skipped {skipped} request(s) without tools")
    lines.append(f"left out {deferred} deferred definition(s)")
    return lines


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 read_log.py <log-dir>")
    for line in summarize(sys.argv[1]):
        print(line)
