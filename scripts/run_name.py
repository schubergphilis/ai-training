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
  the one its title gives (a KIND given with it must match);
- after a new run opened issue #N, `--check N --exclusive KIND` counts
  only the open runs with a lower issue number. When two new runs race,
  the issue number decides which is later: the higher number refuses and
  closes its issue, and the lower one passes, so one of them goes on.

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
from typing import Literal, TypedDict, cast

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

    `gh issue list` with a label can miss an issue for a few seconds after
    it is created (the #353 dry run hit this), so `--check N` fetches issue
    N on its own and merges it in. An older rival has had those seconds,
    so the list shows it.
    """
    if any(i["number"] == issue["number"] for i in issues):
        return list(issues)
    return [*issues, issue]


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


def counted_runs(runs: Sequence[Run], args: Args) -> tuple[str, list[Run]]:
    """This run's kind and the other open runs the exclusivity check counts.

    With `--resume NAME` the kind is that run's, and the run is left out.
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


def report(issues: Sequence[RunIssue], sequence: Sequence[str], args: Args) -> dict[str, object]:
    """The JSON report: the open runs by number and the next name.

    With --check it adds takenBy, and with --exclusive or --resume it adds
    refusal.
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
        kind, others = counted_runs(runs, args)
        result["refusal"] = exclusivity_refusal(kind, others)
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


def fetch_issues(check: int | None, gh: Gh) -> list[RunIssue]:
    """Every run issue, open and closed, plus issue `check` when the listing lacks it."""
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
    own = cast("RunIssue", gh(["issue", "view", str(check), "-R", REPO, "--json", FIELDS]))
    return with_issue(listed, own)


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
        sequence = run_name_sequence(names_file.read_text(encoding="utf-8"))
        result = report(issues, sequence, args)
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
