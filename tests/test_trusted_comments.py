"""Tests for `mise run wave-status -- --claims-and-follow-ups` (#605).

The dispatcher files what a follow-ups comment on the run issue lists, and
drops an issue from its wave for another run's claim comment. Anyone can
comment on a public issue, so both count only from TRUSTED_VERDICT_AUTHORS.
"""

import io
import json
import subprocess

import pytest

import wave_status as ws
from wave_status import IssueComment, claim_of, follow_ups_of, trusted_comments

ATTRIBUTION = (
    "\n\nCo-Authored-By: lsimons-bot <bot@leosimons.com>\nAssisted-by: Claude:claude-opus-5-5"
)
FOLLOW_UPS = "Follow-ups from TAPIR wave 3\n\n## Fix the thing\n\nLabels: code, ready-for-agent"


def comment(body: str, author: str = "lsimons", at: str = "2026-09-30T10:00:00Z") -> IssueComment:
    return {"author": author, "body": body, "createdAt": at, "url": f"https://example.test/{at}"}


@pytest.mark.parametrize(
    "first_line",
    [
        "Follow-ups from TAPIR wave 3",
        "## Follow-ups from TAPIR wave 3",
        "# Follow-ups from TAPIR wave 3",
        "**Follow-ups from TAPIR wave 3**",
        "Follow-ups from TAPIR wave 3  ",
        "Follow-ups from TAPIR wave 3:",
        "## Follow-ups from TAPIR wave 3:",
        "**Follow-ups from TAPIR wave 3:**",
    ],
)
def test_follow_ups_of_reads_the_first_line(first_line: str) -> None:
    assert follow_ups_of(f"{first_line}\n\n## A title\n\nBody") == ("TAPIR", 3)


def test_follow_ups_of_reads_a_first_line_posted_with_crlf_line_endings() -> None:
    assert follow_ups_of("Follow-ups from TAPIR wave 3\r\n\r\n## A title\r\n") == ("TAPIR", 3)
    assert follow_ups_of("Follow-ups from TAPIR wave 3:\r\nBody") == ("TAPIR", 3)


@pytest.mark.parametrize(
    "body",
    [
        "Follow-ups from the four waves, each checked against main.",
        "Some text\nFollow-ups from TAPIR wave 3",
        "Follow-ups from Tapir wave 3",
        "Follow-ups from TAPIR wave 0",
        "Follow-ups from TAPIR wave 3 and more",
        "Follow-ups from TAPIR wave 3 (integration mode)",
        "\nFollow-ups from TAPIR wave 3",
        "Follow-ups from TAPIR wave 3::",
        "**Follow-ups from TAPIR wave 3**:",
        "**Follow-ups from TAPIR wave 3:",
        "```\nFollow-ups from TAPIR wave 3\n```",
    ],
)
def test_follow_ups_of_rejects_other_wording(body: str) -> None:
    assert follow_ups_of(body) is None


def test_claim_of_reads_claims_and_releases() -> None:
    assert claim_of("Claimed by run Tapir, wave 3" + ATTRIBUTION) == ("claim", "Tapir", 3)
    assert claim_of("Claim released by run Seal, wave 12 (the run ended)") == (
        "release",
        "Seal",
        12,
    )


def test_claim_of_rejects_what_is_claim_rejects() -> None:
    assert claim_of("Claimed by run Tapir, wave 3\nBranch: feat/1-x") is None
    assert claim_of("I think this was Claimed by run Tapir, wave 3") is None


def test_an_untrusted_follow_ups_comment_is_ignored() -> None:
    report = trusted_comments(604, [comment(FOLLOW_UPS, author="outsider")])
    assert report["followUps"] == []


def test_a_trusted_follow_ups_comment_is_listed_with_its_author_and_time() -> None:
    report = trusted_comments(604, [comment(FOLLOW_UPS, author="lsimons-bot")])
    assert report["followUps"] == [
        {
            "run": "TAPIR",
            "wave": 3,
            "author": "lsimons-bot",
            "createdAt": "2026-09-30T10:00:00Z",
            "url": "https://example.test/2026-09-30T10:00:00Z",
            "body": FOLLOW_UPS,
        }
    ]
    assert report["claims"] == []


def test_an_untrusted_claim_is_ignored() -> None:
    comments = [
        comment("Claimed by run Zebra, wave 1", author="outsider", at="2026-09-30T09:00:00Z"),
        comment("Claimed by run Tapir, wave 3" + ATTRIBUTION, at="2026-09-30T10:00:00Z"),
    ]
    claims = trusted_comments(605, comments)["claims"]
    assert [(c["run"], c["author"]) for c in claims] == [("Tapir", "lsimons")]


def test_an_untrusted_release_releases_nothing() -> None:
    comments = [
        comment("Claimed by run Seal, wave 2", at="2026-09-30T09:00:00Z"),
        comment("Claim released by run Seal, wave 2", author="outsider", at="2026-09-30T09:30:00Z"),
    ]
    claims = trusted_comments(605, comments)["claims"]
    assert len(claims) == 1
    assert claims[0]["releasedBy"] is None


