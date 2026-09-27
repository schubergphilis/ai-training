#!/bin/sh
# UserPromptSubmit hook (.claude/settings.json, #373): names a dispatcher
# session `wave <name> <kind> <yyyy-mm-dd>` from its /wave prompt. Exit 2
# would block the prompt, so this always exits 0. The logic and its tests
# are in scripts/agent_hooks.py and tests/test_agent_hooks.py.
python3 "$(dirname "$0")/../../scripts/agent_hooks.py" session-title || true
exit 0
