#!/usr/bin/env python3
"""The state of a wave for a resuming lead (`mise run wave-status`, #351).

Usage: mise run wave-status -- <wave-branch> <issue> [<issue> ...]

Prints JSON: per issue, its pushed `feat/<issue>-*` branches, and per
branch the last review verdict that applies to it and the next step (#417),
plus the wave branch and the local worktrees. The functions below are pure
over what `main` fetches with `git` and `gh`, so tests/test_wave_status.py
can feed them planted comments. The output is byte-identical to the
JavaScript tool this replaces (#372), so the regular expressions spell out
JavaScript's whitespace class and ASCII word boundary instead of Python's
Unicode ones.

Only comments by an account in TRUSTED_VERDICT_AUTHORS count as a verdict.
Anyone can comment on a public issue, and a lead never redoes a branch
with an approve verdict, so a `Verdict: approve` from another account
must not end a review. Every agent here posts with the maintainer's token.

A comment with a `Branch: <name>` line applies to that branch only, so the
two halves of a split issue (`feat/<issue>-<slug>-1` and `-2`) each get
their own verdict. A comment without one applies to every branch of the
issue. The last `Branch:` line outside a code fence counts, with a leading
`origin/` and trailing punctuation dropped.

Every rule for a comment that names no pushed branch, or names none on a
split issue, errs toward more work and never toward `join`. A builder
reply, an `Unfinished:` comment and a `needs changes` verdict then apply to
every branch. An approve and a lead re-check apply to none, so the branch
keeps its earlier step (`review`, `revise`, `re-check` or `lead-re-check`).
An approve or a lead re-check that names no branch applies to every branch
only when the issue has one pushed branch, as every comment did before
reviewers wrote `Branch:` lines.

A builder that stops at its turn limit posts a comment whose first line is
`Unfinished: <branch>`, then the list of what is left (#418). The branch is
`build` again, with that list as the brief, until a later trusted comment
finishes it: a verdict that applies to the branch, or a builder reply that
names the branch on a `Branch:` line.

The builder, the reviewers and the lead all post as the same trusted
accounts, so the kind of a comment comes from its text (#420), read outside
code fences only (#457): a `Verdict:` line is a review (the last one
counts), an `Unfinished:` first line is a builder at its turn limit, a line
starting `re-checked by lead` is the lead's check of a fix commit, and any
other trusted comment after a verdict is a builder reply. An approve with a
builder reply after it and no lead re-check after that reply is
`lead-re-check`, so a resumed lead never joins a fix commit that nobody read.

The dispatcher posts `Claimed by run <Name>, wave <k>` on every issue it
picks (.claude/skills/wave/SKILL.md, "Claim"), sometimes with a
parenthetical after it (#457). A trusted comment whose first line is
exactly that, and whose other lines are blank or attribution lines, is
a claim (#507). A claim applies to no branch: it is no builder reply,
it doesn't finish an `Unfinished:` branch and it doesn't clear a lead
re-check. Any other wording, such as `Claimed by run` in a fence, in
the middle of a sentence, or with a `Branch:` line, a code fence or any
other text after it, stays a reply, so a variant errs toward more work.

A lead that puts one issue's commits on another issue's branch posts a
pointer comment on the first issue with a `Branch:` line for that branch
(#455). A trusted comment on issue N whose `Branch:` line names a pushed
`feat/<M>-*` branch with M not N lists that branch under issue N too, with
a `pointer` field, and its verdict and `next` come from the comments of
issue M, where the branch is reviewed. `main` fetches the comments of M
for that even when M is not an issue of the wave. A pointer comment
applies to none of issue N's own branches.
"""

import json
import re
import subprocess
import sys
from collections.abc import Mapping, Sequence
from typing import Literal, NoReturn, NotRequired, TypedDict, cast

REPO = "schubergphilis/ai-training"
USAGE = "usage: mise run wave-status -- <wave-branch> <issue> [<issue> ...]"

