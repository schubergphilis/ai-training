#!/usr/bin/env python3
"""The wave picker (`mise run next-wave`, docs/agents/meta-orchestration.md,
"The loop", step 1): which issues the next wave of builders should take on.

Usage: mise run next-wave -- [--size N] [--kind lessons|content|code|harness]
       [--only N,N,...] [--unblockers-first] [--json]

`main` reads the lessons of this checkout from `bun scripts/lesson-plan.mjs`
in site/ (the picker's one boundary with the site, #492) and the kind's
issues from `gh issue list`, then prints the wave as markdown or, with
`--json`, as JSON. The list is filtered on the server side (#493): every
`-l` must match, so a lessons wave fetches the open `ready-for-agent`
issues, and a content, code or harness wave the open ones that also
have the kind's label. A list
that reaches the `-L` limit stops the picker, since it may be cut short.
Any other issue the picker needs, a `Blocked by` target or an `--only`
number outside the list, it looks up with `gh issue view`, once per
number, and a lookup that fails (for a number that doesn't exist too)
stops it with exit 1. The functions between are pure apart from that
lookup, which the tests pass in, so tests/test_next_wave.py can feed them
planted lessons and issues.

Every kind reads an issue's dependencies (docs/agents/triage.md,
"Dependencies"): GitHub's `blocked by` relationship and the dependency
lines of the body. An issue is blocked by the union of its open
`blockedBy` issues and its `Blocked by #N` lines that name an open issue,
each number once (#579). An open blocker in another repository holds
the issue as unreadable, named `owner/repo#N`, since a `#N` here always
means an issue of this repository. The `blockedBy` field needs gh 2.100.0 or later,
and on an older gh the picker stops with a `next-wave:` line that names
that version, since without the field every issue would look unblocked.
A `Blocked by #N` line blocks the issue while #N is
open, an issue or a pull request. A `Not before YYYY-MM-DD` line blocks it
while the date is after today, read in UTC, so on that date it is free. A
line that starts with `Blocked by #` or `Not before` but isn't the form
whole, or names a date that doesn't exist, blocks it too, and the picker
reports the line as unreadable. A blocked issue is listed under Blocked
with the reason. For a lesson the lines come on top of its plan file's
`assumes` entries.

Four kinds of wave. A `lessons` wave (the default) picks planned lessons. A
lesson is a candidate when its plan file names an `issue`, it has no page
yet, and that issue is ready and unassigned. It is blocked when it assumes
an objective that no live lesson serves. A plan file's `assumes` entries
only name the objective, and the builder fills in the `lesson` and
`section` that teach it when the page goes live. The build
(`mise run site-build`, through MarkdownContent.astro) rejects a page
whose `assumes` names a lesson without a page, so a wave that includes
such a lesson can't land. An `after` entry that is still planned does not
block. It is reported per lesson as ordering advice for the wave lead.
Each candidate carries `unblocks`, the number of blocked candidates whose
missing objectives it serves (direct only, no transitive closure). A
blocked candidate that an issue dependency (a `blocked by` relationship,
or a `Blocked by`, `Not before` or unreadable line) also holds counts for
none, since writing the lesson doesn't free it. With
`--unblockers-first`, an area's candidates sort by that count descending
ahead of course position, so `concepts/agent-loop` comes before an
earlier lesson that unblocks nothing. The planned `after` rule still
comes first: a candidate whose own `after` is not live waits behind
the ones with none, whatever its count, since that `after` names the
lesson the plan wants written before it. Without the flag the count is
reported and the order stays earliest-in-course.

A `content` wave picks the ready, unassigned issues with the `content`
label that no plan file claims as its lesson issue, in ascending issue
number, leaving out the ones its dependencies block. Its Blocked list
is printed only when it has an entry, and in JSON it is the last key, so
a wave without dependencies prints as it did before them. An issue
with more than one of the `content`, `code` and `harness` labels breaks
the rule that the kind labels are exclusive (docs/agents/issue-tracker.md),
so a content, code or harness wave lists it under Skipped with the reason
`has more than one kind label`, and it waits until someone relabels it.
A nits issue (title starting `Nits` or `Cosmetic nits`) is left out, since
the dispatcher adds those to a wave as the nits row. Every issue kind
leaves out a planned lesson's issue (#526), with the reason
`a planned lesson (use --kind lessons)` under `--only`, since only a
lessons wave applies the `assumes` rule the build enforces.

A `code` wave (#494) picks the ready, unassigned issues with the `code`
label that no plan file claims, with the same dependencies and the
same nits rule. The issues with the `bug` label come first, then the
rest, each part in ascending issue number, which is the order run Emu
(#362) chose by hand. It prints as a content wave does, with the kind in
the heading.

A `harness` wave (#365) picks the ready, unassigned issues with the
`harness` label that no plan file claims, in ascending issue number, with
the same dependencies and the same nits rule, and prints as a code
wave does. Its default size is 4, since every issue in it adds items to
the one `After the restart` checklist the maintainer works through by
hand. The other kinds default to 6.

`only` narrows every kind to a set of issue numbers. Everything else is
reported as skipped with the reason `not in --only`, and every listed
number that did not make the wave is reported under `notPicked` with the
reason, so an unattended run never drops a number silently. A number
outside the fetched set is looked up to tell `no such open issue` (closed,
or a pull request) from `not ready-for-agent`.
"""

import json
import math
import re
import subprocess
import sys
from collections.abc import Callable, Iterable, Sequence
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal, NoReturn, NotRequired, TypedDict, cast

REPO = "schubergphilis/ai-training"
SITE = Path(__file__).resolve().parent.parent / "site"

# The skipped reason `--only` gives. `format_wave` groups these on one line.
NOT_IN_ONLY = "not in --only"

# The kind labels, of which an open issue has exactly one (docs/agents/issue-tracker.md).
KIND_LABELS = frozenset({"content", "code", "harness"})

# The skipped reason of an issue with more than one kind label (#522).
MANY_KINDS = "has more than one kind label"

# A nits issue by title, the marker the dispatcher and `/wave` use (the repo
# has no nits label). re.ASCII keeps `\b` and IGNORECASE to ASCII letters, as
# the JavaScript `/^(nits|cosmetic nits)\b/i` did. Use it with `match`.
NITS_TITLE = re.compile(r"(nits|cosmetic nits)\b", re.ASCII | re.IGNORECASE)

