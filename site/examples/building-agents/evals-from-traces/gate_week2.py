"""Fixture for "Growing the evaluation set from traces": the gate after week 2.

It runs python3 gate.py current and python3 gate.py stricter on a copy whose
golden-set.csv has x07 and x08 from week 1 and the two routine cases of the
exercise's good result added (cases.py).
"""

import os
import sys

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cases

if __name__ == "__main__":
    for prompt in ("current", "stricter"):
        cases.gate_with_new_cases(prompt, cases.WEEK1_CASES + cases.WEEK2_CASES)
