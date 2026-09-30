"""Tests for scripts/run_name.py, on the real run-names file and planted runs."""

import json
import pathlib
import subprocess
from collections.abc import Sequence
from typing import cast

import pytest

import run_name
from run_name import Run, RunIssue

NAMES_TEXT = run_name.NAMES_FILE.read_text(encoding="utf-8")
SEQUENCE = run_name.run_name_sequence(NAMES_TEXT)
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GOOD = [[f"{letter}one" for letter in LETTERS], [f"{letter}two" for letter in LETTERS]]


def run(number: int, name: str, is_open: bool, created_at: str) -> Run:
    return {
        "number": number,
        "name": name,
        "kind": "lessons",
        "open": is_open,
        "createdAt": created_at,
    }


def issue(number: int, title: str, created_at: str, state: str = "OPEN") -> RunIssue:
    return {
        "number": number,
        "title": title,
        "state": "OPEN" if state == "OPEN" else "CLOSED",
        "createdAt": created_at,
    }


def replaced(names: list[str], i: int, name: str) -> list[str]:
    copy = list(names)
    copy[i] = name
    return copy


# The run-names file


def test_file_holds_two_lists_of_26_names_one_per_letter_and_no_name_twice() -> None:
    assert run_name.check_run_names(run_name.parse_run_names(NAMES_TEXT)) == []
    assert len(SEQUENCE) == 52
    assert SEQUENCE[:3] == ["Axolotl", "Badger", "Capybara"]
    assert SEQUENCE[26] == "Alpaca"
    assert len(set(SEQUENCE)) == 52


def test_parse_skips_comments_and_splits_on_blank_lines() -> None:
    text = "# header\n\nAone\nBone\n\n\n# between\nAtwo\n  Btwo  \n"
    assert run_name.parse_run_names(text) == [["Aone", "Bone"], ["Atwo", "Btwo"]]


# check_run_names


def test_check_accepts_one_name_per_letter_in_both_lists() -> None:
    assert run_name.check_run_names(GOOD) == []


def test_check_rejects_a_missing_list() -> None:
    message = (
        "run-names: the file must hold two lists, first and second, separated by a blank line, not "
    )
    assert run_name.check_run_names([]) == [message + "0"]
    assert run_name.check_run_names([GOOD[0]]) == [message + "1"]


def test_check_rejects_a_third_list() -> None:
    assert run_name.check_run_names([*GOOD, ["Athree"]]) == [
        "run-names: the file must hold two lists, first and second, separated by a blank line, "
        "not 3"
    ]


def test_check_rejects_a_short_list() -> None:
    assert "run-names: second has 25 names, not 26" in run_name.check_run_names(
        [GOOD[0], GOOD[1][1:]]
    )


def test_check_rejects_a_wrong_letter() -> None:
    errors = run_name.check_run_names([replaced(GOOD[0], 1, "Cone"), GOOD[1]])
    assert "run-names: first[1] Cone does not start with B" in errors


def test_check_rejects_a_repeat() -> None:
    errors = run_name.check_run_names([GOOD[0], replaced(GOOD[1], 0, "Aone")])
    assert "run-names: Aone is in the lists twice" in errors


def test_check_rejects_a_name_that_is_not_one_capitalized_word() -> None:
    errors = run_name.check_run_names([replaced(GOOD[0], 0, "A one"), GOOD[1]])
    assert 'run-names: first[0] "A one" is not one capitalized word' in errors


def test_check_rejects_a_name_past_z() -> None:
    errors = run_name.check_run_names([[*GOOD[0], "Aextra"], GOOD[1]])
    assert errors == ["run-names: first has 27 names, not 26"]


def test_sequence_raises_on_a_wrong_file() -> None:
    with pytest.raises(run_name.RunNameError, match="blank line, not 0"):
        run_name.run_name_sequence("# only a comment\n")
    with pytest.raises(run_name.RunNameError, match="first has 1 names"):
        run_name.run_name_sequence("Aone\n\nAtwo\n")


# run_of


def test_run_of_reads_the_name_and_kind_from_a_run_title() -> None:
    assert run_name.run_of(issue(360, "Run: Capybara (lessons)", "2026-09-25T08:00:00Z")) == {
        "number": 360,
        "name": "Capybara",
        "kind": "lessons",
        "open": True,
        "createdAt": "2026-09-25T08:00:00Z",
    }
    closed = run_name.run_of(issue(361, "Run: Dingo (mixed)", "", state="CLOSED"))
    assert closed is not None
    assert closed["open"] is False


