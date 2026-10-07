"""Start one of the lesson's servers, send it one tools/call, and show both of its output streams.

The client reads one line from the server's standard output and tries to
parse it as a JSON-RPC message, which is what an MCP client does over the
stdio transport. Standard error is read separately, after the server exits.
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HANDBOOK = os.path.join(HERE, "..", "mcp-first-server", "handbook")


def check(server_file):
    server = subprocess.Popen(
        [sys.executable, os.path.join(HERE, server_file), HANDBOOK],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    message = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "list_directory", "arguments": {"path": HANDBOOK}},
    }
    assert server.stdin is not None and server.stdout is not None and server.stderr is not None
    server.stdin.write(json.dumps(message) + "\n")
    server.stdin.flush()
    line = server.stdout.readline().rstrip("\n")
    shown = line if len(line) <= 40 else line[:37] + "..."
    print(f"stdout line: {shown}")
    try:
        response = json.loads(line)
        print(f"parsed: yes, isError: {response['result']['isError']}")
    except json.JSONDecodeError as error:
        print(f"parsed: no ({error.msg})")
    server.stdin.close()
    log = server.stderr.read().strip()
    server.wait()
    print(f"stderr: {log or '(empty)'}")
