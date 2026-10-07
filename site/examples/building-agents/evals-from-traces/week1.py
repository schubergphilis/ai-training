"""Fixture for "Growing the evaluation set from traces": python3 traces.py week 1"""

import os
import sys

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import traces

if __name__ == "__main__":
    traces.week("1")