# The accounts whose `Verdict:` comments a lead acts on.
TRUSTED_VERDICT_AUTHORS = ("lsimons", "lsimons-bot")

# JavaScript's `\s` (WhiteSpace and LineTerminator), which the JavaScript
# tool matched with. Python's `\s` is `str.isspace()`, a different set.
# None of these characters is special inside a regular expression class.
JS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680"
    + "".join(chr(c) for c in range(0x2000, 0x200B))
    + "\u2028\u2029\u202f\u205f\u3000\ufeff"
)
_S = f"[{JS_WHITESPACE}]"
# JavaScript's `.`, which stops at every line terminator.
_DOT = "[^\n\r\u2028\u2029]"

# The patterns use re.ASCII so `\b` and IGNORECASE work on ASCII letters
# only, as a JavaScript regular expression without the `u` flag does.
_FLAGS = re.ASCII

# A `Verdict:` line, as the reviewers end their reviews. Only lines outside code fences count.
VERDICT_LINE = re.compile(
    rf"{_S}*\**Verdict:?\**:?{_S}*\**{_S}*(approve|needs changes)\b", _FLAGS | re.IGNORECASE
)

# A `Branch:` line, as the reviewers write it next to their `Verdict:` line.
BRANCH_LINE = re.compile(
    rf"{_S}*\**Branch(?::\**|\**:){_S}*\**{_S}*`?([^{JS_WHITESPACE}`*]+)`?", _FLAGS
)

# The first line of a builder's hand-back at its turn limit.
UNFINISHED_LINE = re.compile(
    rf"{_S}*\**Unfinished(?::\**|\**:){_S}*\**{_S}*`?([^{JS_WHITESPACE}`*]*)`?",
    _FLAGS | re.IGNORECASE,
)

# The opening or closing line of a Markdown code fence, and what follows the marker.
FENCE_LINE = re.compile(rf"{_S}*(`{{3,}}|~{{3,}})({_DOT}*)\Z", _FLAGS)

# The lead's comment after it read an approved branch's fix commit.
# Only lines outside code fences count.
LEAD_RE_CHECK_LINE = re.compile(rf"{_S}*\**re-checked by lead\b", _FLAGS | re.IGNORECASE)

# The first line of the dispatcher's claim comment, `Claimed by run Seal, wave 3`,
# with an optional parenthetical after it that holds no parenthesis itself.
# The name is one capitalized word (scripts/run_name.py). Case-sensitive, as
# the dispatcher writes it.
CLAIM_LINE = re.compile(
    rf"{_S}*Claimed by run [A-Z][a-z]+, wave [1-9][0-9]*"
    + rf"(?: \([^()\n\r\u2028\u2029]*\))?{_S}*\Z",
    _FLAGS,
)

# The attribution lines at the end of every agent comment.
ATTRIBUTION_LINE = re.compile(rf"{_S}*(Co-Authored-By|Assisted-by):", _FLAGS | re.IGNORECASE)

LINE_END = re.compile(r"\r\n?|\n")
ORIGIN_PREFIX = re.compile(r"\Aorigin/")
TRAILING_PUNCTUATION = re.compile(r"[.,;:!?)\]]+\Z")
ISSUE_NUMBER = re.compile(r"[1-9][0-9]*", _FLAGS)
# The issue a `feat/<issue>-*` branch belongs to.
FEAT_BRANCH = re.compile(r"feat/([1-9][0-9]*)-", _FLAGS)
# A lone UTF-16 surrogate, which JSON.stringify writes as a `\uXXXX` escape.
LONE_SURROGATE = re.compile("[\ud800-\udfff]")

type VerdictWord = Literal["approve", "needs changes"]
type CommentKind = Literal["verdict", "unfinished", "lead-re-check", "claim", "reply"]


class IssueComment(TypedDict):
    author: str
    body: str
    createdAt: str
    url: str


