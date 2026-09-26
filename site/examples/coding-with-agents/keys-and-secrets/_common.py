"""Shared helpers for the keys-and-secrets fixtures.

Every fixture copies `fixture-repo` to a temporary directory and works on the
copy, so the committed fixture stays in its starting state. The copy is what
the learner's own edits would produce at that point in the lesson.

The fixture's `.env` is committed as `env.sample`, because the course
repository's `.gitignore` ignores every `.env`. The copy gets it back under its real
name, which is the name the lesson, the scanner and the deny rule use. A
learner working in the fixture directory copies it once, as the README says.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Callable, Optional

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture-repo")
SETTINGS = os.path.join(".agent", "settings.json")
KEY_VAR = "AGENT_API_KEY"
HELPER = "python3 vault.py"
DENY = ["Read(./.env)", "Edit(./.agent/settings.json)"]


def copy_repo(tmpdir: str) -> str:
    copy = os.path.join(tmpdir, "fixture-repo")
    shutil.copytree(REPO, copy)
    shutil.copyfile(os.path.join(copy, "env.sample"), os.path.join(copy, ".env"))
    return copy


def clean_env() -> dict[str, str]:
    """The learner's shell before the lesson sets anything: no key in it."""
    env = dict(os.environ)
    env.pop(KEY_VAR, None)
    return env


def write_settings(repo: str, key_helper: Optional[str], deny: list[str]) -> None:
    """The settings file after the lesson's edits: no key in it."""
    settings: dict[str, Any] = {"permissions": {"deny": deny}}
    if key_helper:
        settings["keyHelper"] = key_helper
    with open(os.path.join(repo, SETTINGS), "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")


def run(repo: str, script: str, env: dict[str, str]) -> int:
    result = subprocess.run([sys.executable, script], cwd=repo, env=env)
    return result.returncode


def in_copy(fn: Callable[[str], int]) -> int:
    with tempfile.TemporaryDirectory() as tmpdir:
        return fn(copy_repo(tmpdir))