# The command-line values, matched whole with `fullmatch`.
POSITIVE_INTEGER = re.compile(r"[1-9][0-9]*", re.ASCII)
ISSUE_LIST = re.compile(r"[1-9][0-9]*(,[1-9][0-9]*)*", re.ASCII)

# A lone UTF-16 surrogate, which JSON.stringify writes as a `\uXXXX` escape.
LONE_SURROGATE = re.compile("[\ud800-\udfff]")

# The dependency lines of an issue body (docs/agents/triage.md,
# "Dependencies"). Each is matched whole against a trimmed line, case as written. A
# `Blocked by` line names one issue. A trimmed line that starts with one of
# the two prefixes but isn't the form whole, or whose date isn't a real
# date, is reported as unreadable, so a near miss never drops silently.
BLOCKED_BY_LINE = re.compile(r"Blocked by #([1-9][0-9]*)", re.ASCII)
NOT_BEFORE_LINE = re.compile(r"Not before ([0-9]{4}-[0-9]{2}-[0-9]{2})", re.ASCII)
DEPENDENCY_PREFIXES = ("Blocked by #", "Not before")
# The opening of a fenced code block, CommonMark 0.31.2, "Fenced code
# blocks" (https://spec.commonmark.org/0.31.2/#fenced-code-blocks): three or
# more backticks or tildes after at most three spaces, and a backtick
# fence's info string holds no backtick.
FENCE = re.compile(r" {0,3}(`{3,}(?=[^`]*$)|~{3,})")

# `gh issue list` returns at most this many issues. A list that reaches it
# may be cut short, so `main` stops with an error there.
ISSUE_LIMIT = 1000

# The first gh whose `gh issue list --json` and `gh issue view --json` have
# the `blockedBy` field (docs/agents/issue-tracker.md).
GH_MIN_VERSION = "2.100.0"

type Kind = Literal["lessons", "content", "code", "harness"]
KINDS: tuple[Kind, ...] = ("lessons", "content", "code", "harness")

# The kinds whose wave is issues picked by their label, a `ContentWave`.
type IssueKind = Literal["content", "code", "harness"]

# The wave size when `--size` isn't given.
DEFAULT_SIZE: dict[Kind, int] = {"lessons": 6, "content": 6, "code": 6, "harness": 4}


class PlannedLesson(TypedDict):
    """One lesson as `bun scripts/lesson-plan.mjs` prints it."""

    id: str
    area: str
    title: object
    issue: int | None
    position: int | None
    after: list[str]
    assumes: list[str]
    serves: list[str]
    live: bool


class ReadyIssue(TypedDict):
    number: int
    title: str
    assignees: list[str]
    labels: list[str]
    body: str
    # The open issues of this repository that GitHub's `blocked by`
    # relationship names, in the order gh gives them.
    blockedBy: list[int]
    # The open ones in another repository, as `owner/repo#N`.
    foreignBlockedBy: list[str]


class IssueState(TypedDict):
    """One issue as `gh issue view --json state,labels,assignees,url,blockedBy` gives it."""

    # OPEN or CLOSED, and MERGED for a merged pull request.
    state: str
    labels: list[str]
    assignees: list[str]
    pullRequest: bool
    # The open issues its `blocked by` relationship names, as in `ReadyIssue`.
    # No pick reads it yet: it is there so the lookup and the list read the
    # same fields and need the same gh.
    blockedBy: list[int]
    foreignBlockedBy: list[str]


# Looks up one issue that is not in the fetched set. `main` passes one that
# runs `gh issue view` and exits 1 when that fails.
type Lookup = Callable[[int], IssueState]


class Dependencies(TypedDict):
    """What an issue's dependencies hold it back by."""

    # The open issues its `blocked by` relationship or a `Blocked by` line
    # names, each once: the relationship's first, then the lines' in body order.
    blockedByIssues: list[int]
    # The latest `Not before` date when it is after today, as YYYY-MM-DD.
    notBefore: str | None
    # The dependency lines the picker can't read, trimmed, and the open
    # blockers in another repository.
    unreadable: list[str]


class WaveEntry(TypedDict):
    issue: int
    id: str
    title: object
    area: str
    position: int | None
    afterPlanned: list[str]
    # The blocked candidates this lesson serves a missing objective of.
    unblocks: int


class Blocker(TypedDict):
    """An assumed objective and the planned lessons that serve it."""

    objective: str
    servedBy: list[str]


class BlockedEntry(TypedDict):
    issue: int
    id: str
    # The assumed objectives no live lesson serves. Empty when only the
    # issue's dependencies hold it back.
    blockedBy: list[Blocker]
    # The three dependency fields, each present only when it holds something.
    blockedByIssues: NotRequired[list[int]]
    notBefore: NotRequired[str]
    unreadable: NotRequired[list[str]]


class SkippedEntry(TypedDict):
    issue: int
    # The lesson id. A content issue has none.
    id: NotRequired[str]
    reason: str


class WaitingArea(TypedDict):
    area: str
    lessons: list[WaveEntry]


class NotPickedEntry(TypedDict):
    """A number from `only` that is not in the wave, and why."""

    issue: int
    reason: str


class LessonsWave(TypedDict):
    kind: Literal["lessons"]
    size: int
    only: list[int] | None
    unblockersFirst: bool
    wave: list[WaveEntry]
    blocked: list[BlockedEntry]
    skipped: list[SkippedEntry]
    waiting: list[WaitingArea]
    notPicked: list[NotPickedEntry]


class ContentEntry(TypedDict):
    issue: int
    title: str
    labels: list[str]


class ContentBlockedEntry(TypedDict):
    issue: int
    title: str
    blockedByIssues: NotRequired[list[int]]
    notBefore: NotRequired[str]
    unreadable: NotRequired[list[str]]


class ContentWave(TypedDict):
    """A wave of issues picked by their kind label: content, code or harness."""

    kind: IssueKind
    size: int
    only: list[int] | None
    wave: list[ContentEntry]
    skipped: list[SkippedEntry]
    waiting: list[ContentEntry]
    notPicked: list[NotPickedEntry]
    # Last, so the keys before it keep the order they had without it.
    blocked: list[ContentBlockedEntry]


