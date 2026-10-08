#!/usr/bin/env python3
"""Names for dispatcher runs, and the harness exclusivity check (#353, #527).

`mise run run-name [-- [--check N] [--exclusive KIND] [--resume NAME]]`.

A run is a GitHub issue with the `dispatcher-run` label, titled
`Run: <Name> (<kind>)`, for example `Run: Capybara (lessons)`. Runs are
named like hurricanes: the next run takes the name after the newest run's
name, so the names sort in the order the runs started. The names are in
.claude/skills/wave/run-names.txt: two lists of 26 animals, one name per
letter from A to Z in order, and no name twice. A blank line separates the
two lists, and a line that starts with `#` is a comment. The sequence is
the first list, then the second, and then the first again, so after Z the
letters start again at A in the second list, and after its Z at A in the
first. A new run skips a name that an open run still holds. Each name is
one capitalized word, easy to spell and to say. A run is never named after
a machine.

The script prints JSON with the open runs and the name the next run takes.
With `--check N`, for the run issue #N this dispatcher just opened, it
also prints `takenBy`: the older open run with the same name, or null. The
dispatcher that loses closes its issue and takes the next name.

With `--exclusive KIND` or `--resume NAME`, it also prints `refusal`: the
message of the harness exclusivity check (.claude/skills/wave/SKILL.md,
"Starting a run", step 1), or null when the run may start. A harness run
starts only when no other run is open, and no other run starts while a
harness run is open. The runs the check counts are the other open runs:

- before a new run opens its issue, `--exclusive KIND` counts every open
  run;
- for a resumed run, `--resume NAME` leaves that run out, and its kind is
  the one its title gives (a KIND given with it must match). When no open
  run has the name, the newest closed run with it is resumed when a pull
  request or a commit closed it and it has no trusted stop comment: a
  wave merge closed that run issue before the dispatcher could reopen it
  (#627). The JSON then gives its number and what closed it as `reopen`,
  which is null for an open run;
- after a new run opened issue #N, `--check N --exclusive KIND` counts
  only the open runs with a lower issue number. When two new runs race,
  the issue number decides which is later: the higher number refuses and
  closes its issue, and the lower one passes, so one of them goes on.
  The runs are read from the newest issues as well as from the label
  listing, which can lag by a few seconds (`fetch_issues`, #616).

A closed run counts for no other run's check, so only the resume of a
closed run checks the rule for it.

The functions are pure over the file's text and the run issues that
`main` fetches with `gh`, so tests/test_run_name.py can feed them planted
runs, and a hook can import them.

Exit codes: 0 on success, 1 when `gh` fails or the names file, the
issue or the resumed run is wrong, 2 for a usage error, and 3 when the
exclusivity check refuses the run. On 3 the JSON is still printed on
stdout, and the refusal is also printed on stderr.
"""

import json
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, TypedDict, cast

from wave_status import TRUSTED_VERDICT_AUTHORS

REPO = "schubergphilis/ai-training"
RUN_LABEL = "dispatcher-run"
"""The label on every run issue."""

NAMES_FILE = (
    Path(__file__).resolve().parent.parent / ".claude" / "skills" / "wave" / "run-names.txt"
)
FIELDS = "number,title,state,createdAt"
USAGE = "usage: mise run run-name [-- [--check <issue>] [--exclusive <kind>] [--resume <Name>]]"
HARNESS = "harness"
"""The kind of a harness run."""
REFUSED = 3
"""The exit code when the harness exclusivity check refuses the run."""
STOP_COMMENTS = ("Run ended:", "Stop condition:")
"""How a stop comment starts. `Run ended:` is the first line
.claude/skills/wave/when-the-run-ends.md, "When the run ends", gives it.
The runs that ended before 2026-09-30 (549bd15f) mostly started it with
`Stop condition:`, and Ocelot (#513), which PR #520 closed, is one of
them."""
RECENT_LIMIT = 50
"""How many of the newest issues `--check` reads without the search index (#616)."""
RECENT_QUERY = """
query($owner: String!, $repo: String!, $limit: Int!) {
  repository(owner: $owner, name: $repo) {
    issues(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { number title state createdAt labels(first: 100) { nodes { name } } }
    }
  }
}
"""
"""The newest issues of the repository, with their labels, from the issues connection."""
CLOSER_QUERY = """
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      timelineItems(itemTypes: [CLOSED_EVENT], last: 1) {
        nodes {
          ... on ClosedEvent {
            closer { __typename ... on PullRequest { number } ... on Commit { abbreviatedOid } }
          }
        }
      }
    }
  }
}
"""
"""What closed an issue last: a pull request or a commit with a closing keyword, or null."""