def test_run_of_ignores_an_issue_whose_title_is_not_a_run_title() -> None:
    assert run_name.run_of(issue(361, "Run Capybara", "")) is None
    assert run_name.run_of(issue(362, "Run: capybara (lessons)", "")) is None


def test_run_of_ignores_a_title_with_a_trailing_newline() -> None:
    assert run_name.run_of(issue(363, "Run: Capybara (lessons)\n", "")) is None


def test_check_rejects_a_name_with_a_trailing_newline() -> None:
    errors = run_name.check_run_names([replaced(GOOD[0], 0, "Aone\n"), GOOD[1]])
    assert 'run-names: first[0] "Aone\\n" is not one capitalized word' in errors


# next_run_name


def test_next_starts_at_the_first_name_when_there_is_no_run_yet() -> None:
    assert run_name.next_run_name(SEQUENCE, []) == "Axolotl"


def test_next_takes_the_letter_after_the_newest_run_open_or_closed() -> None:
    runs = [
        run(1, "Axolotl", False, "2026-09-25T08:00:00Z"),
        run(2, "Badger", False, "2026-09-25T09:00:00Z"),
    ]
    assert run_name.next_run_name(SEQUENCE, runs) == "Capybara"


def test_next_goes_by_when_the_run_started_not_by_the_letter() -> None:
    runs = [
        run(5, "Zebu", False, "2026-09-20T08:00:00Z"),
        run(9, "Badger", True, "2026-09-25T08:00:00Z"),
    ]
    assert run_name.next_run_name(SEQUENCE, runs) == "Capybara"


def test_next_wraps_from_z_to_the_other_list() -> None:
    assert run_name.next_run_name(SEQUENCE, [run(1, "Zebra", False, "2026-09-25T08:00:00Z")]) == (
        "Alpaca"
    )
    assert run_name.next_run_name(SEQUENCE, [run(1, "Zebu", False, "2026-09-25T08:00:00Z")]) == (
        "Axolotl"
    )


def test_next_skips_a_name_an_open_run_holds_and_reuses_a_closed_one() -> None:
    runs = [
        run(1, "Capybara", True, "2026-09-01T08:00:00Z"),
        run(2, "Dingo", False, "2026-09-02T08:00:00Z"),
        run(3, "Badger", False, "2026-09-25T08:00:00Z"),
    ]
    assert run_name.next_run_name(SEQUENCE, runs) == "Dingo"


def test_next_starts_at_the_first_name_when_the_newest_name_is_not_in_the_lists() -> None:
    runs = [run(1, "Unicorn", False, "2026-09-25T08:00:00Z")]
    assert run_name.next_run_name(SEQUENCE, runs) == "Axolotl"


def test_next_raises_when_every_name_is_held() -> None:
    runs = [run(i + 1, name, True, f"2026-09-25T08:00:{i:02d}Z") for i, name in enumerate(SEQUENCE)]
    with pytest.raises(run_name.RunNameError, match="all 52 names are held"):
        run_name.next_run_name(SEQUENCE, runs)


# newest_run


def test_newest_breaks_a_tie_in_the_start_time_by_the_higher_issue_number() -> None:
    at = "2026-09-25T08:00:00Z"
    newest = run_name.newest_run([run(4, "Emu", True, at), run(7, "Ferret", True, at)])
    assert newest is not None
    assert newest["name"] == "Ferret"
    newest = run_name.newest_run([run(7, "Ferret", True, at), run(4, "Emu", True, at)])
    assert newest is not None
    assert newest["name"] == "Ferret"
    assert run_name.newest_run([]) is None


# name_taken_by


def test_taken_by_names_the_older_open_run_with_the_same_name() -> None:
    runs = [
        run(10, "Capybara", True, "2026-09-25T08:00:00Z"),
        run(11, "Capybara", True, "2026-09-25T08:00:05Z"),
    ]
    taken = run_name.name_taken_by(runs, 11)
    assert taken is not None
    assert taken["number"] == 10
    assert run_name.name_taken_by(runs, 10) is None


def test_taken_by_ignores_a_closed_run_with_the_same_name_and_another_name() -> None:
    runs = [
        run(10, "Capybara", False, "2026-09-20T08:00:00Z"),
        run(11, "Badger", True, "2026-09-24T08:00:00Z"),
        run(12, "Capybara", True, "2026-09-25T08:00:00Z"),
    ]
    assert run_name.name_taken_by(runs, 12) is None


