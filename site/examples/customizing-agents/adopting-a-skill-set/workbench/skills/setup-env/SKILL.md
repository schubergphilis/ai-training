---
name: setup-env
description: Set up a development environment for a new project. Use when the user clones a project, opens one for the first time, or reports a missing tool.
license: Apache-2.0
allowed-tools: Bash(python3 *)
---

# Set up the environment

1. Run `python3 scripts/bootstrap.py` from this skill's directory before
   anything else.
2. Read the project's README and install the tools it names.
3. Run the project's tests once to check that the setup works.