class Verdict(TypedDict):
    verdict: VerdictWord
    author: str
    createdAt: str
    url: str
    commentsAfter: int
    leadReCheck: str | None


class Unfinished(TypedDict):
    author: str
    createdAt: str
    url: str
    left: str


class Worktree(TypedDict):
    path: str
    head: str | None
    branch: str | None


class Pointer(TypedDict):
    issue: int
    url: str


class BranchStatus(TypedDict):
    name: str
    verdict: Verdict | None
    unfinished: Unfinished | None
    next: str
    pointer: NotRequired[Pointer]


class IssueStatus(TypedDict):
    issue: int
    next: str
    branches: list[BranchStatus]


class WaveBranch(TypedDict):
    name: str
    pushed: bool


class WaveStatus(TypedDict):
    trustedVerdictAuthors: list[str]
    waveBranch: WaveBranch
    issues: list[IssueStatus]
    worktrees: list[Worktree]


class Args(TypedDict):
    waveBranch: str
    issues: list[int]


def js_trim(text: str) -> str:
    """`text.trim()` as JavaScript does it, with JavaScript's whitespace."""
    return text.strip(JS_WHITESPACE)


def lines_of(body: str) -> list[str]:
    """The lines of a comment.

    Comments posted from the GitHub web page come back with `\\r\\n` line
    endings, so `\\r\\n` and a lone `\\r` end a line too, and every rule that
    reads a line sees it without a trailing `\\r`.
    """
    return LINE_END.split(body)


def lines_outside_fences(body: str) -> list[str]:
    """The lines of a comment outside its code fences.

    So a quoted example doesn't count as the comment's own `Branch:`,
    `Verdict:` or `re-checked by lead` line. As in CommonMark, a fence closes
    on a line of the same marker character, at least as long as the opening
    one, with nothing after it. A backtick marker with a backtick later on
    its line is inline code (```` ```mise run fast``` ````) and opens no
    fence. A fence that never closes hides the rest of the comment.
    """
    lines: list[str] = []
    fence: str | None = None
    for line in lines_of(body):
        match = FENCE_LINE.match(line)
        marker = match.group(1) if match else None
        rest = match.group(2) if match else ""
        if fence is None:
            if marker and not (marker[0] == "`" and "`" in rest):
                fence = marker
            else:
                lines.append(line)
        elif marker and marker[0] == fence[0] and len(marker) >= len(fence) and not js_trim(rest):
            fence = None
    return lines


def verdict_of(body: str) -> VerdictWord | None:
    """The verdict on a comment's last `Verdict:` line outside a code fence.

    None when it states none. A review that shows an example verdict in a
    fence, and a reply that pastes a review in a fence, state only the
    verdict outside the fence (#457).
    """
    verdict: VerdictWord | None = None
    for line in lines_outside_fences(body):
        match = VERDICT_LINE.match(line)
        if match:
            verdict = "approve" if match.group(1).lower() == "approve" else "needs changes"
    return verdict


def is_lead_re_check(body: str) -> bool:
    """Whether a line outside a code fence starts with `re-checked by lead`."""
    return any(LEAD_RE_CHECK_LINE.match(line) for line in lines_outside_fences(body))


def comment_kind(body: str) -> CommentKind:
    """What a trusted comment is, from its text alone.

    Every agent posts as the same accounts. A verdict wins over the other kinds.
    """
    if verdict_of(body):
        return "verdict"
    if is_unfinished(body):
        return "unfinished"
    if is_lead_re_check(body):
        return "lead-re-check"
    if is_claim(body):
        return "claim"
    return "reply"


def normalize_branch(name: str) -> str:
    """A branch name without a leading `origin/` or trailing punctuation (`feat/1-x.`)."""
    return TRAILING_PUNCTUATION.sub("", ORIGIN_PREFIX.sub("", name, count=1), count=1)