type Wave = LessonsWave | ContentWave


class Args(TypedDict):
    size: int
    kind: Kind
    only: list[int] | None
    unblockersFirst: bool
    json: bool


def today_utc() -> date:
    """Today's date in UTC, the one clock a `Not before` line is read by."""
    return datetime.now(UTC).date()


def no_lookup(number: int) -> IssueState:
    """The default `lookup`: a caller that needs one must pass it."""
    raise ValueError(f"next-wave: issue #{number} is not in the fetched set and there is no lookup")


def dependency_lines(body: str) -> tuple[list[int], list[str], list[str]]:
    """The `Blocked by` issue numbers, the `Not before` dates (unchecked
    YYYY-MM-DD text) and the unreadable dependency lines of a body.

    A line counts when, trimmed, it matches the form whole, with the case
    as written. A trimmed line that starts with `Blocked by #` or
    `Not before` and doesn't match is unreadable. Lines inside a fenced code
    block and quoted lines (starting with `>`) don't count, since they show
    a line rather than state one.
    """
    blocked_by: list[int] = []
    not_before: list[str] = []
    unreadable: list[str] = []
    fence: str | None = None
    for raw in body.splitlines():
        line = raw.strip()
        opening = FENCE.match(raw.rstrip())
        if fence is not None:
            # A fence closes on a line of only its character, at least as long
            # as the opening, after at most three spaces.
            if (
                opening
                and opening.group(1)[0] == fence[0]
                and line == opening.group(1)
                and len(line) >= len(fence)
            ):
                fence = None
            continue
        if opening:
            fence = opening.group(1)
            continue
        if line.startswith(">"):
            continue
        if m := BLOCKED_BY_LINE.fullmatch(line):
            blocked_by.append(int(m.group(1)))
        elif m := NOT_BEFORE_LINE.fullmatch(line):
            not_before.append(m.group(1))
        elif line.startswith(DEPENDENCY_PREFIXES):
            unreadable.append(line)
    return blocked_by, not_before, unreadable


