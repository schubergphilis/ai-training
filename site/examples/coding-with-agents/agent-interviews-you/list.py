"""Shows the committed to-do list.

todo.py saves the list back after every command, `list` included, so this
runs against a temporary copy and the committed fixture stays untouched.
"""

import os
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture-repo")

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmpdir:
        copy = os.path.join(tmpdir, "todos.json")
        shutil.copyfile(os.path.join(REPO, "todos.json"), copy)
        env = dict(os.environ, TODO_FILE=copy)
        result = subprocess.run([sys.executable, "todo.py", "list"], cwd=REPO, env=env)
    sys.exit(result.returncode)
