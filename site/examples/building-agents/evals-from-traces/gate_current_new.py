"""Fixture for "Growing the evaluation set from traces": python3 gate.py current.

The copy it gates has x07 and x08 added to golden-set.csv (week1_cases.py).
"""

import os
import sys

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import week1_cases

if __name__ == "__main__":
    week1_cases.gate_with_new_cases("current")
