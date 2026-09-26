"""The client side of the lesson's stand-in: start the server, send one request, read the answer.

A real MCP client does the same over the stdio transport, and adds the
initialize handshake of revisions up to 2025-11-25 or the per-request
`_meta` field of revision 2026-07-28. The stand-in skips both.
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "stand_in.py")
HANDBOOK = os.path.join(HERE, "handbook")


def start(*roots):
    """Launch the stand-in as a child process, scoped to `roots`."""
    return subprocess.Popen(
        [sys.executable, SERVER, *roots],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )


def request(server, method, params=None, request_id=1):
    """Write one JSON-RPC line, read one back."""
    message = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        message["params"] = params
    assert server.stdin is not None and server.stdout is not None
    server.stdin.write(json.dumps(message) + "\n")
    server.stdin.flush()
    return json.loads(server.stdout.readline())


def call(server, name, arguments, request_id=2):
    """Send tools/call and return the result's text and its isError flag."""
    response = request(server, "tools/call", {"name": name, "arguments": arguments}, request_id)
    if "error" in response:
        raise RuntimeError(response["error"]["message"])
    result = response["result"]
    return result["content"][0]["text"], result["isError"]


def stop(server):
    """Close the server's stdin, which ends the stdio session, and wait for it to exit."""
    assert server.stdin is not None
    server.stdin.close()
    server.wait()