def test_taken_by_breaks_a_tie_in_the_start_time_by_the_lower_issue_number() -> None:
    at = "2026-09-25T08:00:00Z"
    taken = run_name.name_taken_by([run(10, "Dingo", True, at), run(11, "Dingo", True, at)], 11)
    assert taken is not None
    assert taken["number"] == 10


def test_taken_by_picks_the_lowest_number_of_several_older_rivals() -> None:
    runs = [
        run(12, "Dingo", True, "2026-09-25T08:00:01Z"),
        run(10, "Dingo", True, "2026-09-25T08:00:02Z"),
        run(13, "Dingo", True, "2026-09-25T08:00:09Z"),
    ]
    taken = run_name.name_taken_by(runs, 13)
    assert taken is not None
    assert taken["number"] == 10


def test_taken_by_raises_for_an_issue_that_is_not_a_run() -> None:
    with pytest.raises(run_name.RunNameError, match="#12 is not a run issue"):
        run_name.name_taken_by([], 12)


# parse_args


def test_parse_args_takes_no_arguments_or_check_with_an_issue_number() -> None:
    assert run_name.parse_args([]) == run_name.Args()
    assert run_name.parse_args(["--check", "#360"]) == run_name.Args(check=360)
    assert run_name.parse_args(["--check", "360"]) == run_name.Args(check=360)


def test_parse_args_takes_exclusive_and_resume_in_any_order() -> None:
    assert run_name.parse_args(["--exclusive", "code"]) == run_name.Args(exclusive="code")
    assert run_name.parse_args(["--resume", "Seal"]) == run_name.Args(resume="Seal")
    assert run_name.parse_args(["--resume", "Seal", "--exclusive", "harness"]) == run_name.Args(
        exclusive="harness", resume="Seal"
    )
    assert run_name.parse_args(["--exclusive", "code", "--check", "#600"]) == run_name.Args(
        check=600, exclusive="code"
    )


@pytest.mark.parametrize(
    ("argv", "message"),
    [
        (["--check"], "run-name: --check needs an issue number, got undefined"),
        (["--check", "x"], 'run-name: --check needs an issue number, got "x"'),
        (["--check", "0"], 'run-name: --check needs an issue number, got "0"'),
        (["--check", "513\n"], 'run-name: --check needs an issue number, got "513\\n"'),
        (["--resume", "Capybara", "x"], "run-name: unknown arguments --resume Capybara x"),
        (["--check", "1", "2"], "run-name: unknown arguments --check 1 2"),
        (["--check", "1", "--check", "2"], "run-name: unknown arguments --check 1 --check 2"),
        (["--exclusive"], "run-name: --exclusive needs a run kind, got undefined"),
        (["--exclusive", "Code"], 'run-name: --exclusive needs a run kind, got "Code"'),
        (["--resume"], "run-name: --resume needs a run name, got undefined"),
        (["--resume", "seal"], 'run-name: --resume needs a run name, got "seal"'),
        (
            ["--check", "600", "--resume", "Seal"],
            "run-name: --check and --resume don't go together",
        ),
    ],
)
def test_parse_args_rejects_anything_else(argv: list[str], message: str) -> None:
    with pytest.raises(run_name.UsageError) as caught:
        run_name.parse_args(argv)
    assert str(caught.value) == message


# with_issue

LISTED = issue(10, "Run: Axolotl (lessons)", "2026-09-25T08:00:00Z")
FRESH = issue(11, "Run: Badger (lessons)", "2026-09-25T08:00:05Z")


def test_with_issue_adds_an_issue_the_label_listing_has_not_shown_yet() -> None:
    assert run_name.with_issue([LISTED], FRESH) == [LISTED, FRESH]


def test_with_issue_keeps_the_list_as_it_is_when_the_issue_is_in_it() -> None:
    assert run_name.with_issue([LISTED, FRESH], FRESH) == [LISTED, FRESH]


# report and main


def fake_gh(
    listed: list[RunIssue],
    viewed: RunIssue | None = None,
    recent: list[run_name.RecentIssue] | None = None,
    comments: dict[int, list[run_name.Comment]] | None = None,
    closers: dict[int, dict[str, object] | None] | None = None,
) -> run_name.Gh:
    """A gh with a label listing, one viewed issue, the newest issues, comments and closers."""

    def gh(args: Sequence[str]) -> object:
        if args[:2] == ["issue", "list"]:
            assert run_name.RUN_LABEL in args
            return listed
        number = next((a.removeprefix("number=") for a in args if a.startswith("number=")), None)
        if args[:2] == ["api", "graphql"] and number is not None:
            assert closers is not None
            assert f"query={run_name.CLOSER_QUERY}" in args
            return closed_by(closers[int(number)])
        if args[:2] == ["api", "graphql"]:
            assert f"limit={run_name.RECENT_LIMIT}" in args
            return {"data": {"repository": {"issues": {"nodes": recent or []}}}}
        assert args[:2] == ["issue", "view"]
        if args[-1] == "comments":
            assert comments is not None
            return {"comments": comments[int(args[2])]}
        return viewed

    return gh