type Gh = Callable[[Sequence[str]], object]
"""Runs gh with the arguments and returns its parsed JSON output."""

# `Run: Capybara (lessons)`: a capitalized name and a lowercase kind. These
# are used with fullmatch, because `$` in Python also matches before a
# trailing newline, and the JavaScript `^...$` they replace did not.
RUN_TITLE = re.compile(r"Run: ([A-Z][a-z]+) \(([a-z]+)\)")
NAME = re.compile(r"[A-Z][a-z]+")
KIND = re.compile(r"[a-z]+")
ISSUE_NUMBER = re.compile(r"[1-9][0-9]*")
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LIST_NAMES = ("first", "second")
OPTION_VALUES = {
    "--check": "an issue number",
    "--exclusive": "a run kind",
    "--resume": "a run name",
}
"""The options, each with what its value is, for the usage errors."""


class RunIssue(TypedDict):
    """A `dispatcher-run` issue as `gh --json number,title,state,createdAt` prints it."""

    number: int
    title: str
    state: Literal["OPEN", "CLOSED"]
    createdAt: str


class Label(TypedDict):
    """A label as the GraphQL API gives it."""

    name: str


class Labels(TypedDict):
    """The labels connection of an issue."""

    nodes: list[Label]


class RecentIssue(TypedDict):
    """One of the newest issues, as RECENT_QUERY gives it."""

    number: int
    title: str
    state: Literal["OPEN", "CLOSED"]
    createdAt: str
    labels: Labels


class Author(TypedDict):
    """The author of a comment, as `gh --json comments` prints it."""

    login: str


class Comment(TypedDict):
    """A comment, as `gh issue view --json comments` prints it."""

    author: Author
    body: str


class Run(TypedDict):
    """The run a run issue records. The key order is the order of the JSON output."""

    number: int
    name: str
    kind: str
    open: bool
    createdAt: str


class RunNameError(Exception):
    """The names file, the run issues or the issue given to --check is wrong."""


class UsageError(Exception):
    """The command line is wrong."""


@dataclass(frozen=True)
class Args:
    """The command line: each option's value, or None when it isn't given."""

    check: int | None = None
    exclusive: str | None = None
    resume: str | None = None


def parse_run_names(text: str) -> list[list[str]]:
    """The lists in the text of run-names.txt: runs of non-blank lines, without comments."""
    lists: list[list[str]] = []
    current: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#"):
            continue
        if line == "":
            if current:
                lists.append(current)
                current = []
            continue
        current.append(line)
    if current:
        lists.append(current)
    return lists


def check_run_names(lists: Sequence[Sequence[str]]) -> list[str]:
    """What is wrong with the lists of the run-names file, as messages.

    Empty when there are two lists, `first` and `second`, each with one
    name per letter from A to Z in order, and no name twice.
    """
    if len(lists) != len(LIST_NAMES):
        return [
            "run-names: the file must hold two lists, first and second, separated by "
            f"a blank line, not {len(lists)}"
        ]
    errors: list[str] = []
    seen: set[str] = set()
    for key, names in zip(LIST_NAMES, lists, strict=True):
        if len(names) != len(LETTERS):
            errors.append(f"run-names: {key} has {len(names)} names, not 26")
        for i, name in enumerate(names):
            letter = LETTERS[i] if i < len(LETTERS) else None
            if not NAME.fullmatch(name):
                errors.append(
                    f"run-names: {key}[{i}] {json.dumps(name)} is not one capitalized word"
                )
            elif letter is not None and not name.startswith(letter):
                errors.append(f"run-names: {key}[{i}] {name} does not start with {letter}")
            elif name in seen:
                errors.append(f"run-names: {name} is in the lists twice")
            seen.add(name)
    return errors


def run_name_sequence(text: str) -> list[str]:
    """The 52 names in order, from the text of run-names.txt.

    Raises RunNameError with the messages of check_run_names when the file
    is wrong.
    """
    lists = parse_run_names(text)
    errors = check_run_names(lists)
    if errors:
        raise RunNameError("\n".join(errors))
    return [name for names in lists for name in names]


