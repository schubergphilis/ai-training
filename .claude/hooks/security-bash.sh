#!/bin/sh
# PreToolUse hook on Bash for the security-reviewer agent
# (.claude/agents/security-reviewer.md): the read-only review commands of
# review-bash.sh, plus `mise run audit`, `site-audit` and `vuln`.
# The allowed list and its tests are in scripts/agent_hooks.py and
# tests/test_agent_hooks.py.
exec python3 "$(dirname "$0")/../../scripts/agent_hooks.py" security-bash