def read_date(value: str) -> date | None:
    """The date of YYYY-MM-DD text, or None when it isn't a real date."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def dependencies(
    body: str,
    is_open: Callable[[int], bool],
    today: date,
    native: Sequence[int] = (),
    foreign: Sequence[str] = (),
) -> Dependencies:
    """What an issue's dependencies hold the issue back by.

    `native` is the open issues of this repository in its `blocked by`
    relationship, and each one holds it. `foreign` is the open ones in
    another repository (`owner/repo#N`). A `#N` in the output always means
    an issue here, so each of those holds the issue as unreadable, as
    `Blocked by owner/repo#N (another repository)`, and plays no part in
    matching the lines' numbers. A `Blocked by #N` line holds it while #N is open. The
    native blockers come first, then the lines' blockers in body order,
    and a number that the relationship and a line both name, or two lines,
    counts once. A `Not before` line
    holds it while its date is after `today`, so on that date it is free.
    With two, the later date counts. An unreadable line holds the issue
    too, since the picker can't tell what it asks for.
    """
    blocked_by, not_before, unreadable = dependency_lines(body)
    unreadable += [f"Blocked by {x} (another repository)" for x in foreign]
    lines_open = [n for n in dict.fromkeys(blocked_by) if n in native or is_open(n)]
    open_blockers = list(dict.fromkeys([*native, *lines_open]))
    dates: list[date] = []
    for value in not_before:
        d = read_date(value)
        if d is None:
            unreadable.append(f"Not before {value}")
        else:
            dates.append(d)
    latest = max(dates, default=None)
    return {
        "blockedByIssues": open_blockers,
        "notBefore": latest.isoformat() if latest is not None and latest > today else None,
        "unreadable": unreadable,
    }


def held(d: Dependencies) -> bool:
    return bool(d["blockedByIssues"] or d["notBefore"] or d["unreadable"])


def add_dependency_fields(entry: BlockedEntry | ContentBlockedEntry, d: Dependencies) -> None:
    """Add the dependency fields to a blocked entry, each only when it holds something."""
    if d["blockedByIssues"]:
        entry["blockedByIssues"] = d["blockedByIssues"]
    if d["notBefore"] is not None:
        entry["notBefore"] = d["notBefore"]
    if d["unreadable"]:
        entry["unreadable"] = d["unreadable"]


def dependency_reasons(entry: BlockedEntry | ContentBlockedEntry) -> list[str]:
    """The dependency fields of a blocked entry as words, in field order."""
    reasons: list[str] = []
    if "blockedByIssues" in entry:
        reasons.append(f"blocked by {', '.join(f'#{n}' for n in entry['blockedByIssues'])}")
    if "notBefore" in entry:
        reasons.append(f"not before {entry['notBefore']}")
    if "unreadable" in entry:
        lines = ", ".join(code(x) for x in entry["unreadable"])
        reasons.append(f"unreadable dependency line {lines}")
    return reasons


def open_checker(known_open: Iterable[int], lookup: Lookup) -> Callable[[int], bool]:
    """Whether an issue is open: every number in `known_open` is, and any
    other is looked up. A pull request counts by its state too."""
    known = set(known_open)

    def is_open(number: int) -> bool:
        return number in known or lookup(number)["state"] == "OPEN"

    return is_open


def pick_wave(
    lessons: Sequence[PlannedLesson],
    ready_issues: Sequence[ReadyIssue],
    lookup: Lookup = no_lookup,
    size: int | None = None,
    kind: str = "lessons",
    only: Iterable[int] | None = None,
    unblockers_first: bool = False,
    today: date | None = None,
) -> Wave:
    """Pick the next wave of the given `kind`.

    `ready_issues` is what `main` fetched for the kind (every one is open),
    and `lookup` gives the state of any other issue that a `Blocked by`
    line or `only` names. `size` defaults to the kind's `DEFAULT_SIZE`, and
    `today` to `today_utc()`.
    """
    day = today if today is not None else today_utc()
    if kind == "content" or kind == "code" or kind == "harness":
        n = size if size is not None else DEFAULT_SIZE[kind]
        return pick_issue_wave(kind, lessons, ready_issues, lookup, n, only, day)
    if kind != "lessons":
        raise ValueError(f"next-wave: unknown kind {json.dumps(kind, ensure_ascii=False)}")
    n = size if size is not None else DEFAULT_SIZE["lessons"]
    return pick_lessons_wave(lessons, ready_issues, lookup, n, only, unblockers_first, day)


def pick_lessons_wave(
    lessons: Sequence[PlannedLesson],
    ready_issues: Sequence[ReadyIssue],
    lookup: Lookup = no_lookup,
    size: int = 6,
    only: Iterable[int] | None = None,
    unblockers_first: bool = False,
    today: date | None = None,
) -> LessonsWave:
    """Pick the next lessons wave.

    Within an area, candidates with no planned `after` come first, then
    course position (a lesson no course lists has position `None` and sorts
    last). With `unblockers_first`, the `unblocks` count (descending) sits
    between the two, so the planned `after` rule still comes first and
    course position breaks a tie on the count. The wave takes one lesson per
    area in turn, in area order, until `size` is reached or the areas run
    out, so every area gets progress. Every candidate ends up in exactly one
    of the four lists: `wave`, `blocked` (it assumes an objective no live
    lesson serves, or its issue's dependencies hold it), `skipped` (the
    issue is not ready, is assigned, or is not in `only`) or `waiting` (fit
    for a wave, but this one is full), grouped by area.
    """
    day = today if today is not None else today_utc()
    live = {lesson["id"] for lesson in lessons if lesson["live"]}
    ready = {i["number"]: i for i in ready_issues}
    is_open = open_checker(ready, lookup)
    only_list = list(only) if only is not None else None
    only_set = set(only_list) if only_list is not None else None
    # Planned lesson issue to its lesson id, live pages included.
    planned_issues: dict[int, str] = {}

    # Objectives some live lesson serves, and objective to the planned lessons that serve it.
    served_live: set[str] = set()
    served_planned: dict[str, list[str]] = {}
    for lesson in lessons:
        for objective in lesson["serves"]:
            if lesson["live"]:
                served_live.add(objective)
            else:
                served_planned.setdefault(objective, []).append(lesson["id"])

    # Candidates per area, in area order.
    per_area: dict[str, list[WaveEntry]] = {}
    # Candidate lesson id to the objectives it serves, for the `unblocks` count.
    candidate_serves: dict[str, list[str]] = {}
    blocked: list[BlockedEntry] = []
    skipped: list[SkippedEntry] = []

    for lesson in lessons:
        candidates = per_area.setdefault(lesson["area"], [])
        number = lesson["issue"]
        lesson_id = lesson["id"]
        if number is None:
            continue
        planned_issues[number] = lesson_id
        if lesson["live"]:
            continue
        if only_set is not None and number not in only_set:
            skipped.append({"issue": number, "id": lesson_id, "reason": NOT_IN_ONLY})
            continue
        issue = ready.get(number)
        if issue is None:
            skipped.append(
                {"issue": number, "id": lesson_id, "reason": "issue is not ready-for-agent"}
            )
            continue
        if issue["assignees"]:
            reason = f"issue is assigned to {', '.join(issue['assignees'])}"
            skipped.append({"issue": number, "id": lesson_id, "reason": reason})
            continue
        blocked_by: list[Blocker] = [
            {"objective": o, "servedBy": list(served_planned.get(o, []))}
            for o in dict.fromkeys(lesson["assumes"])
            if o not in served_live
        ]
        deps = dependencies(
            issue["body"], is_open, day, issue["blockedBy"], issue["foreignBlockedBy"]
        )
        if blocked_by or held(deps):
            entry: BlockedEntry = {"issue": number, "id": lesson_id, "blockedBy": blocked_by}
            add_dependency_fields(entry, deps)
            blocked.append(entry)
            continue
        candidate_serves[lesson_id] = lesson["serves"]
        candidates.append(
            {
                "issue": number,
                "id": lesson_id,
                "title": lesson["title"] if lesson["title"] is not None else issue["title"],
                "area": lesson["area"],
                "position": lesson["position"],
                "afterPlanned": [x for x in lesson["after"] if x not in live],
                "unblocks": 0,
            }
        )

    # The blocked list is complete only after every area, so the count and the sort come here.
    def sort_key(c: WaveEntry) -> tuple[int, int, float]:
        has_after = 1 if c["afterPlanned"] else 0
        score = -c["unblocks"] if unblockers_first else 0
        rank = c["position"] if c["position"] is not None else math.inf
        return (has_after, score, rank)

    # A lesson that a blocker issue, a `Not before` or an unreadable line also holds
    # stays blocked when the serving lesson is written, so it counts for no one.
    freeable = [
        b for b in blocked if not ("blockedByIssues" in b or "notBefore" in b or "unreadable" in b)
    ]
    for candidates in per_area.values():
        for c in candidates:
            serves = set(candidate_serves[c["id"]])
            c["unblocks"] = sum(
                1 for b in freeable if any(x["objective"] in serves for x in b["blockedBy"])
            )
        candidates.sort(key=sort_key)

    wave: list[WaveEntry] = []
    taken = True
    while len(wave) < size and taken:
        taken = False
        for candidates in per_area.values():
            if len(wave) >= size:
                break
            if not candidates:
                continue
            wave.append(candidates.pop(0))
            taken = True
    waiting: list[WaitingArea] = [
        {"area": area, "lessons": candidates} for area, candidates in per_area.items() if candidates
    ]

    not_picked: list[NotPickedEntry] = []
    in_wave = {w["issue"] for w in wave}
    for n in only_list or []:
        if n in in_wave:
            continue
        lesson_id = planned_issues.get(n)
        b = next((x for x in blocked if x["issue"] == n), None)
        s = next((x for x in skipped if x["issue"] == n), None)
        if lesson_id is None:
            reason = (
                "not a planned lesson (use --kind content)"
                if n in ready or is_open_issue(lookup(n))
                else "no such open issue"
            )
        elif lesson_id in live:
            reason = f"lesson {lesson_id} is live"
        elif b is not None:
            reason = blocked_by_text(b)
        elif s is not None:
            reason = (
                "assigned" if s["reason"].startswith("issue is assigned") else "not ready-for-agent"
            )
        else:
            reason = "waiting (wave full)"
        not_picked.append({"issue": n, "reason": reason})
    return {
        "kind": "lessons",
        "size": size,
        "only": only_list,
        "unblockersFirst": unblockers_first,
        "wave": wave,
        "blocked": blocked,
        "skipped": skipped,
        "waiting": waiting,
        "notPicked": not_picked,
    }


def is_open_issue(state: IssueState) -> bool:
    """An open issue, where a pull request doesn't count."""
    return state["state"] == "OPEN" and not state["pullRequest"]