def run_of(issue: RunIssue) -> Run | None:
    """The run a `dispatcher-run` issue records, or None when its title isn't a run title."""
    match = RUN_TITLE.fullmatch(issue["title"])
    if match is None:
        return None
    return {
        "number": issue["number"],
        "name": match.group(1),
        "kind": match.group(2),
        "open": issue["state"] == "OPEN",
        "createdAt": issue["createdAt"],
    }


def newest_run(runs: Sequence[Run]) -> Run | None:
    """The run whose issue was opened last. Ties go to the higher issue number."""
    newest: Run | None = None
    for run in runs:
        if newest is None or (run["createdAt"], run["number"]) > (
            newest["createdAt"],
            newest["number"],
        ):
            newest = run
    return newest


def next_run_name(sequence: Sequence[str], runs: Sequence[Run]) -> str:
    """The name for a new run.

    The name after the newest run's name in the sequence (the first name
    when there is no run yet, or when the newest name isn't in the
    sequence), skipping every name an open run holds. Raises RunNameError
    when every name is held.
    """
    held = {run["name"] for run in runs if run["open"]}
    newest = newest_run(runs)
    start = 0
    if newest is not None and newest["name"] in sequence:
        start = sequence.index(newest["name"]) + 1
    for step in range(len(sequence)):
        name = sequence[(start + step) % len(sequence)]
        if name not in held:
            return name
    raise RunNameError(f"run-name: all {len(sequence)} names are held by open runs")


def name_taken_by(runs: Sequence[Run], own: int) -> Run | None:
    """For the run issue this dispatcher just opened: the older open run with the same name.

    None when the name is its own. Raises RunNameError when issue `own`
    is not a run issue.
    """
    mine = next((run for run in runs if run["number"] == own), None)
    if mine is None:
        raise RunNameError(f"run-name: issue #{own} is not a run issue")
    rivals = [
        run
        for run in runs
        if run["open"]
        and run["name"] == mine["name"]
        and run["number"] != own
        and (run["createdAt"], run["number"]) < (mine["createdAt"], own)
    ]
    if not rivals:
        return None
    return min(rivals, key=lambda run: run["number"])


def with_issue(issues: Sequence[RunIssue], issue: RunIssue) -> list[RunIssue]:
    """The run issues with `issue` added when the list lacks it.

    `--check N` uses it for issue N when N is older than the newest
    issues that `fetch_issues` reads (see `with_recent`).
    """
    if any(i["number"] == issue["number"] for i in issues):
        return list(issues)
    return [*issues, issue]


def with_recent(
    issues: Sequence[RunIssue], recent: Sequence[RecentIssue], check: int
) -> list[RunIssue]:
    """The run issues, with the newest issues of the repository merged in.

    `recent` are the newest issues, which `fetch_issues` reads without
    the search index. Each run issue among them (one with the
    `dispatcher-run` label, and issue `check` whatever its labels, as
    `--check` has always taken it) replaces the listed issue with its
    number, or is added when the listing lacks it. So a rival run opened
    seconds before issue `check` counts even when the label listing
    doesn't show it yet (#616).
    """
    fresh: list[RunIssue] = [
        {
            "number": item["number"],
            "title": item["title"],
            "state": item["state"],
            "createdAt": item["createdAt"],
        }
        for item in recent
        if item["number"] == check
        or RUN_LABEL in {label["name"] for label in item["labels"]["nodes"]}
    ]
    covered = {item["number"] for item in recent}
    return [i for i in issues if i["number"] not in covered] + fresh


def newest_closed_run(runs: Sequence[Run], name: str) -> Run | None:
    """For `--resume NAME` when no open run has the name: the newest closed run with it.

    None when an open run has the name, or when no run has it. Only the
    newest closed run counts: a name is used again only after the run
    that held it has closed, so an older closed run with the name is an
    earlier run, and the runs from before 2026-09-25 closed without a stop
    comment (#627).
    """
    if any(run["open"] and run["name"] == name for run in runs):
        return None
    return newest_run([run for run in runs if not run["open"] and run["name"] == name])