def test_report_lists_open_runs_by_number_and_skips_other_titles() -> None:
    issues = [
        issue(12, "Run: Capybara (code)", "2026-09-25T10:00:00Z"),
        issue(10, "Run: Axolotl (lessons)", "2026-09-25T08:00:00Z"),
        issue(11, "Run: Badger (lessons)", "2026-09-25T09:00:00Z", state="CLOSED"),
        issue(13, "Not a run", "2026-09-25T11:00:00Z"),
    ]
    result = run_name.report(issues, SEQUENCE, run_name.Args())
    assert list(result) == ["open", "next"]
    assert result["next"] == "Dingo"
    open_runs = cast("list[Run]", result["open"])
    assert [r["number"] for r in open_runs] == [10, 12]


def test_format_report_matches_the_javascript_json_format() -> None:
    result = run_name.report(
        [issue(513, "Run: Ocelot (harness)", "2026-09-26T08:53:16Z")],
        SEQUENCE,
        run_name.Args(check=513),
    )
    assert run_name.format_report(result) == (
        "{\n"
        '  "open": [\n'
        "    {\n"
        '      "number": 513,\n'
        '      "name": "Ocelot",\n'
        '      "kind": "harness",\n'
        '      "open": true,\n'
        '      "createdAt": "2026-09-26T08:53:16Z"\n'
        "    }\n"
        "  ],\n"
        '  "next": "Panda",\n'
        '  "takenBy": null\n'
        "}\n"
    )
    assert run_name.format_report({"open": [], "next": "Axolotl"}) == (
        '{\n  "open": [],\n  "next": "Axolotl"\n}\n'
    )


def test_main_prints_the_report(capsys: pytest.CaptureFixture[str]) -> None:
    listed = [issue(10, "Run: Axolotl (lessons)", "2026-09-25T08:00:00Z")]
    assert run_name.main([], gh=fake_gh(listed)) == 0
    assert json.loads(capsys.readouterr().out) == {
        "open": [run_name.run_of(listed[0])],
        "next": "Badger",
    }


def test_main_check_merges_the_viewed_issue_and_names_the_older_rival(
    capsys: pytest.CaptureFixture[str],
) -> None:
    older = issue(10, "Run: Axolotl (lessons)", "2026-09-25T08:00:00Z")
    mine = issue(11, "Run: Axolotl (code)", "2026-09-25T08:00:05Z")
    assert run_name.main(["--check", "11"], gh=fake_gh([older], mine)) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["takenBy"]["number"] == 10
    assert [r["number"] for r in out["open"]] == [10, 11]


def test_main_exits_2_with_usage_for_bad_arguments(capsys: pytest.CaptureFixture[str]) -> None:
    assert run_name.main(["--check", "x"], gh=fake_gh([])) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == (
        'run-name: --check needs an issue number, got "x"\n' + run_name.USAGE + "\n"
    )


def test_main_exits_1_for_an_issue_that_is_not_a_run(capsys: pytest.CaptureFixture[str]) -> None:
    viewed = issue(372, "Move run-name out of site/", "2026-09-25T08:00:00Z")
    assert run_name.main(["--check", "372"], gh=fake_gh([], viewed)) == 1
    assert capsys.readouterr().err == "run-name: issue #372 is not a run issue\n"


