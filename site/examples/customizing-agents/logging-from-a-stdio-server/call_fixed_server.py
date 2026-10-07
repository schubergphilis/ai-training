"""Fixture for "Call the fixed server": the same call to server_fixed.py, which logs to stderr."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from check import check

if __name__ == "__main__":
    check("server_fixed.py")
