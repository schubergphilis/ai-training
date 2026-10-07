"""A Claude Code PreToolUse hook that refuses `git push` and says why.

For the lesson "Keeping the project in charge". Claude Code runs it before
every Bash command and sends the tool call as JSON on standard input. When
the command runs `git push`, the hook prints a JSON decision of `deny` with a
reason on standard output and exits with 0. Claude Code blocks the call and
shows Claude the reason. For any other command it prints nothing and exits
with 0, which means no objection.

The hook splits the command into words the way a shell does, so quotes are
removed, and into subcommands at shell operators such as `;`, `&&`, `|` and
`&`, and at line breaks. In each subcommand it skips leading `NAME=value`
assignments, checks that the program is `git` (by any path), skips git's own
options, and denies when git's command is `push`. It reads only the text of
the command, so a push inside `sh -c '...'` or inside a script gets past it.

When the input isn't a tool call it can read, it writes a message to
standard error and exits with 2, which also blocks the call.
"""

import json
import os
import re
import shlex
import sys

REASON = (
    "This project doesn't let agents run git push. A person reviews each branch "
    "and pushes it. Leave your commits on the current branch, don't look for "
    "another way to push, and tell the user which branch is ready."
)

# git options that take their value as the next word, such as `git -C . push`.
OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
OPERATOR_CHARS = set("();<>|&")


def subcommands(command: str) -> "list[list[str]]":
    """The words of each subcommand. Raises ValueError on unbalanced quotes."""
    lexer = shlex.shlex(command.replace("\n", ";"), posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    result: list[list[str]] = [[]]
    for word in lexer:
        if set(word) <= OPERATOR_CHARS:
            result.append([])
        else:
            result[-1].append(word)
    return [words for words in result if words]


def git_command(words: "list[str]") -> "str | None":
    """The git command a subcommand runs, such as `push`, or None if it isn't git."""
    i = 0
    while i < len(words) and ASSIGNMENT.match(words[i]):
        i += 1
    if i == len(words) or os.path.basename(words[i]) != "git":
        return None
    i += 1
    while i < len(words):
        word = words[i]
        if word in OPTIONS_WITH_VALUE:
            i += 2
        elif word.startswith("-"):
            i += 1
        else:
            return word
    return None


def pushes(command: str) -> bool:
    try:
        parts = subcommands(command)
    except ValueError:
        # Unbalanced quotes: the words can't be read, so judge the raw text.
        return "push" in command
    return any(git_command(words) == "push" for words in parts)


def main() -> int:
    try:
        call = json.load(sys.stdin)
        command = call["tool_input"]["command"]
        if not isinstance(command, str):
            raise TypeError("command must be a string")
    except (ValueError, KeyError, TypeError):
        print(
            "Blocked: the no-push hook couldn't read the tool call it was given.\n"
            "Check the hook's entry in .claude/settings.local.json.",
            file=sys.stderr,
        )
        return 2
    if not pushes(command):
        return 0
    decision = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON,
        }
    }
    print(json.dumps(decision, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
