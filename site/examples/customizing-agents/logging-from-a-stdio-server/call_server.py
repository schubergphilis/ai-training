"""Fixture for "Call the server": one tools/call to server.py, which logs to stdout."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from check import check

if __name__ == "__main__":
    check("server.py")