def test_a_release_marks_the_earlier_claim_of_the_same_run_and_wave_oldest_first() -> None:
    comments = [
        comment("Claim released by run Seal, wave 2 (the run ended)", at="2026-09-30T11:00:00Z"),
        comment("Claimed by run Seal, wave 1", at="2026-09-30T08:00:00Z"),
        comment("Claimed by run Seal, wave 2", at="2026-09-30T09:00:00Z"),
        comment("Claimed by run Tapir, wave 3", at="2026-09-30T12:00:00Z"),
    ]
    claims = trusted_comments(605, comments)["claims"]
    assert [(c["kind"], c["run"], c["wave"], c["releasedBy"]) for c in claims] == [
        ("claim", "Seal", 1, None),
        ("claim", "Seal", 2, "https://example.test/2026-09-30T11:00:00Z"),
        ("release", "Seal", 2, None),
        ("claim", "Tapir", 3, None),
    ]


def test_a_release_before_the_claim_releases_nothing() -> None:
    comments = [
        comment("Claim released by run Seal, wave 2", at="2026-09-30T08:00:00Z"),
        comment("Claimed by run Seal, wave 2", at="2026-09-30T09:00:00Z"),
    ]
    claims = trusted_comments(605, comments)["claims"]
    assert claims[1]["releasedBy"] is None


def test_other_trusted_comments_are_left_out() -> None:
    comments = [comment("Verdict: approve\nBranch: feat/605-x"), comment("Run ended: done")]
    assert trusted_comments(605, comments) == {
        "issue": 605,
        "followUps": [],
        "unmatchedFollowUps": [],
        "claims": [],
    }


def test_a_trusted_comment_that_mentions_follow_ups_but_does_not_match_is_named() -> None:
    body = "\nFollow-ups from TAPIR wave 3 (integration mode)\n\n## Fix the thing"
    comments = [
        comment(body, author="lsimons-bot", at="2026-09-30T10:00:00Z"),
        comment(FOLLOW_UPS, at="2026-09-30T11:00:00Z"),
    ]
    report = trusted_comments(604, comments)
    assert [f["url"] for f in report["followUps"]] == ["https://example.test/2026-09-30T11:00:00Z"]
    assert report["unmatchedFollowUps"] == [
        {
            "author": "lsimons-bot",
            "createdAt": "2026-09-30T10:00:00Z",
            "url": "https://example.test/2026-09-30T10:00:00Z",
            "firstLine": "",
        }
    ]


def test_an_untrusted_comment_that_mentions_follow_ups_is_not_named() -> None:
    comments = [comment("Follow-ups from TAPIR wave 3 (mine)", author="outsider")]
    assert trusted_comments(604, comments)["unmatchedFollowUps"] == []


class FakeCommands:
    def __init__(self, outputs: dict[str, str]) -> None:
        self.outputs = outputs

    def __call__(self, command: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
        return subprocess.CompletedProcess(command, 0, self.outputs[" ".join(command)].encode())


def gh(issue: int) -> str:
    return f"gh issue view {issue} -R schubergphilis/ai-training --json comments"


def run_main(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    argv: list[str],
    outputs: dict[str, str],
) -> tuple[int, str, str]:
    monkeypatch.setattr(subprocess, "run", FakeCommands(outputs))
    buffer = io.BytesIO()

    class Stdout:
        def __init__(self) -> None:
            self.buffer = buffer

    monkeypatch.setattr("sys.stdout", Stdout())
    code = ws.main(argv)
    return code, buffer.getvalue().decode(), capsys.readouterr().err


def raw(body: str, author: str) -> dict[str, object]:
    return {
        "author": {"login": author},
        "body": body,
        "createdAt": "2026-09-30T10:00:00Z",
        "url": "https://example.test/c",
    }


def test_main_prints_trusted_claims_and_follow_ups_as_json(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    run_issue = json.dumps({"comments": [raw(FOLLOW_UPS, "outsider"), raw(FOLLOW_UPS, "lsimons")]})
    issue = json.dumps(
        {
            "comments": [
                raw("Claimed by run Zebra, wave 1", "outsider"),
                raw("Claimed by run Tapir, wave 3", "lsimons"),
            ]
        }
    )
    code, out, err = run_main(
        monkeypatch,
        capsys,
        ["--claims-and-follow-ups", "#604", "605"],
        {gh(604): run_issue, gh(605): issue},
    )
    assert (code, err) == (0, "")
    report = json.loads(out)
    assert report["trustedAuthors"] == ["lsimons", "lsimons-bot"]
    assert [i["issue"] for i in report["issues"]] == [604, 605]
    assert [f["author"] for f in report["issues"][0]["followUps"]] == ["lsimons"]
    assert [c["run"] for c in report["issues"][1]["claims"]] == ["Tapir"]


def test_main_exits_2_without_issues(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, err = run_main(monkeypatch, capsys, ["--claims-and-follow-ups"], {})
    assert (code, out) == (2, "")
    assert err == (
        "wave-status: name the issues after --claims-and-follow-ups\n"
        "usage: mise run wave-status -- --claims-and-follow-ups <issue> [<issue> ...]\n"
    )


def test_main_exits_2_on_a_bad_issue_number(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, err = run_main(monkeypatch, capsys, ["--claims-and-follow-ups", "twelve"], {})
    assert code == 2
    assert err.startswith('wave-status: "twelve" is not an issue number\n')
