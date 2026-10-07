"""server.py with its one bug fixed: the debug line goes to standard error.

Standard output carries protocol messages only. Standard error is the
channel the MCP specification gives a stdio server for its logs, and the
client may show it, keep it or drop it.

Run it by hand:  python3 server_fixed.py ../mcp-first-server/handbook
"""

import json
import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mcp-first-server")
)

import stand_in  # pyright: ignore[reportMissingImports]  # stand_in.py is in ../mcp-first-server, which the sys.path line above adds


def log(message):
    print(message, file=sys.stderr)


def serve(roots):
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        tool = request.get("params", {}).get("name", "")
        log(f"debug: {request.get('method')} {tool}".rstrip())
        response = stand_in.handle(request, roots)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("usage: python3 server_fixed.py <allowed directory> [more directories]\n")
        sys.exit(2)
    serve([os.path.realpath(arg) for arg in sys.argv[1:]])