def blocked_by_text(b: BlockedEntry) -> str:
    """Why a lesson is blocked, for its `notPicked` reason.

    The lessons that serve its missing objectives or, when no lesson serves
    them, the objectives themselves, after `blocked by`. Then its dependency
    reasons. A lesson blocked by objectives alone reads as it did before
    the dependency lines.
    """
    reasons: list[str] = []
    if b["blockedBy"]:
        lessons = list(dict.fromkeys(lesson for x in b["blockedBy"] for lesson in x["servedBy"]))
        if lessons:
            reasons.append(f"blocked by {', '.join(lessons)}")
        else:
            objectives = ", ".join(x["objective"] for x in b["blockedBy"])
            reasons.append(f"blocked by objective {objectives} (no lesson serves it)")
    return "; ".join(reasons + dependency_reasons(b))


def pick_content_wave(
    lessons: Sequence[PlannedLesson],
    ready_issues: Sequence[ReadyIssue],
    lookup: Lookup = no_lookup,
    size: int = 6,
    only: Iterable[int] | None = None,
    today: date | None = None,
) -> ContentWave:
    """Pick the next content wave (`pick_issue_wave` with kind `content`)."""
    return pick_issue_wave("content", lessons, ready_issues, lookup, size, only, today)


def pick_code_wave(
    lessons: Sequence[PlannedLesson],
    ready_issues: Sequence[ReadyIssue],
    lookup: Lookup = no_lookup,
    size: int = 6,
    only: Iterable[int] | None = None,
    today: date | None = None,
) -> ContentWave:
    """Pick the next code wave (`pick_issue_wave` with kind `code`)."""
    return pick_issue_wave("code", lessons, ready_issues, lookup, size, only, today)


def pick_harness_wave(
    lessons: Sequence[PlannedLesson],
    ready_issues: Sequence[ReadyIssue],
    lookup: Lookup = no_lookup,
    size: int = DEFAULT_SIZE["harness"],
    only: Iterable[int] | None = None,
    today: date | None = None,
) -> ContentWave:
    """Pick the next harness wave (`pick_issue_wave` with kind `harness`)."""
    return pick_issue_wave("harness", lessons, ready_issues, lookup, size, only, today)


def issue_order(kind: IssueKind) -> Callable[[ReadyIssue], tuple[int, int]]:
    """The sort key of a kind's candidates.

    A code wave puts the `bug` issues first, then ascending number. A
    content or harness wave goes by ascending number alone.
    """

    def key(i: ReadyIssue) -> tuple[int, int]:
        first = 0 if kind == "code" and "bug" in i["labels"] else 1
        return (first, i["number"])

    return key


def pick_issue_wave(
    kind: IssueKind,
    lessons: Sequence[PlannedLesson],
    ready_issues: Sequence[ReadyIssue],
    lookup: Lookup = no_lookup,
    size: int = 6,
    only: Iterable[int] | None = None,
    today: date | None = None,
) -> ContentWave:
    """Pick the next wave of issues with the label `kind`.

    Ready, unassigned issues with the kind's label that no plan file
    names as its `issue`, in `issue_order`. A nits issue is left out. An
    issue with more than one kind label is skipped, ahead of the planned
    and nits rules. The first `size` are the wave and the rest wait. An
    assigned issue, or one outside `only`, is skipped with the reason. One
    that its dependencies hold is blocked.
    """
    day = today if today is not None else today_utc()
    ready = {i["number"]: i for i in ready_issues}
    is_open = open_checker(ready, lookup)
    only_list = list(only) if only is not None else None
    only_set = set(only_list) if only_list is not None else None
    # A planned lesson's issue is a lessons-wave issue, so every issue kind
    # leaves it out (#526). Only a lessons wave applies its `assumes` rule.
    planned = {lesson["issue"] for lesson in lessons if lesson["issue"] is not None}
    skipped: list[SkippedEntry] = []
    blocked: list[ContentBlockedEntry] = []
    candidates: list[ContentEntry] = []
    for i in sorted(ready_issues, key=issue_order(kind)):
        labels = i["labels"]
        if kind not in labels:
            continue
        # A label error is reported, so it gets fixed, ahead of the silent skips.
        many = has_many_kinds(labels)
        if not many and (i["number"] in planned or NITS_TITLE.match(i["title"])):
            continue
        if only_set is not None and i["number"] not in only_set:
            skipped.append({"issue": i["number"], "reason": NOT_IN_ONLY})
            continue
        if many:
            skipped.append({"issue": i["number"], "reason": MANY_KINDS})
            continue
        if i["assignees"]:
            reason = f"issue is assigned to {', '.join(i['assignees'])}"
            skipped.append({"issue": i["number"], "reason": reason})
            continue
        deps = dependencies(i["body"], is_open, day, i["blockedBy"], i["foreignBlockedBy"])
        if held(deps):
            entry: ContentBlockedEntry = {"issue": i["number"], "title": i["title"]}
            add_dependency_fields(entry, deps)
            blocked.append(entry)
            continue
        candidates.append({"issue": i["number"], "title": i["title"], "labels": labels})
    wave = candidates[:size]
    waiting = candidates[size:]
    in_wave = {w["issue"] for w in wave}
    not_picked: list[NotPickedEntry] = []
    for n in only_list or []:
        if n in in_wave:
            continue
        issue = ready.get(n)
        if issue is None:
            reason = issue_reason_outside(kind, n, lookup(n), planned)
        elif kind in issue["labels"] and has_many_kinds(issue["labels"]):
            reason = MANY_KINDS
        elif n in planned:
            reason = "a planned lesson (use --kind lessons)"
        elif kind not in issue["labels"]:
            reason = f"not a {kind} issue"
        elif NITS_TITLE.match(issue["title"]):
            reason = "a nits issue (the dispatcher adds it as the nits row)"
        elif issue["assignees"]:
            reason = "assigned"
        elif (b := next((x for x in blocked if x["issue"] == n), None)) is not None:
            reason = "; ".join(dependency_reasons(b))
        else:
            reason = "waiting (wave full)"
        not_picked.append({"issue": n, "reason": reason})
    return {
        "kind": kind,
        "size": size,
        "only": only_list,
        "wave": wave,
        "skipped": skipped,
        "waiting": waiting,
        "notPicked": not_picked,
        "blocked": blocked,
    }