def test_main_exits_1_for_a_wrong_names_file(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    names = tmp_path / "run-names.txt"
    names.write_text("Aone\n", encoding="utf-8")
    assert run_name.main([], gh=fake_gh([]), names_file=names) == 1
    assert "not 1" in capsys.readouterr().err
    assert run_name.main([], gh=fake_gh([]), names_file=tmp_path / "missing.txt") == 1


def test_gh_json_parses_the_output(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        assert cmd[:3] == ["gh", "issue", "list"]
        return subprocess.CompletedProcess(cmd, 0, stdout='[{"number": 1}]')

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert run_name.gh_json(["issue", "list"]) == [{"number": 1}]


@pytest.mark.parametrize(
    "failure",
    [
        subprocess.CalledProcessError(1, ["gh"]),
        FileNotFoundError("gh"),
    ],
)
def test_gh_json_raises_run_name_error_when_gh_fails(
    monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        raise failure

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(run_name.RunNameError, match="run-name: gh issue view failed"):
        run_name.gh_json(["issue", "view", "1"])


def test_gh_json_raises_run_name_error_on_output_that_is_not_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="not json")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(run_name.RunNameError, match="failed"):
        run_name.gh_json(["issue", "list"])


# The harness exclusivity check

# The two refusals exactly as .claude/skills/wave/SKILL.md, "Starting a run",
# step 1, gives them, with the placeholders filled in.
HARNESS_FIRST = "A harness run starts only when no other run is open. Open: "
HARNESS_OPEN = "Run {name} (#{number}) is a harness run. No other run starts while it is open."
SKILL_TEXT = (
    pathlib.Path(__file__).resolve().parent.parent / ".claude" / "skills" / "wave" / "SKILL.md"
).read_text(encoding="utf-8")


def open_run(number: int, name: str, kind: str, is_open: bool = True) -> Run:
    return {
        "number": number,
        "name": name,
        "kind": kind,
        "open": is_open,
        "createdAt": f"2026-09-27T{number % 24:02d}:00:00Z",
    }


SEAL = open_run(586, "Seal", "harness")
OTTER = open_run(580, "Otter", "code")
PUMA = open_run(590, "Puma", "lessons")


def refusal(runs: Sequence[Run], args: run_name.Args) -> str | None:
    kind, others = run_name.counted_runs(runs, args)
    return run_name.exclusivity_refusal(kind, others)


def test_skill_md_gives_the_two_refusals_the_script_prints() -> None:
    assert f"`{HARNESS_FIRST}Run <Name> (#<n>), ...`" in SKILL_TEXT
    assert "`" + HARNESS_OPEN.format(name="<Name>", number="<n>") + "`" in SKILL_TEXT


def test_a_new_harness_run_is_refused_while_other_runs_are_open() -> None:
    assert refusal([PUMA, OTTER], run_name.Args(exclusive="harness")) == (
        HARNESS_FIRST + "Run Otter (#580), Run Puma (#590)"
    )


def test_a_new_run_of_another_kind_is_refused_while_a_harness_run_is_open() -> None:
    assert refusal([OTTER, SEAL], run_name.Args(exclusive="code")) == HARNESS_OPEN.format(
        name="Seal", number=586
    )


def test_a_resume_of_the_harness_run_passes_when_no_other_run_is_open() -> None:
    assert refusal([SEAL], run_name.Args(resume="Seal")) is None
    assert refusal([SEAL], run_name.Args(exclusive="harness", resume="Seal")) is None


def test_a_resume_of_the_harness_run_is_refused_while_another_run_is_open() -> None:
    assert refusal([SEAL, OTTER], run_name.Args(resume="Seal")) == (
        HARNESS_FIRST + "Run Otter (#580)"
    )


def test_a_resume_of_another_run_is_refused_while_a_harness_run_is_open() -> None:
    assert refusal([OTTER, SEAL], run_name.Args(resume="Otter")) == HARNESS_OPEN.format(
        name="Seal", number=586
    )


def test_every_run_passes_when_no_run_is_open() -> None:
    assert refusal([], run_name.Args(exclusive="harness")) is None
    assert refusal([], run_name.Args(exclusive="code")) is None


def test_closed_runs_do_not_count() -> None:
    closed = open_run(500, "Ocelot", "harness", is_open=False)
    assert refusal([closed], run_name.Args(exclusive="code")) is None
    assert refusal([closed, OTTER], run_name.Args(exclusive="lessons")) is None


def test_runs_of_other_kinds_share_the_repo_without_a_refusal() -> None:
    assert refusal([OTTER, PUMA], run_name.Args(exclusive="code")) is None


def test_after_the_create_only_older_runs_count_so_the_higher_number_refuses() -> None:
    # Two new runs race: Seal (#586, harness) and Puma (#590, lessons) both
    # passed step 1 and opened their issues. The issue number orders them.
    both = [SEAL, PUMA]
    assert refusal(both, run_name.Args(check=586, exclusive="harness")) is None
    assert refusal(both, run_name.Args(check=590, exclusive="lessons")) == HARNESS_OPEN.format(
        name="Seal", number=586
    )
    # The same race the other way round: the harness run has the higher number.
    otter_first = [OTTER, SEAL]
    assert refusal(otter_first, run_name.Args(check=580, exclusive="code")) is None
    assert refusal(otter_first, run_name.Args(check=586, exclusive="harness")) == (
        HARNESS_FIRST + "Run Otter (#580)"
    )


def test_after_the_create_the_kind_comes_from_the_issue_title() -> None:
    assert refusal([OTTER, PUMA], run_name.Args(check=590)) is None


@pytest.mark.parametrize(
    ("args", "message"),
    [
        (run_name.Args(resume="Tapir"), "run-name: no open run is named Tapir"),
        (
            run_name.Args(resume="Ocelot"),
            "run-name: no open run is named Ocelot",
        ),
        (
            run_name.Args(exclusive="code", resume="Seal"),
            "run-name: --exclusive code, but run Seal (#586) is a harness run",
        ),
        (
            run_name.Args(check=586, exclusive="code"),
            "run-name: --exclusive code, but run Seal (#586) is a harness run",
        ),
        (run_name.Args(check=999, exclusive="code"), "run-name: issue #999 is not a run issue"),
        (run_name.Args(), "run-name: the exclusivity check needs --exclusive or --resume"),
    ],
)
def test_counted_runs_raises_for_a_wrong_run_or_kind(args: run_name.Args, message: str) -> None:
    closed = open_run(500, "Ocelot", "harness", is_open=False)
    with pytest.raises(run_name.RunNameError) as caught:
        run_name.counted_runs([closed, SEAL], args)
    assert str(caught.value) == message


SEAL_ISSUE = issue(586, "Run: Seal (harness)", "2026-09-27T20:41:05Z")
OTTER_ISSUE = issue(580, "Run: Otter (code)", "2026-09-27T20:00:00Z")


def test_main_exits_3_and_prints_the_refusal_when_the_check_refuses(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run_name.main(["--exclusive", "code"], gh=fake_gh([SEAL_ISSUE])) == run_name.REFUSED
    assert run_name.REFUSED == 3
    captured = capsys.readouterr()
    message = HARNESS_OPEN.format(name="Seal", number=586)
    assert json.loads(captured.out)["refusal"] == message
    assert captured.err == message + "\n"


def test_main_exits_0_with_a_null_refusal_when_the_run_may_start(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert (
        run_name.main(["--exclusive", "harness", "--resume", "Seal"], gh=fake_gh([SEAL_ISSUE])) == 0
    )
    captured = capsys.readouterr()
    assert json.loads(captured.out)["refusal"] is None
    assert captured.err == ""


def test_main_check_and_exclusive_print_takenby_and_the_refusal(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = run_name.main(
        ["--check", "586", "--exclusive", "harness"], gh=fake_gh([OTTER_ISSUE], SEAL_ISSUE)
    )
    assert code == run_name.REFUSED
    out = json.loads(capsys.readouterr().out)
    assert out["takenBy"] is None
    assert out["refusal"] == HARNESS_FIRST + "Run Otter (#580)"


def test_main_exits_1_for_a_resumed_run_that_is_not_open(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run_name.main(["--resume", "Tapir"], gh=fake_gh([SEAL_ISSUE])) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "run-name: no open run is named Tapir\n"


# The newest issues, read past the label listing (#616)


def recent(number: int, title: str, created_at: str, *labels: str) -> run_name.RecentIssue:
    return {
        "number": number,
        "title": title,
        "state": "OPEN",
        "createdAt": created_at,
        "labels": {"nodes": [{"name": label} for label in labels]},
    }


SEAL_RECENT = recent(586, "Run: Seal (harness)", "2026-09-27T20:41:05Z", run_name.RUN_LABEL)
PUMA_RECENT = recent(590, "Run: Puma (lessons)", "2026-09-27T20:41:07Z", run_name.RUN_LABEL)


def test_check_sees_a_rival_the_label_listing_does_not_show_yet(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Seal (#586, harness) opened two seconds before Puma (#590), and the
    # label listing shows neither yet. The newest issues show both.
    gh = fake_gh([OTTER_ISSUE], recent=[PUMA_RECENT, SEAL_RECENT])
    code = run_name.main(["--check", "590", "--exclusive", "lessons"], gh=gh)
    assert code == run_name.REFUSED
    out = json.loads(capsys.readouterr().out)
    assert out["refusal"] == HARNESS_OPEN.format(name="Seal", number=586)
    assert [r["number"] for r in out["open"]] == [580, 586, 590]


def test_check_of_a_harness_run_sees_a_rival_the_label_listing_does_not_show_yet(
    capsys: pytest.CaptureFixture[str],
) -> None:
    mine = recent(591, "Run: Quokka (harness)", "2026-09-27T20:41:09Z", run_name.RUN_LABEL)
    gh = fake_gh([], recent=[mine, PUMA_RECENT])
    code = run_name.main(["--check", "591", "--exclusive", "harness"], gh=gh)
    assert code == run_name.REFUSED
    assert json.loads(capsys.readouterr().out)["refusal"] == HARNESS_FIRST + "Run Puma (#590)"


def test_with_recent_adds_run_issues_and_the_checked_issue_only() -> None:
    other = recent(588, "Run: Rhea (code)", "2026-09-27T20:41:06Z", "harness")
    mine = recent(590, "Run: Puma (lessons)", "2026-09-27T20:41:07Z")
    merged = run_name.with_recent([OTTER_ISSUE], [mine, other, SEAL_RECENT], 590)
    assert [i["number"] for i in merged] == [580, 590, 586]
    assert "labels" not in merged[1]


def test_with_recent_replaces_a_stale_listed_issue() -> None:
    closed = {**SEAL_RECENT, "state": "CLOSED"}
    merged = run_name.with_recent([SEAL_ISSUE], [cast("run_name.RecentIssue", closed)], 590)
    assert merged == [{**SEAL_ISSUE, "state": "CLOSED"}]


def test_check_views_the_issue_when_it_is_older_than_the_newest_issues(
    capsys: pytest.CaptureFixture[str],
) -> None:
    calls: list[Sequence[str]] = []
    inner = fake_gh([], SEAL_ISSUE, recent=[PUMA_RECENT])

    def gh(args: Sequence[str]) -> object:
        calls.append(args)
        return inner(args)

    assert run_name.main(["--check", "586"], gh=gh) == 0
    assert [list(c[:2]) for c in calls] == [
        ["issue", "list"],
        ["api", "graphql"],
        ["issue", "view"],
    ]
    assert [r["number"] for r in json.loads(capsys.readouterr().out)["open"]] == [586, 590]


def test_check_makes_two_gh_calls_when_the_newest_issues_hold_it() -> None:
    calls: list[Sequence[str]] = []
    inner = fake_gh([OTTER_ISSUE], recent=[PUMA_RECENT])

    def gh(args: Sequence[str]) -> object:
        calls.append(args)
        return inner(args)

    issues = run_name.fetch_issues(590, gh)
    assert [i["number"] for i in issues] == [580, 590]
    assert len(calls) == 2


@pytest.mark.parametrize("answer", [{}, {"data": None}, []])
def test_fetch_recent_raises_when_the_answer_holds_no_issues(answer: object) -> None:
    with pytest.raises(run_name.RunNameError, match="gh api graphql gave no issues"):
        run_name.fetch_recent(lambda _: answer)


# Resuming a run whose issue a wave merge closed (#627)

TAPIR_CLOSED = issue(604, "Run: Tapir (harness)", "2026-09-30T08:00:00Z", state="CLOSED")
TAPIR_OLD = issue(300, "Run: Tapir (code)", "2026-09-01T08:00:00Z", state="CLOSED")


PR_620: dict[str, object] = {"__typename": "PullRequest", "number": 620}


def closed_by(closer: dict[str, object] | None) -> object:
    """The CLOSER_QUERY answer for an issue that `closer` closed last."""
    nodes = [{"closer": closer}]
    return {"data": {"repository": {"issue": {"timelineItems": {"nodes": nodes}}}}}


def comment(login: str, body: str) -> run_name.Comment:
    return {"author": {"login": login}, "body": body}


STOPPED = comment("lsimons-bot", "Run ended: queue empty\n\nCo-Authored-By: ...")


def test_has_stop_comment_reads_only_trusted_run_ended_comments() -> None:
    assert run_name.has_stop_comment([STOPPED])
    assert run_name.has_stop_comment([comment("lsimons", "Run ended: stop"), comment("x", "hi")])
    assert not run_name.has_stop_comment([comment("someone", "Run ended: stop")])
    assert not run_name.has_stop_comment([comment("lsimons-bot", "Wave 2: Run ended: no")])
    assert not run_name.has_stop_comment([])
    assert run_name.has_stop_comment([comment("lsimons", "Stop condition: queue empty")])


def test_closer_of_names_the_pull_request_or_commit_that_closed_the_issue() -> None:
    assert run_name.closer_of(closed_by(PR_620)) == "PR #620"
    commit: dict[str, object] = {"__typename": "Commit", "abbreviatedOid": "de3a424"}
    assert run_name.closer_of(closed_by(commit)) == "commit de3a424"
    assert run_name.closer_of(closed_by(None)) is None
    assert run_name.closer_of(closed_by({"__typename": "ProjectV2"})) is None
    empty: dict[str, object] = {"data": {"repository": {"issue": {"timelineItems": {"nodes": []}}}}}
    assert run_name.closer_of(empty) is None


@pytest.mark.parametrize("answer", [{}, {"data": {"repository": {"issue": None}}}, []])
def test_closer_of_raises_when_the_answer_holds_no_close_event(answer: object) -> None:
    with pytest.raises(run_name.RunNameError, match="gh api graphql gave no close event"):
        run_name.closer_of(answer)


def test_the_trusted_accounts_are_the_verdict_authors_of_wave_status() -> None:
    import wave_status

    assert run_name.TRUSTED_VERDICT_AUTHORS is wave_status.TRUSTED_VERDICT_AUTHORS


def test_newest_closed_run_takes_the_newest_and_only_when_no_open_run_has_the_name() -> None:
    runs = [
        run(300, "Tapir", False, "2026-09-01T08:00:00Z"),
        run(604, "Tapir", False, "2026-09-30T08:00:00Z"),
        run(605, "Seal", True, "2026-09-30T09:00:00Z"),
    ]
    newest = run_name.newest_closed_run(runs, "Tapir")
    assert newest is not None
    assert newest["number"] == 604
    assert run_name.newest_closed_run([*runs, run(700, "Tapir", True, "")], "Tapir") is None
    assert run_name.newest_closed_run(runs, "Seal") is None
    assert run_name.newest_closed_run(runs, "Urial") is None


def test_resume_of_a_closed_run_without_a_stop_comment_prints_reopen(
    capsys: pytest.CaptureFixture[str],
) -> None:
    gh = fake_gh(
        [TAPIR_OLD, TAPIR_CLOSED],
        comments={604: [comment("x", "Run ended: fake")]},
        closers={604: PR_620},
    )
    assert run_name.main(["--resume", "Tapir"], gh=gh) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["reopen"] == {"number": 604, "closedBy": "PR #620"}
    assert out["refusal"] is None
    assert out["open"] == []


def test_resume_of_a_closed_run_with_a_stop_comment_exits_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # The older Tapir has no stop comment, but only the newest one counts.
    gh = fake_gh(
        [TAPIR_OLD, TAPIR_CLOSED],
        comments={604: [STOPPED], 300: []},
        closers={604: PR_620, 300: PR_620},
    )
    assert run_name.main(["--resume", "Tapir"], gh=gh) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == (
        "run-name: no open run is named Tapir, and run Tapir (#604) has ended: "
        "it has a stop comment\n"
    )


def test_resume_of_a_run_closed_by_hand_exits_1_without_reading_comments(
    capsys: pytest.CaptureFixture[str],
) -> None:
    gh = fake_gh([TAPIR_CLOSED], closers={604: None})
    assert run_name.main(["--resume", "Tapir"], gh=gh) == 1
    assert capsys.readouterr().err == (
        "run-name: no open run is named Tapir, and run Tapir (#604) has ended: "
        "no merge closed its issue\n"
    )


def test_resume_of_a_closed_run_is_refused_while_another_run_is_open(
    capsys: pytest.CaptureFixture[str],
) -> None:
    gh = fake_gh([OTTER_ISSUE, TAPIR_CLOSED], comments={604: []}, closers={604: PR_620})
    assert run_name.main(["--resume", "Tapir"], gh=gh) == run_name.REFUSED
    out = json.loads(capsys.readouterr().out)
    assert out["refusal"] == HARNESS_FIRST + "Run Otter (#580)"
    assert out["reopen"] == {"number": 604, "closedBy": "PR #620"}


def test_a_closed_resumable_run_does_not_count_for_a_new_run(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run_name.main(["--exclusive", "code"], gh=fake_gh([TAPIR_CLOSED])) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["refusal"] is None
    assert "reopen" not in out


def test_resume_of_an_open_run_prints_a_null_reopen_and_reads_no_comments(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run_name.main(["--resume", "Seal"], gh=fake_gh([TAPIR_CLOSED, SEAL_ISSUE])) == 0
    assert json.loads(capsys.readouterr().out)["reopen"] is None


@pytest.mark.parametrize("answer", [{}, [], {"data": 1}])
def test_resumable_run_raises_when_the_answer_holds_no_comments(answer: object) -> None:
    def gh(args: Sequence[str]) -> object:
        return closed_by(PR_620) if args[:2] == ["api", "graphql"] else answer

    with pytest.raises(run_name.RunNameError, match="gh issue view gave no comments"):
        run_name.resumable_run([TAPIR_CLOSED], "Tapir", gh)