def branch_of(body: str) -> str | None:
    """The branch on a comment's last `Branch:` line outside a code fence, or None.

    The word is case-sensitive and the colon required, so `Branch coverage
    ...` and `Branches pushed: ...` name no branch.
    """
    named: str | None = None
    for line in lines_outside_fences(body):
        match = BRANCH_LINE.match(line)
        if match:
            named = normalize_branch(match.group(1))
    return named


def is_unfinished(body: str) -> bool:
    """Whether a comment starts with an `Unfinished:` line, with or without a branch."""
    return UNFINISHED_LINE.match(lines_of(body)[0]) is not None


def is_claim(body: str) -> bool:
    """Whether a comment is the dispatcher's claim of the issue for a run.

    Its first line is `Claimed by run <Name>, wave <k>`, with an optional
    parenthetical, and every other line is blank or an attribution line.
    Lines inside a code fence count too. The dispatcher writes nothing else,
    so a comment with more text, such as a `Branch:` line, a fenced block
    or a fix sentence, is something else and stays a reply.
    """
    if CLAIM_LINE.match(lines_of(body)[0]) is None:
        return False
    rest = lines_of(body)[1:]
    return all(js_trim(line) == "" or ATTRIBUTION_LINE.match(line) for line in rest)


def unfinished_branch_of(body: str) -> str | None:
    """The branch an `Unfinished: <branch>` first line names, or None."""
    match = UNFINISHED_LINE.match(lines_of(body)[0])
    if not match or not match.group(1):
        return None
    return normalize_branch(match.group(1)) or None


def applies_to(body: str, branch: str, branches: Sequence[str]) -> bool:
    """Whether a comment applies to a branch.

    A claim applies to no branch. Any other comment does when it names
    that branch on its `Unfinished:` or `Branch:` line. The other
    cases err toward more work, never toward `join`:

    - A comment that names a branch the issue has no pushed branch for: a
      reply, an `Unfinished:` comment or a `needs changes` applies to every
      branch (`re-check`, `lead-re-check`, `build` or `revise`), and an
      approve or a lead re-check to none (the branch keeps its earlier step).
    - A comment that names no branch applies to every branch, except an
      approve or a lead re-check on an issue with more than one pushed
      branch, which applies to none, so a missing `Branch:` line can't join
      both halves of a split issue.
    """
    kind = comment_kind(body)
    if kind == "claim":
        return False
    named = unfinished_branch_of(body) if kind == "unfinished" else None
    if named is None:
        named = branch_of(body)
    clears = kind == "lead-re-check" or verdict_of(body) == "approve"
    if named is None:
        return not clears or len(branches) == 1
    if named in branches:
        return named == branch
    return not clears


def left_of(body: str) -> str:
    """What is left, from an `Unfinished:` comment.

    The lines after the first, without the attribution lines.
    """
    kept = [line for line in lines_of(body)[1:] if not ATTRIBUTION_LINE.match(line)]
    return js_trim("\n".join(kept))


def trusted_in_order(
    comments: Sequence[IssueComment], trusted: Sequence[str]
) -> list[IssueComment]:
    """The comments from trusted accounts, oldest first. Other accounts are dropped."""
    # gh's `createdAt` is fixed-width ISO-8601 UTC, so a plain string compare gives
    # the same order as the JavaScript tool's `localeCompare`.
    return sorted((c for c in comments if c["author"] in trusted), key=lambda c: c["createdAt"])


def open_unfinished(
    comments: Sequence[IssueComment],
    branch: str,
    branches: Sequence[str],
    trusted: Sequence[str] = TRUSTED_VERDICT_AUTHORS,
) -> Unfinished | None:
    """The last trusted `Unfinished:` comment for a branch, or None.

    None too when a later trusted comment finished the branch: a verdict
    that applies to it, or a reply that names it on a `Branch:` line. A
    reply that names no branch leaves it unfinished, so a stray note can't
    send a half-built branch to review. An `Unfinished:` comment that names
    no pushed branch of the issue, or names none, opens every branch.
    """
    found: Unfinished | None = None
    for c in trusted_in_order(comments, trusted):
        kind = comment_kind(c["body"])
        if kind == "unfinished":
            if applies_to(c["body"], branch, branches):
                found = {
                    "author": c["author"],
                    "createdAt": c["createdAt"],
                    "url": c["url"],
                    "left": left_of(c["body"]),
                }
        elif (
            applies_to(c["body"], branch, branches)
            if kind == "verdict"
            else kind == "reply" and branch_of(c["body"]) == branch
        ):
            found = None
    return found