def has_many_kinds(labels: Iterable[str]) -> bool:
    """Whether the labels hold more than one of the kind labels."""
    return len(KIND_LABELS.intersection(labels)) > 1


def issue_reason_outside(kind: IssueKind, n: int, state: IssueState, planned: set[int]) -> str:
    """The `notPicked` reason of an `only` number outside the fetched set, from its lookup."""
    if not is_open_issue(state):
        return "no such open issue"
    if "ready-for-agent" not in state["labels"]:
        return "not ready-for-agent"
    if kind in state["labels"] and has_many_kinds(state["labels"]):
        return MANY_KINDS
    if n in planned:
        return "a planned lesson (use --kind lessons)"
    if kind not in state["labels"]:
        return f"not a {kind} issue"
    # Open, ready and of the kind, yet not fetched: its labels changed since the list call.
    return "not in the fetched issues (run the picker again)"


def code(s: str) -> str:
    return f"`{s}`"


def skipped_lines(skipped: Sequence[SkippedEntry]) -> list[str]:
    """The skipped list as markdown lines.

    The `not in --only` entries are one line of issue numbers, since a
    whitelist skips nearly everything.
    """
    lines: list[str] = []
    not_in_only = [s for s in skipped if s["reason"] == NOT_IN_ONLY]
    if not_in_only:
        lines.append(f"- {NOT_IN_ONLY}: {' '.join(f'#{s["issue"]}' for s in not_in_only)}")
    for s in skipped:
        if s["reason"] == NOT_IN_ONLY:
            continue
        lesson_id = s.get("id")
        suffix = f" {code(lesson_id)}" if lesson_id else ""
        lines.append(f"- #{s['issue']}{suffix}: {s['reason']}")
    return lines


def format_wave(result: Wave) -> str:
    """The result as markdown.

    A lessons wave is a table (with an `Unblocks` column under
    `unblockersFirst`), then the blocked, skipped and waiting lists. A
    content, code or harness wave is a table of issue, title and labels, then the
    skipped and waiting lists. Lesson ids are in code spans, so cspell
    skips them.
    """
    if result["kind"] != "lessons":
        return format_content_wave(result)
    lines = [f"## Wave ({len(result['wave'])} of {result['size']})", ""]
    unblocks = result["unblockersFirst"]
    lines.append(
        f"| Issue | Lesson | Course position | Planned `after` |{' Unblocks |' if unblocks else ''}"
    )
    lines.append(
        f"| ----- | ------ | --------------- | --------------- |{' -------- |' if unblocks else ''}"
    )
    for w in result["wave"]:
        position = (
            f"{w['area']} (unlisted)" if w["position"] is None else f"{w['area']} {w['position']}"
        )
        after = ", ".join(code(x) for x in w["afterPlanned"]) or "-"
        count = f" {w['unblocks']} |" if unblocks else ""
        lines.append(f"| #{w['issue']} | {code(w['id'])} | {position} | {after} |{count}")
    lines += ["", f"## Blocked ({len(result['blocked'])})", ""]
    for b in result["blocked"]:
        why = [
            f"{code(x['objective'])} ("
            + (
                f"served by {', '.join(code(s) for s in x['servedBy'])}"
                if x["servedBy"]
                else "no lesson serves it"
            )
            + ")"
            for x in b["blockedBy"]
        ]
        reasons = [f"assumes {'; '.join(why)}"] if why else []
        reasons += dependency_reasons(b)
        lines.append(f"- #{b['issue']} {code(b['id'])}: {'; '.join(reasons)}")
    lines += ["", f"## Skipped ({len(result['skipped'])})", "", *skipped_lines(result["skipped"])]
    count = sum(len(w["lessons"]) for w in result["waiting"])
    lines += ["", f"## Waiting for a later wave ({count})", ""]
    for w in result["waiting"]:
        lines.append(f"- {w['area']}: {' '.join(f'#{x["issue"]}' for x in w['lessons'])}")
    lines += not_picked_lines(result)
    return "\n".join(lines) + "\n"


def not_picked_lines(result: Wave) -> list[str]:
    """The `Not picked from --only` section, present whenever `only` was given."""
    if result["only"] is None:
        return []
    lines = ["", f"## Not picked from --only ({len(result['notPicked'])})", ""]
    for n in result["notPicked"]:
        lines.append(f"- #{n['issue']}: {n['reason']}")
    return lines


def format_content_wave(result: ContentWave) -> str:
    lines = [f"## Wave ({len(result['wave'])} of {result['size']}, {result['kind']})", ""]
    lines += ["| Issue | Title | Labels |", "| ----- | ----- | ------ |"]
    for w in result["wave"]:
        labels = ", ".join(code(label) for label in w["labels"])
        title = w["title"].replace("|", "\\|")
        lines.append(f"| #{w['issue']} | {title} | {labels} |")
    # Only when there is one, so a wave without dependencies prints as it did before them.
    if result["blocked"]:
        lines += ["", f"## Blocked ({len(result['blocked'])})", ""]
        for b in result["blocked"]:
            lines.append(f"- #{b['issue']} {b['title']}: {'; '.join(dependency_reasons(b))}")
    lines += ["", f"## Skipped ({len(result['skipped'])})", "", *skipped_lines(result["skipped"])]
    lines += ["", f"## Waiting for a later wave ({len(result['waiting'])})", ""]
    for w in result["waiting"]:
        lines.append(f"- #{w['issue']} {w['title']}")
    lines += not_picked_lines(result)
    return "\n".join(lines) + "\n"


