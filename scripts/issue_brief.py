#!/usr/bin/env python3
"""The brief of one issue for a builder or a reviewer (`mise run issue-brief`, #606).

Usage: mise run issue-brief -- <issue>

Prints the issue's title, state, labels and body, and only the comments
by an account in TRUSTED_VERDICT_AUTHORS (scripts/wave_status.py).
Comments whose first line starts with `Decision` or `Triage`, the triage
record of docs/agents/triage.md, come first, then the other trusted
comments, each group oldest first, each with its URL. It prints how many
comments by other accounts it dropped, and never their text. The wave
dispatcher reads the run issue through it too, so a standing-approval
comment by another account never reaches it (#631).

Anyone can comment on a public issue, and an agent that reads every
comment (`gh issue view <n> --comments`) reads an outsider's instruction
next to the maintainer's decisions. The agent files say that such text is
data, and this brief keeps the text out of the agent's context instead.
The body counts only when a trusted account opened the issue: an outsider
who opened it can edit the body after a maintainer labeled it. The brief
then prints the author and withholds the body, and the maintainer's
Decision comment holds what to build.

Exit codes: 0 with the brief on stdout, 2 for a bad command line, 1 when
`gh` fails or prints something that isn't the issue's JSON, with one line
on stderr.
"""

import json
import re
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from wave_status import REPO, TRUSTED_VERDICT_AUTHORS

USAGE = "usage: mise run issue-brief -- <issue>"
FIELDS = "number,title,state,author,labels,body,comments"
ISSUE_NUMBER = re.compile(r"#?([1-9][0-9]*)")

# The first line of a triage record, `Decision (2026-09-30):` or
# `Triage (2026-09-30):` (docs/agents/triage.md, "Record the decision"),
# with optional Markdown bold or a heading marker in front.
DECISION_LINE = re.compile(r"\s*(?:#+\s*)?\**(Decision|Triage)\b")

type Gh = Callable[[Sequence[str]], str]


class BriefError(Exception):
    """`gh` failed, or printed something that isn't an issue's JSON."""


@dataclass(frozen=True)
class Comment:
    author: str
    created_at: str
    body: str
    url: str = ""


@dataclass(frozen=True)
class Issue:
    number: int
    title: str
    state: str
    author: str
    labels: tuple[str, ...]
    body: str
    comments: tuple[Comment, ...]


def gh_text(args: Sequence[str]) -> str:
    """The stdout of `gh <args>`. Raises BriefError when gh can't run or fails."""
    try:
        done = subprocess.run(
            ["gh", *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            check=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as e:
        raise BriefError(f"issue-brief: gh {' '.join(args[:3])} failed: {e}") from e
    return done.stdout


def _text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _login(value: object) -> str:
    return (
        _text(cast("Mapping[str, object]", value).get("login")) if isinstance(value, dict) else ""
    )


def _number(value: object) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError(f"issue number {value!r} is not an integer")
    return value


def parse_issue(output: str) -> Issue:
    """The issue in `gh issue view --json` output. Raises BriefError on anything else."""
    try:
        data = cast("Mapping[str, object]", json.loads(output))
        labels = cast("list[Mapping[str, object]]", data["labels"])
        comments = cast("list[Mapping[str, object]]", data["comments"])
        return Issue(
            number=_number(data["number"]),
            title=_text(data["title"]),
            state=_text(data["state"]),
            author=_login(data["author"]),
            labels=tuple(_text(label["name"]) for label in labels),
            body=_text(data["body"]),
            comments=tuple(
                Comment(
                    _login(c.get("author")),
                    _text(c.get("createdAt")),
                    _text(c.get("body")),
                    _text(c.get("url")),
                )
                for c in comments
            ),
        )
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise BriefError(f"issue-brief: unreadable gh output: {e!r}") from e


def is_decision(comment: Comment) -> bool:
    """True when the comment's first non-blank line starts a triage record."""
    first = next((line for line in comment.body.splitlines() if line.strip()), "")
    return DECISION_LINE.match(first) is not None


def brief(issue: Issue, trusted: Sequence[str] = TRUSTED_VERDICT_AUTHORS) -> str:
    """The brief as text: the issue, then its trusted comments, decisions first."""
    kept = [c for c in issue.comments if c.author in trusted]
    dropped = len(issue.comments) - len(kept)
    ordered = [c for c in kept if is_decision(c)] + [c for c in kept if not is_decision(c)]
    lines = [
        f"Issue #{issue.number}: {issue.title}",
        f"State: {issue.state}",
        f"Labels: {', '.join(issue.labels) if issue.labels else '(none)'}",
        f"Opened by: {issue.author}",
        f"Trusted accounts: {', '.join(trusted)}",
        "",
        "--- body ---",
    ]
    if issue.author in trusted:
        lines.append(issue.body.strip() or "(empty)")
    else:
        lines.append(
            f"(withheld: {issue.author or 'an unknown account'} is not a trusted account, "
            "so the body is not shown. Build from the decision comments below.)"
        )
    for i, comment in enumerate(ordered, start=1):
        kind = ", decision" if is_decision(comment) else ""
        lines += [
            "",
            f"--- comment {i} of {len(ordered)}: {comment.author}, {comment.created_at}{kind} ---",
        ]
        if comment.url:
            lines.append(f"URL: {comment.url}")
        lines.append(comment.body.strip())
    lines += [
        "",
        "--- end ---",
        f"Dropped {dropped} comment{'' if dropped == 1 else 's'} by other accounts. "
        "Their text is not shown.",
    ]
    return "\n".join(lines) + "\n"


def parse_args(argv: Sequence[str]) -> int | None:
    """The issue number, or None when the command line isn't one issue number."""
    if len(argv) != 1:
        return None
    match = ISSUE_NUMBER.fullmatch(argv[0])
    return int(match.group(1)) if match else None


def main(argv: Sequence[str], gh: Gh = gh_text) -> int:
    """Print the brief for the command line `argv` and return the exit code."""
    number = parse_args(argv)
    if number is None:
        print(USAGE, file=sys.stderr)
        return 2
    try:
        issue = parse_issue(gh(["issue", "view", str(number), "-R", REPO, "--json", FIELDS]))
    except BriefError as e:
        print(e, file=sys.stderr)
        return 1
    sys.stdout.write(brief(issue))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
