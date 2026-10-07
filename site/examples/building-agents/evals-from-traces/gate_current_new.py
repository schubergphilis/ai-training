"""Fixture for "Growing the evaluation set from traces": python3 gate.py current.

The copy it gates has x07 and x08 added to golden-set.csv (cases.py).
"""

import os
import sys

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cases

if __name__ == "__main__":
    cases.gate_with_new_cases("current", cases.WEEK1_CASES)