def _quote(raw: str) -> str:
    """`JSON.stringify` of a command-line string, as the JavaScript tool's errors wrote it."""
    return json.dumps(raw, ensure_ascii=False)


def parse_args(argv: Sequence[str]) -> Args | str:
    """The options from the command line, or an error message.

    `--size N` (a positive integer in plain digits, by default the kind's
    `DEFAULT_SIZE`: 4 for `harness` and 6 for the others), `--kind`
    (`lessons`, the default, `content`, `code` or `harness`), `--only N,N,...` (issue numbers,
    the whitelist), `--unblockers-first` (rank a lesson that unblocks other
    candidates ahead of the course order within its area) and `--json`. A
    flag that takes a value and comes last gets the empty string.
    """
    args: Args = {
        "size": 6,
        "kind": "lessons",
        "only": None,
        "unblockersFirst": False,
        "json": False,
    }
    size_given = False
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--json":
            args["json"] = True
        elif arg == "--unblockers-first":
            args["unblockersFirst"] = True
        elif arg in ("--size", "--kind", "--only"):
            i += 1
            raw = argv[i] if i < len(argv) else ""
            if arg == "--size":
                if not POSITIVE_INTEGER.fullmatch(raw):
                    return f"next-wave: --size needs a positive integer, got {_quote(raw)}"
                args["size"] = int(raw)
                size_given = True
            elif arg == "--kind":
                kind = read_kind(raw)
                if kind is None:
                    return f"next-wave: --kind is {kinds_text()}, got {_quote(raw)}"
                args["kind"] = kind
            else:
                if not ISSUE_LIST.fullmatch(raw):
                    return (
                        "next-wave: --only needs issue numbers separated by commas,"
                        f" got {_quote(raw)}"
                    )
                args["only"] = [int(n) for n in raw.split(",")]
        else:
            return f"next-wave: unknown argument {arg}"
        i += 1
    if not size_given:
        args["size"] = DEFAULT_SIZE[args["kind"]]
    return args


def read_kind(raw: str) -> Kind | None:
    """The kind that `raw` names exactly, or None."""
    for kind in KINDS:
        if kind == raw:
            return kind
    return None


def kinds_text() -> str:
    """Every kind, for the `--kind` error: `lessons, content, code or harness`."""
    return f"{', '.join(KINDS[:-1])} or {KINDS[-1]}"


# What gh prints on stderr for a `--json` field it doesn't have, as gh
# 2.101.0 does for any unknown field.
UNKNOWN_BLOCKED_BY = 'Unknown JSON field: "blockedBy"'


def run(command: Sequence[str], cwd: Path | None = None) -> str:
    """The stdout of a command, or exit 1 with the command named.

    Its stderr goes to ours once the command is done. A gh that fails on an
    unknown `blockedBy` field is older than `GH_MIN_VERSION`, and the exit
    line says so.
    """
    try:
        result = subprocess.run(
            list(command),
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=False,
        )
    except OSError as e:
        reason = (
            f'Executable not found in $PATH: "{command[0]}"'
            if isinstance(e, FileNotFoundError)
            else str(e)
        )
        fail(command, reason)
    err = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
    sys.stderr.write(err)
    if result.returncode != 0:
        if command[0] == "gh" and UNKNOWN_BLOCKED_BY in err:
            fail(
                command, f"this gh has no blockedBy field, which needs gh {GH_MIN_VERSION} or later"
            )
        fail(command, f"Command failed: {' '.join(command)}")
    return result.stdout.decode("utf-8", errors="replace")


def fail(command: Sequence[str], reason: str) -> NoReturn:
    """Exit 1 with one line that names the command.

    A `gh` command is named by its first three words (`gh issue list`), as
    the JavaScript tool named it, and the reason repeats it in full.
    """
    name = " ".join(command[:3]) if command[0] == "gh" else " ".join(command)
    print(f"next-wave: {name} failed: {reason}", file=sys.stderr)
    sys.exit(1)


def _strings(value: object) -> list[str]:
    return (
        [x for x in cast("list[object]", value) if isinstance(x, str)]
        if isinstance(value, list)
        else []
    )


def parse_lesson_plan(output: str) -> list[PlannedLesson]:
    """The lessons from `bun scripts/lesson-plan.mjs` output."""
    data = cast("dict[str, object]", json.loads(output))
    lessons: list[PlannedLesson] = []
    for raw in cast("list[dict[str, object]]", data["lessons"]):
        issue = raw["issue"]
        position = raw["position"]
        lessons.append(
            {
                "id": cast("str", raw["id"]),
                "area": cast("str", raw["area"]),
                "title": raw["title"],
                "issue": issue if isinstance(issue, int) else None,
                "position": position if isinstance(position, int) else None,
                "after": _strings(raw["after"]),
                "assumes": _strings(raw["assumes"]),
                "serves": _strings(raw["serves"]),
                "live": raw["live"] is True,
            }
        )
    return lessons


# The `url` of a `blockedBy` node: the repository, then the number.
BLOCKER_URL = re.compile(r"https://github\.com/([^/]+/[^/]+)/(?:issues|pull)/([1-9][0-9]*)")


def native_blockers(raw: dict[str, object]) -> tuple[list[int], list[str]]:
    """The open issues of one issue's `blockedBy` field, as gh 2.100.0 gives
    it: `{"nodes": [{"number": N, "state": "OPEN", "url": U, ...}], "totalCount": T}`.

    The numbers of the open ones in this repository (`REPO`), and the open
    ones in another repository as `owner/repo#N`, told apart by the
    repository in `url`. A node has no other field that names it. A
    missing field is an error that names the gh version, and so is a list
    cut short (fewer nodes than `totalCount`), since a blocker left out
    could be an open one.
    """
    if "blockedBy" not in raw:
        raise KeyError(f"no blockedBy field, which needs gh {GH_MIN_VERSION} or later")
    field = raw["blockedBy"]
    if not isinstance(field, dict):
        raise TypeError(f"blockedBy {field!r}")
    field = cast("dict[str, object]", field)
    nodes = field.get("nodes")
    total = field.get("totalCount")
    if not isinstance(nodes, list) or not isinstance(total, int):
        raise TypeError(f"blockedBy {field!r}")
    nodes = cast("list[object]", nodes)
    if len(nodes) < total:
        raise ValueError(f"blockedBy lists {len(nodes)} of {total} blockers")
    numbers: list[int] = []
    foreign: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            raise TypeError(f"blockedBy node {node!r}")
        node = cast("dict[str, object]", node)
        number = node.get("number")
        state = node.get("state")
        url = node.get("url")
        m = BLOCKER_URL.fullmatch(url) if isinstance(url, str) else None
        if not isinstance(number, int) or not isinstance(state, str) or m is None:
            raise TypeError(f"blockedBy node {node!r}")
        if state != "OPEN":
            continue
        # GitHub matches owner and repository names without regard to case.
        if m.group(1).lower() == REPO.lower():
            numbers.append(number)
        else:
            foreign.append(f"{m.group(1)}#{number}")
    return numbers, foreign