def last_trusted_verdict(
    comments: Sequence[IssueComment],
    branch: str,
    branches: Sequence[str],
    trusted: Sequence[str] = TRUSTED_VERDICT_AUTHORS,
) -> Verdict | None:
    """The last trusted verdict that applies to a branch, or None.

    With it: `commentsAfter`, the number of trusted comments after it that
    apply to the branch and aren't a lead re-check (a builder's reply, or an
    `Unfinished:` hand-back), and `leadReCheck`, the url of a `re-checked by
    lead` comment that came after the last of those, or None.
    """
    last: Verdict | None = None
    for c in trusted_in_order(comments, trusted):
        if not applies_to(c["body"], branch, branches):
            continue
        kind = comment_kind(c["body"])
        verdict = verdict_of(c["body"])
        if verdict:
            last = {
                "verdict": verdict,
                "author": c["author"],
                "createdAt": c["createdAt"],
                "url": c["url"],
                "commentsAfter": 0,
                "leadReCheck": None,
            }
        elif last and kind == "lead-re-check":
            last["leadReCheck"] = c["url"]
        elif last:
            last["commentsAfter"] += 1
            last["leadReCheck"] = None
    return last


def utf16_order(text: str) -> bytes:
    """A sort key in UTF-16 code unit order, as JavaScript's default sort compares."""
    return text.encode("utf-16-be", "surrogatepass")


def feat_branches(heads: Sequence[str], issue: int) -> list[str]:
    """The `feat/<issue>-*` branch names in a list of remote heads, sorted."""
    return sorted((h for h in heads if h.startswith(f"feat/{issue}-")), key=utf16_order)


def owner_issue(branch: str) -> int | None:
    """The issue of a `feat/<issue>-*` branch name, or None for any other branch."""
    match = FEAT_BRANCH.match(branch)
    return int(match.group(1)) if match else None


def points_to(body: str, issue: int, heads: Sequence[str]) -> str | None:
    """The pushed branch of another issue a comment's `Branch:` line names, or None."""
    named = branch_of(body)
    if named is None or named not in heads:
        return None
    owner = owner_issue(named)
    return named if owner is not None and owner != issue else None


def own_comments(
    comments: Sequence[IssueComment], issue: int, heads: Sequence[str]
) -> list[IssueComment]:
    """The comments of an issue without its pointer comments.

    The comments that give a branch of the issue its verdict and next step,
    both in the issue's own rows and in the rows of an issue that points to
    it, so one branch always gets one `next`.
    """
    return [c for c in comments if points_to(c["body"], issue, heads) is None]


def pointer_branches(
    comments: Sequence[IssueComment],
    issue: int,
    heads: Sequence[str],
    trusted: Sequence[str] = TRUSTED_VERDICT_AUTHORS,
) -> dict[str, Pointer]:
    """The pushed branches of other issues that trusted comments on an issue point to.

    A comment points to a branch when its `Branch:` line (as `branch_of`
    reads it) names a pushed `feat/<M>-*` branch with M not the issue. Per
    branch: the owner issue M and the url of the last comment that points
    to it, in branch order. A comment from another account points nowhere.
    """
    found: dict[str, Pointer] = {}
    for c in trusted_in_order(comments, trusted):
        named = points_to(c["body"], issue, heads)
        owner = owner_issue(named) if named else None
        if named and owner is not None:
            found[named] = {"issue": owner, "url": c["url"]}
    return {name: found[name] for name in sorted(found, key=utf16_order)}