def has_stop_comment(comments: Sequence[Comment]) -> bool:
    """True when one of the comments is the run's stop comment.

    The stop comment is the one .claude/skills/wave/when-the-run-ends.md,
    "When the run ends", posts: its body starts with `Run ended:`, or with the older
    `Stop condition:` (STOP_COMMENTS). Only a comment by
    an account in TRUSTED_VERDICT_AUTHORS counts, since anyone can comment
    on a public issue. Every comment is read, since a later comment can
    follow the stop comment.
    """
    return any(
        comment["author"]["login"] in TRUSTED_VERDICT_AUTHORS
        and comment["body"].startswith(STOP_COMMENTS)
        for comment in comments
    )


def parse_args(argv: Sequence[str]) -> Args:
    """The options of the command line, in any order, each at most once.

    `--check N` takes an issue number (a leading `#` is fine),
    `--exclusive KIND` a lowercase kind and `--resume NAME` a run name.
    `--check` and `--resume` don't go together, since a resumed run opens
    no issue. Raises UsageError for anything else.
    """
    values: dict[str, str] = {}
    i = 0
    while i < len(argv):
        option = argv[i]
        if option not in OPTION_VALUES or option in values:
            raise UsageError(f"run-name: unknown arguments {' '.join(argv)}")
        if i + 1 >= len(argv):
            # "got undefined" is the message the JavaScript version printed.
            raise UsageError(f"run-name: {option} needs {OPTION_VALUES[option]}, got undefined")
        values[option] = argv[i + 1]
        i += 2
    check = None
    if "--check" in values:
        raw = values["--check"]
        number = raw.removeprefix("#")
        if not ISSUE_NUMBER.fullmatch(number):
            raise UsageError(f"run-name: --check needs an issue number, got {json.dumps(raw)}")
        check = int(number)
    kind = values.get("--exclusive")
    if kind is not None and not KIND.fullmatch(kind):
        raise UsageError(f"run-name: --exclusive needs a run kind, got {json.dumps(kind)}")
    resume = values.get("--resume")
    if resume is not None and not NAME.fullmatch(resume):
        raise UsageError(f"run-name: --resume needs a run name, got {json.dumps(resume)}")
    if check is not None and resume is not None:
        raise UsageError("run-name: --check and --resume don't go together")
    return Args(check=check, exclusive=kind, resume=resume)


def exclusivity_refusal(kind: str, others: Sequence[Run]) -> str | None:
    """The refusal of the harness exclusivity check, or None when the run may start.

    `kind` is the kind of this run, and `others` are the other open runs
    the check counts (see `counted_runs`). The messages are the ones in
    .claude/skills/wave/SKILL.md, "Starting a run", step 1.
    """
    ordered = sorted(others, key=lambda run: run["number"])
    if kind == HARNESS and ordered:
        listed = ", ".join(f"Run {run['name']} (#{run['number']})" for run in ordered)
        return f"A harness run starts only when no other run is open. Open: {listed}"
    harness = next((run for run in ordered if run["kind"] == HARNESS), None)
    if harness is not None:
        return (
            f"Run {harness['name']} (#{harness['number']}) is a harness run. "
            "No other run starts while it is open."
        )
    return None


def counted_runs(
    runs: Sequence[Run], args: Args, reopen: Run | None = None
) -> tuple[str, list[Run]]:
    """This run's kind and the other open runs the exclusivity check counts.

    With `--resume NAME` the kind is that run's, and the run is left out.
    The resumed run is the open run with the name, or `reopen`, the closed
    run `resumable_run` found. A closed run counts for no other run's check,
    so its own check here is the one that keeps the harness rule when it
    comes back.
    With `--check N` only the open runs with an issue number below N
    count, because the issue number orders two new runs. Otherwise every
    open run counts. Raises RunNameError when the resumed run isn't open,
    when a KIND given doesn't match the kind of the resumed or checked run,
    or when there is no kind at all.
    """
    open_runs = [run for run in runs if run["open"]]
    mine: Run | None = None
    if args.resume is not None:
        mine = next((run for run in open_runs if run["name"] == args.resume), None)
        if mine is None and reopen is not None and reopen["name"] == args.resume:
            mine = reopen
        if mine is None:
            raise RunNameError(f"run-name: no open run is named {args.resume}")
    elif args.check is not None:
        mine = next((run for run in runs if run["number"] == args.check), None)
        if mine is None:
            raise RunNameError(f"run-name: issue #{args.check} is not a run issue")
    kind = args.exclusive
    if mine is not None:
        if kind is not None and kind != mine["kind"]:
            raise RunNameError(
                f"run-name: --exclusive {kind}, but run {mine['name']} "
                f"(#{mine['number']}) is a {mine['kind']} run"
            )
        kind = mine["kind"]
    if kind is None:
        raise RunNameError("run-name: the exclusivity check needs --exclusive or --resume")
    if mine is None:
        return kind, open_runs
    others = [run for run in open_runs if run["number"] != mine["number"]]
    if args.check is not None:
        others = [run for run in others if run["number"] < args.check]
    return kind, others


