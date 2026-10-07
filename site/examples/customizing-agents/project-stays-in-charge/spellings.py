"""Eleven Bash commands held against the no-push hook.

For the lesson "Keeping the project in charge". The first nine push in
different spellings, three of them from the table of what a Bash permission
rule doesn't match. The sixth gives `-C` an empty directory, which git reads
as the current one, and the seventh wraps the line with a backslash. The
eighth starts git through `env`, and in the ninth the shell expands
`{push,}` to `push`. The tenth pushes through `sh -c`, and the eleventh only
mentions the word push. Each line is the command and the hook's answer, and
the wrapped command takes two lines. The answer is `deny` when the hook
printed a deny decision, and `allow` when it printed nothing.
"""

from harness import run_guard

COMMANDS = [
    "git push origin main",
    "git -C . push origin main",
    "git -c push.default=current push origin main",
    "git 'push' origin main",
    "/usr/bin/git push origin main",
    'git -C "" push origin main',
    "git -C . \\\npush origin main",
    "env git push origin main",
    "git {push,} origin main",
    "sh -c 'git push origin main'",
    "git log --oneline --grep push",
]


def main() -> None:
    for command in COMMANDS:
        code, stdout = run_guard(command)
        if code != 0:
            answer = f"exit {code}"
        elif '"deny"' in stdout:
            answer = "deny"
        else:
            answer = "allow"
        print(f"{command}: {answer}")


if __name__ == "__main__":
    main()