def branch_status(
    name: str, comments: Sequence[IssueComment], names: Sequence[str]
) -> BranchStatus:
    """A branch with the verdict and next step its issue's comments give it."""
    verdict = last_trusted_verdict(comments, name, names)
    unfinished = open_unfinished(comments, name, names)
    return {
        "name": name,
        "verdict": verdict,
        "unfinished": unfinished,
        "next": next_step(verdict, unfinished),
    }


def parse_ls_remote(output: str) -> list[str]:
    """Branch names from `git ls-remote --heads` output."""
    refs: list[str] = []
    for line in output.split("\n"):
        parts = line.split("\t")
        ref = parts[1] if len(parts) > 1 else ""
        if ref.startswith("refs/heads/"):
            refs.append(ref.removeprefix("refs/heads/"))
    return refs


def _field(lines: Sequence[str], prefix: str) -> str | None:
    return next((line.removeprefix(prefix) for line in lines if line.startswith(prefix)), None)


def parse_worktrees(output: str) -> list[Worktree]:
    """Worktrees from `git worktree list --porcelain` output."""
    trees: list[Worktree] = []
    for block in output.split("\n\n"):
        lines = [line for line in block.split("\n") if line]
        path = _field(lines, "worktree ")
        if not path:
            continue
        ref = _field(lines, "branch ")
        branch = ref.removeprefix("refs/heads/") if ref is not None else None
        trees.append({"path": path, "head": _field(lines, "HEAD "), "branch": branch})
    return trees


def next_step(verdict: Verdict | None, unfinished: Unfinished | None = None) -> str:
    """What a resuming lead does with a pushed branch.

    In the words of "Resuming a half-done wave" in .claude/agents/wave-lead.md:
    build the rest, join as it is, check the fix commit of an approve
    (`lead-re-check`), revise, re-check or review. An issue without a pushed
    branch is `build` too.
    """
    if unfinished:
        return "build"
    if not verdict:
        return "review"
    if verdict["verdict"] == "approve":
        if verdict["commentsAfter"] > 0 and verdict["leadReCheck"] is None:
            return "lead-re-check"
        return "join"
    return "re-check" if verdict["commentsAfter"] > 0 else "revise"


def wave_status(
    wave_branch: str,
    issues: Sequence[int],
    heads: Sequence[str],
    comments_by_issue: Mapping[int, Sequence[IssueComment]],
    worktrees: list[Worktree],
) -> WaveStatus:
    """The report `mise run wave-status` prints as JSON.

    `comments_by_issue` holds the comments of every issue of the wave and
    of every issue that owns a branch a pointer comment names. An owner
    issue that is missing counts as one without comments. A pointer
    comment applies to none of the issue's own branches, so a pointer on an
    issue that has its own branch too is no builder reply there, in its own
    rows or in the rows of an issue that points to it.
    """
    issue_statuses: list[IssueStatus] = []
    for issue in issues:
        comments = comments_by_issue.get(issue, [])
        names = feat_branches(heads, issue)
        own = own_comments(comments, issue, heads)
        branches = [branch_status(name, own, names) for name in names]
        for name, pointer in pointer_branches(comments, issue, heads).items():
            owner = pointer["issue"]
            owner_comments = own_comments(comments_by_issue.get(owner, []), owner, heads)
            status = branch_status(name, owner_comments, feat_branches(heads, owner))
            status["pointer"] = pointer
            branches.append(status)
        issue_statuses.append(
            {
                "issue": issue,
                "next": "build" if not branches else "per-branch",
                "branches": branches,
            }
        )
    return {
        "trustedVerdictAuthors": list(TRUSTED_VERDICT_AUTHORS),
        "waveBranch": {"name": wave_branch, "pushed": wave_branch in heads},
        "issues": issue_statuses,
        "worktrees": worktrees,
    }