def report(
    issues: Sequence[RunIssue],
    sequence: Sequence[str],
    args: Args,
    reopen: tuple[Run, str] | None = None,
) -> dict[str, object]:
    """The JSON report: the open runs by number and the next name.

    With --check it adds takenBy, and with --exclusive or --resume it adds
    refusal. With --resume it also adds reopen: the number of the closed
    run issue to reopen and what closed it (`reopen`, from
    `resumable_run`), or null when the resumed run is open.
    """
    check = args.check
    runs = [run for issue in issues if (run := run_of(issue)) is not None]
    result: dict[str, object] = {
        "open": sorted((run for run in runs if run["open"]), key=lambda run: run["number"]),
        "next": next_run_name(sequence, runs),
    }
    if check is not None:
        result["takenBy"] = name_taken_by(runs, check)
    if args.exclusive is not None or args.resume is not None:
        kind, others = counted_runs(runs, args, None if reopen is None else reopen[0])
        result["refusal"] = exclusivity_refusal(kind, others)
    if args.resume is not None:
        result["reopen"] = (
            None if reopen is None else {"number": reopen[0]["number"], "closedBy": reopen[1]}
        )
    return result


def format_report(result: dict[str, object]) -> str:
    """The report as the JavaScript version printed it: two-space indent and a newline."""
    return json.dumps(result, indent=2, ensure_ascii=False) + "\n"