def parse_issues(output: str) -> list[ReadyIssue]:
    """The issues from `gh issue list --json number,title,assignees,labels,body,blockedBy`
    output, with assignees as login names, labels as names and `blockedBy`
    as its open issues."""
    issues: list[ReadyIssue] = []
    for raw in cast("list[dict[str, object]]", json.loads(output)):
        assignees = cast("list[dict[str, str]]", raw.get("assignees") or [])
        labels = cast("list[dict[str, str]]", raw.get("labels") or [])
        body = raw["body"]
        if not isinstance(body, str):
            raise TypeError(f"issue #{raw['number']} has body {body!r}")
        local, foreign = native_blockers(raw)
        issues.append(
            {
                "number": cast("int", raw["number"]),
                "title": cast("str", raw["title"]),
                "assignees": [a["login"] for a in assignees],
                "labels": [label["name"] for label in labels],
                "body": body,
                "blockedBy": local,
                "foreignBlockedBy": foreign,
            }
        )
    return issues


def parse_issue_state(output: str) -> IssueState:
    """One issue from `gh issue view --json state,labels,assignees,url,blockedBy` output.

    `gh issue view` gives a pull request too, and its `url` has `/pull/`.
    """
    raw = cast("dict[str, object]", json.loads(output))
    state = raw["state"]
    url = raw["url"]
    if not isinstance(state, str) or not isinstance(url, str):
        raise TypeError(f"state {state!r}, url {url!r}")
    assignees = cast("list[dict[str, str]]", raw.get("assignees") or [])
    labels = cast("list[dict[str, str]]", raw.get("labels") or [])
    local, foreign = native_blockers(raw)
    return {
        "state": state,
        "labels": [label["name"] for label in labels],
        "assignees": [a["login"] for a in assignees],
        "pullRequest": "/pull/" in url,
        "blockedBy": local,
        "foreignBlockedBy": foreign,
    }


LESSON_PLAN = ["bun", "scripts/lesson-plan.mjs"]


def issue_list_command(kind: Kind) -> list[str]:
    """The `gh issue list` call that fetches a kind's issues on the server side.

    Every `-l` must match. A lessons wave fetches every `ready-for-agent`
    issue, since the plan files choose the lessons and a planned lesson's
    issue can carry any kind label. A content, code or harness wave adds
    `-l <kind>`.
    """
    labels = ["-l", "ready-for-agent"] + ([] if kind == "lessons" else ["-l", kind])
    return [
        "gh",
        "issue",
        "list",
        "-R",
        REPO,
        "-s",
        "open",
        *labels,
        "-L",
        str(ISSUE_LIMIT),
        "--json",
        "number,title,assignees,labels,body,blockedBy",
    ]


def issue_view_command(number: int) -> list[str]:
    return [
        "gh",
        "issue",
        "view",
        str(number),
        "-R",
        REPO,
        "--json",
        "state,labels,assignees,url,blockedBy",
    ]


def gh_lookup() -> Lookup:
    """A `Lookup` that runs `gh issue view` once per number and exits 1 when
    it fails, for a number that doesn't exist too."""
    cache: dict[int, IssueState] = {}

    def lookup(number: int) -> IssueState:
        if number not in cache:
            cache[number] = read_json(issue_view_command(number), parse_issue_state)
        return cache[number]

    return lookup


def fetch_issues(kind: Kind) -> list[ReadyIssue]:
    """The kind's issues, or exit 1 when the list reaches `ISSUE_LIMIT`,
    since then it may be cut short."""
    command = issue_list_command(kind)
    issues = read_json(command, parse_issues)
    if len(issues) >= ISSUE_LIMIT:
        fail(command, f"{len(issues)} issues reach the -L limit, so the list may be cut short")
    return issues


def read_json[T](command: Sequence[str], parse: Callable[[str], T], cwd: Path | None = None) -> T:
    """The parsed output of a command, or exit 1 when it isn't what `parse` expects."""
    output = run(command, cwd)
    try:
        return parse(output)
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        fail(command, f"unreadable output: {e!r}")


def to_json(value: object) -> str:
    """`JSON.stringify(value, null, 2)` and a newline, as the JavaScript tool printed.

    Non-ASCII characters stay as they are, and a lone surrogate becomes a
    `\\uXXXX` escape again, as JavaScript's well-formed JSON.stringify writes it.
    """
    text = json.dumps(value, indent=2, ensure_ascii=False)
    return LONE_SURROGATE.sub(lambda m: f"\\u{ord(m.group()):04x}", text) + "\n"


def to_markdown(result: Wave) -> str:
    """`format_wave`, with a lone surrogate (from a `\\ud800` escape in an
    issue title) as U+FFFD, which is what JavaScript's `process.stdout.write`
    wrote for it. UTF-8 can't encode a lone surrogate.
    """
    return LONE_SURROGATE.sub("\ufffd", format_wave(result))


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    if isinstance(args, str):
        print(args, file=sys.stderr)
        return 2
    lessons = read_json(LESSON_PLAN, parse_lesson_plan, cwd=SITE)
    ready = fetch_issues(args["kind"])
    result = pick_wave(
        lessons,
        ready,
        lookup=gh_lookup(),
        size=args["size"],
        kind=args["kind"],
        only=args["only"],
        unblockers_first=args["unblockersFirst"],
        today=today_utc(),
    )
    out = to_json(result) if args["json"] else to_markdown(result)
    sys.stdout.buffer.write(out.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