def parse_args(argv: Sequence[str]) -> Args | str:
    """`<wave-branch> <issue> <issue> ...` from the command line, or an error message."""
    if not argv or not argv[0].startswith("wave/"):
        return "wave-status: the first argument is the wave branch, wave/<name>"
    wave_branch, rest = argv[0], argv[1:]
    if not rest:
        return "wave-status: name the issues of the wave after the branch"
    issues = [r.removeprefix("#") for r in rest]
    bad = next((r for r in issues if not ISSUE_NUMBER.fullmatch(r)), None)
    if bad is not None:
        return f"wave-status: {json.dumps(bad, ensure_ascii=False)} is not an issue number"
    return {"waveBranch": wave_branch, "issues": [int(r) for r in issues]}


def run(cmd: str, args: Sequence[str]) -> str:
    """The stdout of a command, or exit 1 with the command named. Its stderr goes to ours."""
    command = [cmd, *args]
    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            check=False,
        )
    except OSError as e:
        reason = (
            f'Executable not found in $PATH: "{cmd}"'
            if isinstance(e, FileNotFoundError)
            else str(e)
        )
        fail(command, reason)
    if result.returncode != 0:
        fail(command, f"Command failed: {' '.join(command)}")
    return result.stdout.decode("utf-8", errors="replace")


def fail(command: Sequence[str], reason: str) -> NoReturn:
    print(f"wave-status: {' '.join(command)} failed: {reason}", file=sys.stderr)
    sys.exit(1)


def _text(value: object) -> str:
    return value if isinstance(value, str) else ""


def parse_comments(output: str) -> list[IssueComment]:
    """The comments from `gh issue view --json comments` output."""
    data = cast("dict[str, object]", json.loads(output))
    comments: list[IssueComment] = []
    for raw in cast("list[dict[str, object]]", data["comments"]):
        author = raw.get("author")
        login = cast("dict[str, object]", author).get("login") if isinstance(author, dict) else None
        comments.append(
            {
                "author": _text(login),
                "body": _text(raw.get("body")),
                "createdAt": _text(raw.get("createdAt")),
                "url": _text(raw.get("url")),
            }
        )
    return comments


def issue_comments(issue: int) -> list[IssueComment]:
    """The comments of an issue, or exit 1 when gh's output isn't what `--json comments` gives.

    The JavaScript tool printed a stack trace there. This prints one line
    and exits 1 as it did.
    """
    command = ["gh", "issue", "view", str(issue), "-R", REPO, "--json", "comments"]
    output = run(command[0], command[1:])
    try:
        return parse_comments(output)
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        fail(command, f"unreadable output: {e!r}")


def to_json(value: object) -> str:
    """`JSON.stringify(value, null, 2)` and a newline, as the JavaScript tool printed.

    Non-ASCII characters stay as they are, and a lone surrogate (from a
    `\\ud800` escape in a comment) becomes a `\\uXXXX` escape again, as
    JavaScript's well-formed JSON.stringify writes it.
    """
    text = json.dumps(value, indent=2, ensure_ascii=False)
    return LONE_SURROGATE.sub(lambda m: f"\\u{ord(m.group()):04x}", text) + "\n"


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    if isinstance(args, str):
        print(args, file=sys.stderr)
        print(USAGE, file=sys.stderr)
        return 2
    heads = parse_ls_remote(run("git", ["ls-remote", "--heads", "origin"]))
    comments_by_issue = {n: issue_comments(n) for n in args["issues"]}
    for issue in args["issues"]:
        for pointer in pointer_branches(comments_by_issue[issue], issue, heads).values():
            owner = pointer["issue"]
            if owner not in comments_by_issue:
                comments_by_issue[owner] = issue_comments(owner)
    worktrees = parse_worktrees(run("git", ["worktree", "list", "--porcelain"]))
    status = wave_status(args["waveBranch"], args["issues"], heads, comments_by_issue, worktrees)
    sys.stdout.buffer.write(to_json(status).encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
