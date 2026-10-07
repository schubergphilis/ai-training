"""Read a local request log, for the lesson "Seeing what the agent sends".

Claude Code writes one file per model request, `<uuid>.request.json`, into
the directory named by OTEL_LOG_RAW_API_BODIES=file:<dir>, and appends one
line per response to `<dir>/index.jsonl`. Each request file holds the
Messages API request: the system prompt, the tool definitions and the
messages. This script reads the request files, oldest first, and prints,
for each request, how many tokens each part takes, and how many of them
are the tool definitions of each MCP server.

The counts are estimates at four characters per token, the rule of thumb
from the concepts course. The model's own tokenizer gives other numbers.

The script only reads. It sends nothing anywhere.

Run it:  python3 read_log.py ~/claude-request-log
"""

import json
import os
import sys


def tokens(text):
    """Estimate the tokens in `text` at four characters per token."""
    return round(len(text) / 4)


def size(part):
    """The estimated tokens of one part of a request, as JSON text."""
    return tokens(json.dumps(part))


def request_files(log_dir):
    """The request files, oldest first. A file name breaks a tie."""
    names = [name for name in os.listdir(log_dir) if name.endswith(".request.json")]
    paths = [os.path.join(log_dir, name) for name in names]
    return sorted(paths, key=lambda path: (os.path.getmtime(path), path))


def server_of(tool):
    """The MCP server of a tool named mcp__<server>__<tool>, or None for any other tool."""
    parts = tool.get("name", "").split("__")
    if len(parts) >= 3 and parts[0] == "mcp":
        return parts[1]
    return None


def summarize(log_dir):
    """Return the report as a list of lines."""
    lines = ["request  system   tools  messages   total  mcp tools"]
    servers = {}
    for number, path in enumerate(request_files(log_dir), start=1):
        with open(path) as handle:
            body = json.load(handle)
        tools = body.get("tools", [])
        system = size(body.get("system", ""))
        tool_tokens = size(tools)
        messages = size(body.get("messages", []))
        total = system + tool_tokens + messages
        mcp = 0
        for tool in tools:
            server = server_of(tool)
            if server is not None:
                mcp += size(tool)
                counts = servers.setdefault(server, set())
                counts.add(tool["name"])
        share = f"{mcp:,} ({round(100 * mcp / total)}%)"
        lines.append(
            f"{number:>7}  {system:>6,}  {tool_tokens:>6,}  {messages:>8,}  {total:>6,}  {share}"
        )
    for server in sorted(servers):
        lines.append(f"mcp__{server}: {len(servers[server])} tools")
    return lines


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 read_log.py <log-dir>")
    for line in summarize(sys.argv[1]):
        print(line)
