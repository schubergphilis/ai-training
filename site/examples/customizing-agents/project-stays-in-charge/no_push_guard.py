"""A Claude Code PreToolUse hook that refuses `git push` and says why.

For the lesson "Keeping the project in charge". Claude Code runs it before
every Bash command and sends the tool call as JSON on standard input. When
the command runs `git push`, the hook prints a JSON decision of `deny` with a
reason on standard output and exits with 0. Claude Code blocks the call and
shows Claude the reason. For any other command it prints nothing and exits
with 0, which means no objection.

The hook splits the command into words the way a shell does, so quotes are
removed, and into subcommands at shell operators such as `;`, `&&`, `|` and
`&`, and at line breaks. A line that ends in an unescaped backslash is joined
to the next one first, the way the shell joins it. In each subcommand it
skips leading `NAME=value` assignments and words such as `env` or `nohup`
that run the next word as the command, with their options, checks that the
program is `git` (by any path), skips git's own options, and denies when
git's command is `push`. When the program or git's command is a word the
shell would expand first, such as `{push,}` or `$CMD`, it denies when the
rest of the subcommand contains `push`. It reads only the text of the
command, so a push inside `sh -c '...'`, inside backticks or `$(...)`, from a
push word held in a variable (`X=push; git $X`), or inside a script gets
past it.

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
# Words that run the rest of the line as a command, as in `env git push`.
# Their own options, such as `time -p`, are skipped with them.
PREFIX_WORDS = {"env", "command", "time", "nohup", "exec", "builtin", "{", "!"}
# Options of a prefix word that take their value as the next word, such as
# `env -u HOME git push` and `exec -a name git push`.
PREFIX_OPTIONS_WITH_VALUE = {"-u", "-a"}
# A backslash before a line break, when an even number of backslashes (zero
# or more) comes before it. `x\\` + line break ends in an escaped backslash.
CONTINUATION = re.compile(r"(?<!\\)((?:\\\\)*)\\\n")


def subcommands(command: str) -> "list[list[str]]":
    """The words of each subcommand. Raises ValueError on unbalanced quotes."""
    # An unescaped backslash before a line break continues the line, so join it first.
    text = CONTINUATION.sub(r"\1", command).replace("\n", ";")
    lexer = shlex.shlex(text, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    result: list[list[str]] = [[]]
    for word in lexer:
        # An empty quoted word, as in `git -C "" push`, is a word and not an operator.
        if word and set(word) <= OPERATOR_CHARS:
            result.append([])
        else:
            result[-1].append(word)
    return [words for words in result if words]


def expands(word: str) -> bool:
    """True when the shell would change the word first, as in `{push,}` or `$CMD`."""
    return any(char in word for char in "{$`")


def subcommand_pushes(words: "list[str]") -> bool:
    """True when the words of one subcommand run `git push`."""
    i = 0
    after_prefix = False
    while i < len(words):
        word = words[i]
        if word in PREFIX_WORDS:
            after_prefix = True
        elif after_prefix and word in PREFIX_OPTIONS_WITH_VALUE:
            i += 1
        elif not (ASSIGNMENT.match(word) or (after_prefix and word.startswith("-"))):
            break
        i += 1
    if i == len(words):
        return False
    if expands(words[i]):
        # The program's name is only known after the shell expands it.
        return any("push" in word for word in words[i:])
    if os.path.basename(words[i]) != "git":
        return False
    i += 1
    while i < len(words):
        word = words[i]
        if word in OPTIONS_WITH_VALUE:
            i += 2
        elif word.startswith("-"):
            i += 1
        elif expands(word):
            # git's command is only known after the shell expands it.
            return any("push" in word for word in words[i:])
        else:
            return word == "push"
    return False


def pushes(command: str) -> bool:
    try:
        parts = subcommands(command)
    except ValueError:
        # Unbalanced quotes: the words can't be read, so judge the raw text.
        return "push" in command
    return any(subcommand_pushes(words) for words in parts)


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
