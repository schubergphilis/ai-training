"""Fixture for "Growing the evaluation set from traces": python3 traces.py ask current <q>."""

import os
import sys

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import traces

if __name__ == "__main__":
    traces.ask("current", "How many days of parental leave do I get?")
