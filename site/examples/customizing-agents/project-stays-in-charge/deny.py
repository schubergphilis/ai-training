"""The no-push hook, fed the push from the ship-branch skill.

For the lesson "Keeping the project in charge". This is what the learner sees
when they pipe a PreToolUse call for `git push -u origin HEAD` into
`.claude/hooks/no_push_guard.py` in their copy: the JSON decision on standard
output, then the exit code that `echo "exit code $?"` prints.
"""

from harness import run_guard


def main() -> None:
    code, stdout = run_guard("git push -u origin HEAD")
    print(stdout, end="")
    print(f"exit code {code}")


if __name__ == "__main__":
    main()