def gh_json(args: Sequence[str]) -> object:
    """Run gh and parse its output. Raises RunNameError when gh fails."""
    try:
        done = subprocess.run(
            ["gh", *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            check=True,
            text=True,
        )
        return cast("object", json.loads(done.stdout))
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as e:
        raise RunNameError(f"run-name: gh {' '.join(args[:2])} failed: {e}") from e


def fetch_recent(gh: Gh) -> list[RecentIssue]:
    """The RECENT_LIMIT newest issues of the repository, newest first, with their labels."""
    owner, repo = REPO.split("/")
    answer = gh(
        [
            "api",
            "graphql",
            "-f",
            f"query={RECENT_QUERY}",
            "-F",
            f"owner={owner}",
            "-F",
            f"repo={repo}",
            "-F",
            f"limit={RECENT_LIMIT}",
        ]
    )
    try:
        nodes = cast("dict[str, Any]", answer)["data"]["repository"]["issues"]["nodes"]
    except (KeyError, TypeError) as e:
        raise RunNameError(f"run-name: gh api graphql gave no issues: {e}") from e
    return cast("list[RecentIssue]", nodes)


def fetch_issues(check: int | None, gh: Gh) -> list[RunIssue]:
    """Every run issue, open and closed, and with `check` the newest ones for sure.

    The label listing is `gh issue list -l`, which goes through the search
    API (`GH_DEBUG=api` shows an `IssueSearch` query), and the search index
    can miss an issue for a few seconds after it is created (#353). With
    `--check N` a rival opened seconds before N can be that new (#616), so
    one GraphQL call reads the RECENT_LIMIT newest issues from the issues
    connection, which doesn't go through the index, and `with_recent`
    merges the run issues among them in. Issue N is among them in the
    common case, so that call also replaces the `gh issue view N` that
    `--check` used to make: two gh calls, as before. Relisting until the
    listing shows N would cost at least one more call and a wait whenever
    the listing lags, which is right after the create when `--check` runs,
    and it would trust the index to show the lower numbers first.
    RECENT_LIMIT is the cap: a rival the listing lacks was opened seconds
    before N, and a wave files far fewer than 50 issues in seconds. When
    N is older than the newest 50, `gh issue view N` fetches it, and every
    rival older than N has had the time to reach the listing.
    """
    listed = cast(
        "list[RunIssue]",
        gh(
            [
                "issue",
                "list",
                "-R",
                REPO,
                "-l",
                RUN_LABEL,
                "-s",
                "all",
                "-L",
                "1000",
                "--json",
                FIELDS,
            ]
        ),
    )
    if check is None:
        return listed
    merged = with_recent(listed, fetch_recent(gh), check)
    if any(i["number"] == check for i in merged):
        return merged
    own = cast("RunIssue", gh(["issue", "view", str(check), "-R", REPO, "--json", FIELDS]))
    return with_issue(merged, own)


def closer_of(answer: object) -> str | None:
    """What CLOSER_QUERY says closed the issue: `PR #<n>`, `commit <sha>`, or None.

    None when the issue was closed by hand, by `gh issue close` or by
    anything else that isn't a closing keyword. Raises RunNameError when
    the answer isn't the one CLOSER_QUERY asks for.
    """
    try:
        issue = cast("dict[str, Any]", answer)["data"]["repository"]["issue"]
        nodes = cast("list[dict[str, Any]]", issue["timelineItems"]["nodes"])
    except (KeyError, TypeError) as e:
        raise RunNameError(f"run-name: gh api graphql gave no close event: {e}") from e
    closer = cast("dict[str, Any] | None", nodes[-1].get("closer")) if nodes else None
    if closer is None:
        return None
    if closer.get("__typename") == "PullRequest":
        return f"PR #{closer['number']}"
    if closer.get("__typename") == "Commit":
        return f"commit {closer['abbreviatedOid']}"
    return None


def resumable_run(issues: Sequence[RunIssue], name: str | None, gh: Gh) -> tuple[Run, str] | None:
    """For `--resume NAME`: the closed run to reopen and what closed it, or None.

    None without `--resume`, when an open run has the name, and when no
    run has it (`counted_runs` then says that no open run has the name).
    Otherwise the run is `newest_closed_run`, and it is resumable when a
    pull request or a commit closed its issue last (a wave merge, before
    the dispatcher could reopen it: SKILL.md, "The run issue after a
    merge") and no comment on it is a stop comment. That costs two more gh
    calls, only on this path. Raises RunNameError when the run isn't
    resumable, because it ended.
    """
    if name is None:
        return None
    runs = [run for issue in issues if (run := run_of(issue)) is not None]
    closed = newest_closed_run(runs, name)
    if closed is None:
        return None
    number = closed["number"]
    owner, repo = REPO.split("/")
    closer = closer_of(
        gh(
            [
                "api",
                "graphql",
                "-f",
                f"query={CLOSER_QUERY}",
                "-F",
                f"owner={owner}",
                "-F",
                f"repo={repo}",
                "-F",
                f"number={number}",
            ]
        )
    )
    ended = f"run-name: no open run is named {name}, and run {name} (#{number}) has ended"
    if closer is None:
        raise RunNameError(f"{ended}: no merge closed its issue")
    answer = gh(["issue", "view", str(number), "-R", REPO, "--json", "comments"])
    try:
        comments = cast("list[Comment]", cast("dict[str, Any]", answer)["comments"])
    except (KeyError, TypeError) as e:
        raise RunNameError(f"run-name: gh issue view gave no comments: {e}") from e
    if has_stop_comment(comments):
        raise RunNameError(f"{ended}: it has a stop comment")
    return closed, closer


def main(
    argv: Sequence[str],
    gh: Gh = gh_json,
    names_file: Path = NAMES_FILE,
) -> int:
    """Print the report for the command line `argv` and return the exit code."""
    try:
        args = parse_args(argv)
    except UsageError as e:
        print(e, file=sys.stderr)
        print(USAGE, file=sys.stderr)
        return 2
    try:
        issues = fetch_issues(args.check, gh)
        reopen = resumable_run(issues, args.resume, gh)
        sequence = run_name_sequence(names_file.read_text(encoding="utf-8"))
        result = report(issues, sequence, args, reopen)
    except (RunNameError, OSError) as e:
        print(e, file=sys.stderr)
        return 1
    sys.stdout.write(format_report(result))
    refusal = result.get("refusal")
    if isinstance(refusal, str):
        print(refusal, file=sys.stderr)
        return REFUSED
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
