"""Fixture for "Workflows before agents": runs the `chain` step of workflows.py."""

import os
import sys

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import workflows

if __name__ == "__main__":
    workflows.STEPS["chain"]()
