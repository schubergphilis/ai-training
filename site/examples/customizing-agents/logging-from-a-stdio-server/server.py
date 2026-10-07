"""The stand-in file-system server of "Connecting your first tool server", with one debug line.

It answers requests with the stand-in's own code, from
../mcp-first-server/stand_in.py, and prints a debug line for each request
before it answers. The debug line goes to standard output, which on the
stdio transport carries protocol messages only, so the client reads the
debug line where it expects a reply. The lesson "Logging from a stdio
server" finds that bug and moves the line to standard error.

Run it by hand:  python3 server.py ../mcp-first-server/handbook
"""

import json
import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mcp-first-server")
)

import stand_in  # pyright: ignore[reportMissingImports]  # stand_in.py is in ../mcp-first-server, which the sys.path line above adds


def log(message):
    print(message)


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
        sys.stderr.write("usage: python3 server.py <allowed directory> [more directories]\n")
        sys.exit(2)
    serve([os.path.realpath(arg) for arg in sys.argv[1:]])
