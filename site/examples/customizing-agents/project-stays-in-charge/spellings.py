"""Seven Bash commands held against the no-push hook.

For the lesson "Keeping the project in charge". The first five push in
different spellings, three of them from the table of what a Bash permission
rule doesn't match. The sixth pushes through `sh -c`, and the seventh only
mentions the word push. Each line is the command and the hook's answer:
`deny` when it printed a deny decision, `allow` when it printed nothing.
"""

from harness import run_guard

COMMANDS = [
    "git push origin main",
    "git -C . push origin main",
    "git -c push.default=current push origin main",
    "git 'push' origin main",
    "/usr/bin/git push origin main",
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
