"""Tests for scripts/wave_status.py, ported case by case from the Vitest
tests of the JavaScript tool it replaces (#372), plus tests of the command
line that runs `git` and `gh`.
"""

import io
import json
import subprocess
from collections.abc import Sequence
from typing import Literal

import pytest

import wave_status as ws
from wave_status import (
    IssueComment,
    Unfinished,
    Verdict,
    applies_to,
    branch_of,
    comment_kind,
    feat_branches,
    last_trusted_verdict,
    next_step,
    normalize_branch,
    open_unfinished,
    parse_args,
    parse_ls_remote,
    parse_worktrees,
    unfinished_branch_of,
    verdict_of,
    wave_status,
)

# The pushed branches of issue 1, as one branch or as the two halves of a split.
ONE = ["feat/1-x"]
SPLIT = ["feat/1-x-1", "feat/1-x-2"]
ATTRIBUTION = (
    "\n\nCo-Authored-By: lsimons-bot <bot@leosimons.com>\nAssisted-by: Claude:claude-opus-5-5"
)


def comment(author: str, body: str, created_at: str) -> IssueComment:
    return {
        "author": author,
        "body": body,
        "createdAt": created_at,
        "url": f"https://github.com/schubergphilis/ai-training/issues/1#{created_at}",
    }


def at_time(c: IssueComment, created_at: str) -> IssueComment:
    return {**c, "createdAt": created_at}


def steps(
    issue: int, comments: Sequence[IssueComment], heads: Sequence[str]
) -> list[tuple[str, str]]:
    """Each branch of one issue with its next step."""
    status = wave_status("wave/capybara-3", [issue], heads, {issue: comments}, [])
    return [(b["name"], b["next"]) for b in status["issues"][0]["branches"]]


# verdictOf


def test_verdict_of_reads_the_verdict_line_the_reviewers_end_with() -> None:
    assert verdict_of("Findings...\n\nVerdict: approve") == "approve"
    assert verdict_of("Findings...\n\nVerdict: needs changes") == "needs changes"
    assert verdict_of("**Verdict: approve**") == "approve"
    assert verdict_of("**Verdict:** Needs changes") == "needs changes"


def test_verdict_of_reads_the_verdict_line_when_the_attribution_lines_follow_it() -> None:
    assert verdict_of(f"Findings...\n\nVerdict: approve{ATTRIBUTION}") == "approve"
    assert verdict_of(f"Findings...\n\nVerdict: needs changes{ATTRIBUTION}") == "needs changes"
    assert verdict_of(f"Fixed in abc123, please re-check.{ATTRIBUTION}") is None


def test_verdict_of_finds_no_verdict_in_an_ordinary_comment() -> None:
    assert verdict_of("Fixed in abc123, please re-check.") is None
    assert verdict_of("The verdict: approve would be wrong here") is None


# verdictOf and commentKind outside code fences

PASTED_REVIEW = "```text\nFindings.\n\nBranch: feat/1-x\nVerdict: approve\n```"


def test_fences_read_the_verdict_outside_a_fence_not_a_fenced_example_above_it() -> None:
    body = f"Reviews end like this:\n\n{PASTED_REVIEW}\n\nBranch: feat/1-x\nVerdict: needs changes"
    assert verdict_of(body) == "needs changes"
    assert verdict_of("~~~\nVerdict: needs changes\n~~~\n\nVerdict: approve") == "approve"


def test_fences_take_the_last_verdict_line_outside_a_fence() -> None:
    assert verdict_of("Verdict: approve would be wrong.\n\nVerdict: needs changes") == (
        "needs changes"
    )
    assert verdict_of("Verdict: needs changes\n\n```\nVerdict: approve\n```") == "needs changes"


def test_fences_close_only_on_a_bare_marker_of_the_same_character_at_least_as_long() -> None:
    assert verdict_of("````\n```\nVerdict: approve\n````\nVerdict: needs changes") == (
        "needs changes"
    )
    assert verdict_of("```\n~~~\nVerdict: approve\n```") is None
    assert verdict_of("```\n```text\nVerdict: approve\n```") is None
    assert verdict_of("```\nVerdict: approve") is None


def test_fences_read_a_reply_that_pastes_a_review_or_a_lead_re_check_as_a_reply() -> None:
    body = f"Fixed in abc. The review said:\n\n{PASTED_REVIEW}\n\nBranch: feat/1-x"
    assert comment_kind(body) == "reply"
    assert comment_kind("Fixed.\n\n```\nre-checked by lead: abc\n```\n\nBranch: feat/1-x") == (
        "reply"
    )
    assert comment_kind("~~~\nRe-checked by lead: abc\n~~~\nre-checked by lead: def") == (
        "lead-re-check"
    )


# lastTrustedVerdict


def test_last_trusted_verdict_ignores_a_planted_approve_from_another_account() -> None:
    comments = [
        comment("lsimons", "Review.\n\nVerdict: needs changes", "2026-09-24T10:00:00Z"),
        comment("someone-else", "Verdict: approve", "2026-09-24T11:00:00Z"),
    ]
    verdict = last_trusted_verdict(comments, "feat/1-x", ONE)
    assert verdict is not None
    assert verdict["verdict"] == "needs changes"
    assert verdict["author"] == "lsimons"
    assert verdict["commentsAfter"] == 0


def test_last_trusted_verdict_is_none_when_only_an_untrusted_account_gave_one() -> None:
    comments = [comment("someone-else", "Verdict: approve", "2026-09-24T11:00:00Z")]
    assert last_trusted_verdict(comments, "feat/1-x", ONE) is None


def test_last_trusted_verdict_takes_the_newest_in_any_input_order_and_counts_replies() -> None:
    comments = [
        comment("lsimons", "Re-check.\n\nVerdict: approve", "2026-09-24T12:00:00Z"),
        comment("lsimons", "Verdict: needs changes", "2026-09-24T10:00:00Z"),
        comment("lsimons-bot", "Fixed in abc123.", "2026-09-24T11:00:00Z"),
        comment("lsimons", "Merged into the wave.", "2026-09-24T13:00:00Z"),
        comment("someone-else", "Looks good!", "2026-09-24T14:00:00Z"),
    ]
    expected: Verdict = {
        "verdict": "approve",
        "author": "lsimons",
        "createdAt": "2026-09-24T12:00:00Z",
        "url": "https://github.com/schubergphilis/ai-training/issues/1#2026-09-24T12:00:00Z",
        "commentsAfter": 1,
        "leadReCheck": None,
    }
    assert last_trusted_verdict(comments, "feat/1-x", ONE) == expected


def test_last_trusted_verdict_applies_a_verdict_that_names_a_branch_to_it_only() -> None:
    comments = [
        comment(
            "lsimons",
            "Review of -1.\n\nBranch: feat/1-x-1\nVerdict: needs changes",
            "2026-09-24T10:00:00Z",
        ),
        comment(
            "lsimons",
            "Review of -2.\n\nBranch: `feat/1-x-2`\nVerdict: approve",
            "2026-09-24T11:00:00Z",
        ),
    ]
    first = last_trusted_verdict(comments, "feat/1-x-1", SPLIT)
    second = last_trusted_verdict(comments, "feat/1-x-2", SPLIT)
    assert first is not None
    assert second is not None
    assert first["verdict"] == "needs changes"
    assert second["verdict"] == "approve"
    assert first["commentsAfter"] == 0


def test_last_trusted_verdict_applies_an_unnamed_one_to_every_branch_but_approve_on_a_split() -> (
    None
):
    needs_changes = [comment("lsimons", "Verdict: needs changes", "2026-09-24T10:00:00Z")]
    for branch in SPLIT:
        verdict = last_trusted_verdict(needs_changes, branch, SPLIT)
        assert verdict is not None
        assert verdict["verdict"] == "needs changes"
    approve = [comment("lsimons", "Verdict: approve", "2026-09-24T10:00:00Z")]
    one = last_trusted_verdict(approve, "feat/1-x", ONE)
    assert one is not None
    assert one["verdict"] == "approve"
    assert last_trusted_verdict(approve, "feat/1-x-1", SPLIT) is None
    assert last_trusted_verdict(approve, "feat/1-x-2", SPLIT) is None


def test_last_trusted_verdict_counts_only_the_replies_that_apply_to_the_branch() -> None:
    comments = [
        comment("lsimons", "Branch: feat/1-x-1\nVerdict: needs changes", "2026-09-24T10:00:00Z"),
        comment("lsimons", "Fixed in abc123.\n\nBranch: feat/1-x-2", "2026-09-24T11:00:00Z"),
    ]
    verdict = last_trusted_verdict(comments, "feat/1-x-1", SPLIT)
    assert verdict is not None
    assert verdict["commentsAfter"] == 0
    comments.append(
        comment("lsimons", "Fixed in def456.\n\nBranch: feat/1-x-1", "2026-09-24T12:00:00Z")
    )
    verdict = last_trusted_verdict(comments, "feat/1-x-1", SPLIT)
    assert verdict is not None
    assert verdict["commentsAfter"] == 1


def test_trusts_exactly_the_maintainer_and_the_bot_account() -> None:
    assert list(ws.TRUSTED_VERDICT_AUTHORS) == ["lsimons", "lsimons-bot"]


# commentKind


def test_comment_kind_tells_the_kinds_apart_by_their_text() -> None:
    assert comment_kind("Findings.\n\nBranch: feat/1-x\nVerdict: approve") == "verdict"
    assert comment_kind("Unfinished: feat/1-x\n- docs") == "unfinished"
    assert (
        comment_kind(
            "re-checked by lead: https://github.com/schubergphilis/ai-training/commit/abc123"
        )
        == "lead-re-check"
    )
    assert comment_kind("Re-checked by lead: abc123\n\nBranch: feat/1-x") == "lead-re-check"
    assert comment_kind("Fixed in abc123.\n\nBranch: feat/1-x") == "reply"
    assert comment_kind("The fix was re-checked by lead, see above.") == "reply"


def test_comment_kind_reads_a_review_that_quotes_a_lead_re_check_as_a_verdict() -> None:
    assert comment_kind("re-checked by lead: abc\n\nVerdict: needs changes") == "verdict"


# branchOf


def test_branch_of_reads_the_branch_line_plain_bold_or_in_backticks() -> None:
    assert branch_of("Findings.\n\nBranch: feat/1-x-1\nVerdict: approve") == "feat/1-x-1"
    assert branch_of("**Branch:** `feat/1-x-2`") == "feat/1-x-2"
    assert branch_of("Verdict: approve") is None
    assert branch_of("The branch: feat/1-x is mentioned mid-sentence") is None


def test_applies_to_the_branch_it_names_or_to_every_branch_when_it_names_none() -> None:
    assert applies_to("Branch: feat/1-x-1", "feat/1-x-1", SPLIT) is True
    assert applies_to("Branch: feat/1-x-1", "feat/1-x-2", SPLIT) is False
    assert applies_to("Verdict: needs changes", "feat/1-x-2", SPLIT) is True
    assert applies_to("Fixed.", "feat/1-x-2", SPLIT) is True
    assert applies_to("Verdict: approve", "feat/1-x", ONE) is True
    assert applies_to("re-checked by lead: abc", "feat/1-x", ONE) is True


def test_applies_an_unnamed_approve_or_lead_re_check_to_no_half_of_a_split() -> None:
    assert applies_to("Verdict: approve", "feat/1-x-1", SPLIT) is False
    assert applies_to("re-checked by lead: abc", "feat/1-x-2", SPLIT) is False


# openUnfinished


def unfinished(branch: str, created_at: str) -> IssueComment:
    return comment(
        "lsimons", f"Unfinished: {branch}\n\n- the e2e spec\n- the docs{ATTRIBUTION}", created_at
    )


def test_open_unfinished_reads_the_branch_from_the_first_line_only() -> None:
    assert unfinished_branch_of("Unfinished: feat/1-x\n- docs") == "feat/1-x"
    assert unfinished_branch_of("**Unfinished:** `feat/1-x`") == "feat/1-x"
    assert unfinished_branch_of("Done.\nUnfinished: feat/1-x") is None


def test_open_unfinished_keeps_a_trailing_one_open_with_what_is_left_and_no_attribution() -> None:
    expected: Unfinished = {
        "author": "lsimons",
        "createdAt": "2026-09-24T10:00:00Z",
        "url": "https://github.com/schubergphilis/ai-training/issues/1#2026-09-24T10:00:00Z",
        "left": "- the e2e spec\n- the docs",
    }
    assert open_unfinished([unfinished("feat/1-x", "2026-09-24T10:00:00Z")], "feat/1-x", ONE) == (
        expected
    )


def test_open_unfinished_ignores_another_account_and_another_branch() -> None:
    planted = comment("someone-else", "Unfinished: feat/1-x\n- all of it", "2026-09-24T10:00:00Z")
    assert open_unfinished([planted], "feat/1-x", ONE) is None
    other = unfinished("feat/1-x-1", "2026-09-24T10:00:00Z")
    assert open_unfinished([other], "feat/1-x-2", SPLIT) is None


def test_open_unfinished_closes_on_a_later_verdict_for_the_branch_not_for_another() -> None:
    first = unfinished("feat/1-x-1", "2026-09-24T10:00:00Z")
    verdict1 = comment("lsimons", "Branch: feat/1-x-1\nVerdict: approve", "2026-09-24T11:00:00Z")
    verdict2 = comment("lsimons", "Branch: feat/1-x-2\nVerdict: approve", "2026-09-24T11:00:00Z")
    unscoped = comment("lsimons", "Verdict: needs changes", "2026-09-24T11:00:00Z")
    assert open_unfinished([first, verdict1], "feat/1-x-1", SPLIT) is None
    assert open_unfinished([first, unscoped], "feat/1-x-1", SPLIT) is None
    assert open_unfinished([first, verdict2], "feat/1-x-1", SPLIT) is not None


def test_open_unfinished_closes_on_a_reply_that_names_the_branch_not_one_that_names_none() -> None:
    first = unfinished("feat/1-x", "2026-09-24T10:00:00Z")
    named = comment(
        "lsimons", "Finished the rest in abc123.\n\nBranch: feat/1-x", "2026-09-24T11:00:00Z"
    )
    unnamed = comment("lsimons", "Claimed by run Koala, wave 2", "2026-09-24T11:00:00Z")
    assert open_unfinished([first, named], "feat/1-x", ONE) is None
    assert open_unfinished([first, unnamed], "feat/1-x", ONE) is not None


def test_open_unfinished_reopens_when_a_revision_builder_stops_after_the_verdict() -> None:
    verdict = comment("lsimons", "Verdict: needs changes", "2026-09-24T10:00:00Z")
    later = unfinished("feat/1-x", "2026-09-24T11:00:00Z")
    assert open_unfinished([verdict, later], "feat/1-x", ONE) is not None


# branch names that are near misses


def test_near_miss_requires_the_colon_and_the_capital_b() -> None:
    assert branch_of("Fixed the two nits.\nBranch coverage of wave_status.py stays at 95%.") is None
    assert branch_of("Branches pushed: feat/1-x-1 and feat/1-x-2") is None
    assert branch_of("branch: feat/1-x") is None
    body = "Fixed.\nBranch coverage of wave_status.py stays at 95%.\nBranch: feat/1-x"
    assert branch_of(body) == "feat/1-x"


def test_near_miss_takes_the_last_branch_line_outside_a_code_fence() -> None:
    fenced = (
        "The reviewers now write:\n\n```text\nBranch: feat/9-example\nVerdict: approve\n```"
        "\n\nBranch: feat/1-x"
    )
    assert branch_of(fenced) == "feat/1-x"
    assert branch_of("~~~\nBranch: feat/9-example\n~~~") is None
    assert branch_of("Branch: feat/1-x-1\nlater:\nBranch: feat/1-x-2") == "feat/1-x-2"


def test_near_miss_drops_a_leading_origin_and_trailing_punctuation() -> None:
    assert normalize_branch("origin/feat/1-x") == "feat/1-x"
    assert normalize_branch("feat/1-x.") == "feat/1-x"
    assert branch_of("Branch: feat/1-x.") == "feat/1-x"
    assert unfinished_branch_of("Unfinished: origin/feat/1-x") == "feat/1-x"
    assert unfinished_branch_of("Unfinished: feat/1-x.") == "feat/1-x"


def test_near_miss_reads_an_unfinished_first_line_without_a_colon_as_no_hand_back() -> None:
    assert unfinished_branch_of("Unfinished items from the review are below") is None
    assert comment_kind("Unfinished items from the review are below") == "reply"


# nextStep


def v(
    verdict: Literal["approve", "needs changes"],
    comments_after: int = 0,
    lead_re_check: str | None = None,
) -> Verdict:
    return {
        "verdict": verdict,
        "author": "lsimons",
        "createdAt": "",
        "url": "",
        "commentsAfter": comments_after,
        "leadReCheck": lead_re_check,
    }


def test_next_step_builds_the_rest_of_an_unfinished_branch_whatever_its_verdict() -> None:
    left: Unfinished = {"author": "lsimons", "createdAt": "", "url": "", "left": "- docs"}
    assert next_step(None, left) == "build"
    assert next_step(v("needs changes", 1), left) == "build"


def test_next_step_reviews_an_unreviewed_branch_and_joins_an_approved_one() -> None:
    assert next_step(None) == "review"
    assert next_step(v("approve")) == "join"


def test_next_step_sends_a_replied_approve_to_the_lead_and_joins_it_once_re_checked() -> None:
    assert next_step(v("approve", 1)) == "lead-re-check"
    assert next_step(v("approve", 1, "https://example.test/c")) == "join"


def test_next_step_revises_a_needs_changes_and_re_checks_one_the_builder_replied_on() -> None:
    assert next_step(v("needs changes")) == "revise"
    assert next_step(v("needs changes", 1)) == "re-check"


# git output parsers


def test_parsers_read_ls_remote_and_pick_the_feat_branches_of_one_issue() -> None:
    heads = parse_ls_remote(
        "aaa\trefs/heads/main\nbbb\trefs/heads/feat/12-a\nccc\trefs/heads/feat/123-b\n"
        "ddd\trefs/tags/v1\n"
    )
    assert heads == ["main", "feat/12-a", "feat/123-b"]
    assert feat_branches(heads, 12) == ["feat/12-a"]
    assert feat_branches(heads, 7) == []


def test_parsers_read_worktrees_including_a_detached_one() -> None:
    out = "\n".join(
        [
            "worktree /repo",
            "HEAD 111",
            "branch refs/heads/main",
            "",
            "worktree /repo-wt/feat/12-a",
            "HEAD 222",
            "branch refs/heads/feat/12-a",
            "",
            "worktree /repo-wt/review-12",
            "HEAD 333",
            "detached",
            "",
        ]
    )
    assert parse_worktrees(out) == [
        {"path": "/repo", "head": "111", "branch": "main"},
        {"path": "/repo-wt/feat/12-a", "head": "222", "branch": "feat/12-a"},
        {"path": "/repo-wt/review-12", "head": "333", "branch": None},
    ]


# waveStatus


def test_wave_status_reports_each_issue_with_its_branches_verdict_and_next_step() -> None:
    status = wave_status(
        "wave/capybara-3",
        [12, 13, 14],
        ["main", "wave/capybara-3", "feat/12-a", "feat/13-b"],
        {
            12: [comment("lsimons", "Verdict: approve", "2026-09-24T10:00:00Z")],
            13: [comment("drive-by", "Verdict: approve", "2026-09-24T10:00:00Z")],
        },
        [],
    )
    assert status["waveBranch"] == {"name": "wave/capybara-3", "pushed": True}
    summary = [
        (
            i["issue"],
            i["next"],
            [
                (b["name"], b["verdict"]["verdict"] if b["verdict"] else None, b["next"])
                for b in i["branches"]
            ],
        )
        for i in status["issues"]
    ]
    assert summary == [
        (12, "per-branch", [("feat/12-a", "approve", "join")]),
        (13, "per-branch", [("feat/13-b", None, "review")]),
        (14, "build", []),
    ]
    assert status["trustedVerdictAuthors"] == ["lsimons", "lsimons-bot"]


def test_wave_status_gives_each_half_of_a_split_its_own_step_in_either_verdict_order() -> None:
    heads = ["feat/15-x-1", "feat/15-x-2"]
    needs_changes1 = comment(
        "lsimons", "Branch: feat/15-x-1\nVerdict: needs changes", "2026-09-24T10:00:00Z"
    )
    approve2 = comment("lsimons", "Branch: feat/15-x-2\nVerdict: approve", "2026-09-24T11:00:00Z")
    for comments in (
        [needs_changes1, approve2],
        [approve2, at_time(needs_changes1, "2026-09-24T12:00:00Z")],
    ):
        assert steps(15, comments, heads) == [("feat/15-x-1", "revise"), ("feat/15-x-2", "join")]


# waveStatus with unfinished branches

UNFINISHED1 = comment("lsimons", "Unfinished: feat/16-x-1\n- the tests", "2026-09-24T10:00:00Z")


def unfinished_status(comments: Sequence[IssueComment]) -> list[tuple[str, str, str | None]]:
    status = wave_status(
        "wave/capybara-3", [16], ["feat/16-x-1", "feat/16-x-2"], {16: comments}, []
    )
    return [
        (b["name"], b["next"], b["unfinished"]["left"] if b["unfinished"] else None)
        for b in status["issues"][0]["branches"]
    ]


def test_unfinished_builds_a_pushed_branch_with_a_trailing_unfinished_comment() -> None:
    assert unfinished_status([UNFINISHED1]) == [
        ("feat/16-x-1", "build", "- the tests"),
        ("feat/16-x-2", "review", None),
    ]


def test_unfinished_reviews_it_once_the_fresh_builder_replies_then_uses_the_verdict() -> None:
    finished = comment("lsimons", "Done.\n\nBranch: feat/16-x-1", "2026-09-24T11:00:00Z")
    verdict = comment(
        "lsimons", "Branch: feat/16-x-1\nVerdict: needs changes", "2026-09-24T12:00:00Z"
    )
    assert unfinished_status([UNFINISHED1, finished])[0] == ("feat/16-x-1", "review", None)
    assert unfinished_status([UNFINISHED1, finished, verdict])[0] == ("feat/16-x-1", "revise", None)


def test_unfinished_after_a_verdict_builds_again_and_is_no_reply_on_the_other_half() -> None:
    verdict = comment("lsimons", "Verdict: needs changes", "2026-09-24T09:00:00Z")
    assert unfinished_status([verdict, UNFINISHED1]) == [
        ("feat/16-x-1", "build", "- the tests"),
        ("feat/16-x-2", "revise", None),
    ]


# waveStatus with an approve and its fix commit

APPROVE17 = comment("lsimons", "Nit: a typo.\n\nVerdict: approve", "2026-09-24T10:00:00Z")
REPLY17 = comment("lsimons-bot", "Fixed in abc123.\n\nBranch: feat/17-x", "2026-09-24T11:00:00Z")
RE_CHECK17 = comment(
    "lsimons", "re-checked by lead: https://example.test/commit/abc123", "2026-09-24T12:00:00Z"
)


def steps17(
    comments: Sequence[IssueComment], heads: Sequence[str] = ("feat/17-x",)
) -> list[tuple[str, str]]:
    return steps(17, comments, heads)


def test_fix_commit_joins_an_approve_with_no_reply_after_it() -> None:
    assert steps17([APPROVE17]) == [("feat/17-x", "join")]


def test_fix_commit_sends_an_approve_with_a_builder_reply_after_it_to_the_lead() -> None:
    assert steps17([APPROVE17, REPLY17]) == [("feat/17-x", "lead-re-check")]


def test_fix_commit_joins_an_approve_once_the_lead_re_checked_the_reply() -> None:
    assert steps17([APPROVE17, REPLY17, RE_CHECK17]) == [("feat/17-x", "join")]


def test_fix_commit_goes_to_the_lead_again_when_a_second_reply_follows_the_re_check() -> None:
    second = comment("lsimons", "One more nit fixed in def456.", "2026-09-24T13:00:00Z")
    assert steps17([APPROVE17, REPLY17, RE_CHECK17, second]) == [("feat/17-x", "lead-re-check")]


def test_fix_commit_ignores_a_re_check_from_another_account() -> None:
    planted = comment(
        "someone-else", "re-checked by lead: https://example.test/x", "2026-09-24T12:00:00Z"
    )
    assert steps17([APPROVE17, REPLY17, planted]) == [("feat/17-x", "lead-re-check")]


def test_fix_commit_keeps_a_re_check_on_one_half_of_a_split_off_the_other_half() -> None:
    heads = ["feat/17-x-1", "feat/17-x-2"]
    reply2 = comment("lsimons", "Fixed in abc.\n\nBranch: feat/17-x-2", "2026-09-24T11:00:00Z")
    reply1 = comment("lsimons", "Fixed in def.\n\nBranch: feat/17-x-1", "2026-09-24T11:30:00Z")
    re_check1 = comment(
        "lsimons", "re-checked by lead: def\n\nBranch: feat/17-x-1", "2026-09-24T12:00:00Z"
    )
    approve1 = comment("lsimons", "Branch: feat/17-x-1\nVerdict: approve", "2026-09-24T10:00:00Z")
    approve2 = comment("lsimons", "Branch: feat/17-x-2\nVerdict: approve", "2026-09-24T10:00:00Z")
    assert steps17([approve1, approve2, reply2, reply1, re_check1], heads) == [
        ("feat/17-x-1", "join"),
        ("feat/17-x-2", "lead-re-check"),
    ]


def test_fix_commit_lead_re_check_is_no_reply_to_needs_changes_nor_ends_unfinished() -> None:
    needs_changes = comment("lsimons", "Verdict: needs changes", "2026-09-24T10:00:00Z")
    left = comment("lsimons", "Unfinished: feat/17-x\n- tests", "2026-09-24T11:00:00Z")
    re_check_named = comment(
        "lsimons", "re-checked by lead: abc\n\nBranch: feat/17-x", "2026-09-24T12:00:00Z"
    )
    assert steps17([needs_changes, RE_CHECK17]) == [("feat/17-x", "revise")]
    assert steps17([needs_changes, left, re_check_named]) == [("feat/17-x", "build")]


def test_fix_commit_builds_an_approved_branch_whose_fix_stopped_then_sends_it_to_the_lead() -> None:
    left = comment("lsimons", "Unfinished: feat/17-x\n- the typo", "2026-09-24T11:00:00Z")
    finished = comment("lsimons", "Fixed.\n\nBranch: feat/17-x", "2026-09-24T12:00:00Z")
    assert steps17([APPROVE17, left]) == [("feat/17-x", "build")]
    assert steps17([APPROVE17, left, finished]) == [("feat/17-x", "lead-re-check")]
    later = at_time(RE_CHECK17, "2026-09-24T13:00:00Z")
    assert steps17([APPROVE17, left, finished, later]) == [("feat/17-x", "join")]


# waveStatus with near-miss branch names

APPROVE18 = comment("lsimons", "Branch: feat/18-x\nVerdict: approve", "2026-09-24T10:00:00Z")


def at18(body: str) -> IssueComment:
    return comment("lsimons", body, "2026-09-24T11:00:00Z")


def steps18(
    comments: Sequence[IssueComment], heads: Sequence[str] = ("feat/18-x",)
) -> list[tuple[str, str]]:
    return steps(18, comments, heads)


def test_near_miss_sends_a_fix_reply_with_a_branch_coverage_line_to_the_lead() -> None:
    reply = at18(
        "Fixed the two nits.\nBranch coverage of wave_status.py stays at 95%.\nBranch: feat/18-x"
    )
    assert steps18([APPROVE18, reply]) == [("feat/18-x", "lead-re-check")]


def test_near_miss_reads_origin_and_trailing_punctuation_as_the_pushed_branch() -> None:
    assert steps18([APPROVE18, at18("Unfinished: origin/feat/18-x\n- the nit")]) == [
        ("feat/18-x", "build")
    ]
    assert steps18([APPROVE18, at18("Unfinished: feat/18-x.\n- the nit")]) == [
        ("feat/18-x", "build")
    ]
    assert steps18([APPROVE18, at18("Fixed.\n\nBranch: feat/18-x.")]) == [
        ("feat/18-x", "lead-re-check")
    ]


def test_near_miss_reads_an_unfinished_line_without_a_colon_as_a_reply() -> None:
    reply = at18("Unfinished items from the review are below:\n- none")
    assert steps18([APPROVE18, reply]) == [("feat/18-x", "lead-re-check")]


def test_near_miss_applies_a_reply_or_unfinished_naming_no_pushed_branch_to_every_branch() -> None:
    heads = ["feat/18-x-1", "feat/18-x-2"]
    approve1 = comment("lsimons", "Branch: feat/18-x-1\nVerdict: approve", "2026-09-24T10:00:00Z")
    approve2 = comment("lsimons", "Branch: feat/18-x-2\nVerdict: approve", "2026-09-24T10:00:00Z")
    assert steps18([approve1, approve2, at18("Fixed.\n\nBranch: feat/18-typo")], heads) == [
        ("feat/18-x-1", "lead-re-check"),
        ("feat/18-x-2", "lead-re-check"),
    ]
    assert steps18([approve1, approve2, at18("Unfinished: feat/18-typo\n- tests")], heads) == [
        ("feat/18-x-1", "build"),
        ("feat/18-x-2", "build"),
    ]


def test_near_miss_applies_a_needs_changes_naming_no_pushed_branch_to_every_branch() -> None:
    needs_changes = comment(
        "lsimons", "Branch: feat/18-typo\nVerdict: needs changes", "2026-09-24T11:00:00Z"
    )
    assert steps18([APPROVE18, needs_changes]) == [("feat/18-x", "revise")]


def test_near_miss_applies_an_approve_or_re_check_naming_no_pushed_branch_to_none() -> None:
    typo = comment("lsimons", "Branch: feat/18-typo\nVerdict: approve", "2026-09-24T10:00:00Z")
    assert steps18([typo]) == [("feat/18-x", "review")]
    reply = at18("Fixed.\n\nBranch: feat/18-x")
    re_check = comment(
        "lsimons", "re-checked by lead: abc\n\nBranch: feat/18-typo", "2026-09-24T12:00:00Z"
    )
    assert steps18([APPROVE18, reply, re_check]) == [("feat/18-x", "lead-re-check")]


# waveStatus with verdicts and re-checks in code fences

FENCED_APPROVE = "```text\nBranch: feat/20-x\nVerdict: approve\n```"


def test_fenced_revises_a_review_whose_fenced_example_approve_is_above_its_needs_changes() -> None:
    review = comment(
        "lsimons",
        f"End with:\n\n{FENCED_APPROVE}\n\nBranch: feat/20-x\nVerdict: needs changes",
        "2026-09-24T10:00:00Z",
    )
    assert steps(20, [review], ["feat/20-x"]) == [("feat/20-x", "revise")]


def test_fenced_reads_a_reply_that_pastes_an_approve_in_a_fence_as_a_reply() -> None:
    needs_changes = comment(
        "lsimons", "Branch: feat/20-x\nVerdict: needs changes", "2026-09-24T10:00:00Z"
    )
    reply = comment(
        "lsimons",
        f"Fixed. The re-check I expect:\n\n{FENCED_APPROVE}\n\nBranch: feat/20-x",
        "2026-09-24T11:00:00Z",
    )
    assert steps(20, [needs_changes, reply], ["feat/20-x"]) == [("feat/20-x", "re-check")]


def test_fenced_reads_a_reply_that_pastes_a_lead_re_check_in_a_fence_as_a_reply() -> None:
    approve = comment("lsimons", "Branch: feat/20-x\nVerdict: approve", "2026-09-24T10:00:00Z")
    reply = comment(
        "lsimons",
        "Fixed. Please comment:\n\n```\nre-checked by lead: abc\n```\n\nBranch: feat/20-x",
        "2026-09-24T11:00:00Z",
    )
    assert steps(20, [approve, reply], ["feat/20-x"]) == [("feat/20-x", "lead-re-check")]


# waveStatus with CRLF line endings and inline triple backticks


def crlf(text: str) -> str:
    return text.replace("\n", "\r\n")


def test_crlf_reads_fences_in_a_comment_posted_with_crlf_line_endings() -> None:
    review = crlf(
        "Reviews end like this:\n```\nBranch: feat/21-x\nVerdict: approve\n```\n\n"
        "Branch: feat/21-x\nVerdict: needs changes"
    )
    assert verdict_of(review) == "needs changes"
    reviewed = [comment("lsimons", review, "2026-09-24T10:00:00Z")]
    assert steps(21, reviewed, ["feat/21-x"]) == [("feat/21-x", "revise")]
    assert branch_of(crlf("Fixed.\n~~~\nBranch: feat/21-x\n~~~")) is None
    assert comment_kind(crlf("Fixed.\n```\nre-checked by lead: abc\n```")) == "reply"
    assert verdict_of("```\rVerdict: approve\r```\rVerdict: needs changes") == "needs changes"


def test_crlf_reads_the_unfinished_line_branch_and_what_is_left_without_a_trailing_cr() -> None:
    body = crlf(
        "Unfinished: feat/21-x\n- the tests\n\nCo-Authored-By: lsimons-bot <bot@leosimons.com>"
    )
    assert unfinished_branch_of(body) == "feat/21-x"
    found = open_unfinished(
        [comment("lsimons", body, "2026-09-24T11:00:00Z")], "feat/21-x", ["feat/21-x"]
    )
    assert found is not None
    assert found["left"] == "- the tests"
    assert branch_of(crlf("Fixed.\n\nBranch: feat/21-x\n")) == "feat/21-x"


def test_crlf_reads_inline_code_between_triple_backticks_as_text_not_a_fence() -> None:
    approve = comment("lsimons", "Branch: feat/21-x\nVerdict: approve", "2026-09-24T10:00:00Z")
    review = comment(
        "lsimons",
        "The fix breaks the gate:\n\n```mise run fast```\n\n"
        "Branch: feat/21-x\nVerdict: needs changes",
        "2026-09-24T12:00:00Z",
    )
    reply = comment("lsimons", "Fixed in abc.\n\nBranch: feat/21-x", "2026-09-24T11:00:00Z")
    assert steps(21, [approve, reply, review], ["feat/21-x"]) == [("feat/21-x", "revise")]
    assert verdict_of("~~~mise run fast~~~\nVerdict: approve") is None


# waveStatus for every comment kind and every way it names a branch.
# Each row: a comment kind, the comments before it, and the step it gives
# for each way of naming a branch. A comment that fails to match gives more
# work, never `join`, unless an approve (or a lead re-check of one) really
# applies to the branch.

type Kind = Literal["approve", "needs changes", "Unfinished:", "re-checked by lead", "reply"]
type Naming = Literal["branch", "origin/", "period", "other half", "typo", "nothing"]


def at_minute(minute: int, body: str) -> IssueComment:
    return comment("lsimons", body, f"2026-09-24T10:{minute:02d}:00Z")


def branch_line(name: str) -> str:
    return f"\n\nBranch: {name}" if name else ""


def matrix_step(heads: Sequence[str], branch: str, kind: Kind, naming: Naming) -> str:
    other = next((h for h in heads if h != branch), "")
    names: dict[Naming, str] = {
        "branch": branch,
        "origin/": f"origin/{branch}",
        "period": f"{branch}.",
        "other half": other,
        "typo": "feat/19-typo",
        "nothing": "",
    }
    approve_all = [
        at_minute(i, f"Findings.{branch_line(h)}\nVerdict: approve") for i, h in enumerate(heads)
    ]
    needs_changes_all = [
        at_minute(i, f"Findings.{branch_line(h)}\nVerdict: needs changes")
        for i, h in enumerate(heads)
    ]
    reply_all = [at_minute(10 + i, f"Fixed in abc.{branch_line(h)}") for i, h in enumerate(heads)]
    name = names[naming]
    before, body = {
        "approve": (needs_changes_all, f"Findings.{branch_line(name)}\nVerdict: approve"),
        "needs changes": (approve_all, f"Findings.{branch_line(name)}\nVerdict: needs changes"),
        "Unfinished:": (approve_all, f"Unfinished: {name}\n- the tests"),
        "re-checked by lead": (
            [*approve_all, *reply_all],
            f"re-checked by lead: https://example.test/commit/abc{branch_line(name)}",
        ),
        "reply": (approve_all, f"Fixed in def.{branch_line(name)}"),
    }[kind]
    return dict(steps(19, [*before, at_minute(30, body)], heads))[branch]


SPLIT_NAMINGS: list[Naming] = ["branch", "origin/", "period", "other half", "typo", "nothing"]
ONE_NAMINGS: list[Naming] = ["branch", "typo", "nothing"]


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("approve", ["join", "join", "join", "revise", "revise", "revise"]),
        ("needs changes", ["revise", "revise", "revise", "join", "revise", "revise"]),
        ("Unfinished:", ["build", "build", "build", "join", "build", "build"]),
        (
            "re-checked by lead",
            ["join", "join", "join", "lead-re-check", "lead-re-check", "lead-re-check"],
        ),
        (
            "reply",
            [
                "lead-re-check",
                "lead-re-check",
                "lead-re-check",
                "join",
                "lead-re-check",
                "lead-re-check",
            ],
        ),
    ],
)
def test_matrix_on_a_split_issue(kind: Kind, expected: list[str]) -> None:
    heads = ["feat/19-x-1", "feat/19-x-2"]
    got = [matrix_step(heads, "feat/19-x-1", kind, naming) for naming in SPLIT_NAMINGS]
    assert got == expected


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("approve", ["join", "revise", "join"]),
        ("needs changes", ["revise", "revise", "revise"]),
        ("Unfinished:", ["build", "build", "build"]),
        ("re-checked by lead", ["join", "lead-re-check", "join"]),
        ("reply", ["lead-re-check", "lead-re-check", "lead-re-check"]),
    ],
)
def test_matrix_on_an_issue_with_one_branch(kind: Kind, expected: list[str]) -> None:
    got = [matrix_step(["feat/19-x"], "feat/19-x", kind, naming) for naming in ONE_NAMINGS]
    assert got == expected


# parseArgs


def test_parse_args_takes_the_wave_branch_and_the_issue_numbers() -> None:
    assert parse_args(["wave/capybara-3", "12", "#13"]) == {
        "waveBranch": "wave/capybara-3",
        "issues": [12, 13],
    }


def test_parse_args_names_what_is_wrong() -> None:
    assert parse_args([]) == "wave-status: the first argument is the wave branch, wave/<name>"
    assert isinstance(parse_args(["12"]), str)
    assert parse_args(["wave/x"]) == "wave-status: name the issues of the wave after the branch"
    assert parse_args(["wave/x", "twelve"]) == 'wave-status: "twelve" is not an issue number'


# Rules the JavaScript tool had by way of JavaScript, which the port keeps
# so its output stays byte-identical (#372).


def test_js_rules_whitespace_is_javascripts_and_word_boundaries_are_ascii() -> None:
    # U+00A0 is `\s` in JavaScript; U+001C is `str.isspace()` in Python only.
    assert verdict_of("\u00a0Verdict:\u00a0approve") == "approve"
    assert verdict_of("\x1cVerdict: approve") is None
    # JavaScript's `\b` sees `é` as a non-word character.
    assert verdict_of("Verdict: approve\u00e9") == "approve"
    # JavaScript's `/i` without the `u` flag folds ASCII letters only, so
    # the long s (U+017F) is no `s`.
    assert verdict_of("Verdict: needs change\u017f") is None


def test_js_rules_a_fence_line_with_a_line_separator_after_the_marker_is_no_fence() -> None:
    assert verdict_of("```\u2028x\nVerdict: approve") == "approve"


def test_js_rules_trim_what_is_left_with_javascripts_whitespace() -> None:
    body = "Unfinished: feat/1-x\n\ufeff- tests\x1c"
    found = open_unfinished([comment("lsimons", body, "t")], "feat/1-x", ONE)
    assert found is not None
    assert found["left"] == "- tests\x1c"


def test_js_rules_sort_branches_in_utf16_code_unit_order() -> None:
    heads = ["feat/1-\U0001f600", "feat/1-\uffff"]
    assert feat_branches(heads, 1) == ["feat/1-\U0001f600", "feat/1-\uffff"]


def test_js_rules_json_keeps_non_ascii_and_escapes_lone_surrogates() -> None:
    assert ws.to_json({"a": ["é", "\ud800"], "b": {}}) == (
        '{\n  "a": [\n    "é",\n    "\\ud800"\n  ],\n  "b": {}\n}\n'
    )


def test_parse_worktrees_keeps_an_empty_head_and_skips_a_block_without_a_path() -> None:
    assert parse_worktrees("HEAD 1\n\nworktree /a\nHEAD \nbranch x") == [
        {"path": "/a", "head": "", "branch": "x"}
    ]


def test_parse_comments_reads_gh_json_with_a_deleted_author() -> None:
    out = json.dumps(
        {
            "comments": [
                {"author": {"login": "lsimons"}, "body": "b", "createdAt": "t", "url": "u"},
                {"author": None, "body": None},
            ]
        }
    )
    assert ws.parse_comments(out) == [
        {"author": "lsimons", "body": "b", "createdAt": "t", "url": "u"},
        {"author": "", "body": "", "createdAt": "", "url": ""},
    ]


# The command line


class FakeCommands:
    """Stands in for subprocess.run with canned output per command."""

    def __init__(self, outputs: dict[str, str | int | OSError]) -> None:
        self.outputs = outputs
        self.calls: list[list[str]] = []

    def __call__(self, command: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
        self.calls.append(command)
        out = self.outputs[" ".join(command)]
        if isinstance(out, OSError):
            raise out
        if isinstance(out, int):
            return subprocess.CompletedProcess(command, out, b"")
        return subprocess.CompletedProcess(command, 0, out.encode())


LS_REMOTE = "git ls-remote --heads origin"
WORKTREES = "git worktree list --porcelain"
GH12 = "gh issue view 12 -R schubergphilis/ai-training --json comments"


class Captured:
    def __init__(self, stdout: str, stderr: str) -> None:
        self.stdout = stdout
        self.stderr = stderr


def run_main(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    argv: list[str],
    outputs: dict[str, str | int | OSError],
) -> tuple[int | None, Captured]:
    fake = FakeCommands(outputs)
    monkeypatch.setattr(subprocess, "run", fake)
    buffer = io.BytesIO()

    class Stdout:
        def __init__(self) -> None:
            self.buffer = buffer

    monkeypatch.setattr("sys.stdout", Stdout())
    try:
        code: int | None = ws.main(argv)
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else None
    err = capsys.readouterr().err
    return code, Captured(buffer.getvalue().decode(), err)


def test_main_prints_the_status_as_json(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh = json.dumps(
        {
            "comments": [
                {
                    "author": {"login": "lsimons"},
                    "body": "Verdict: approve\u00e9",
                    "createdAt": "2026-09-24T10:00:00Z",
                    "url": "https://example.test/1",
                }
            ]
        }
    )
    code, out = run_main(
        monkeypatch,
        capsys,
        ["wave/x-1", "#12"],
        {
            LS_REMOTE: "a\trefs/heads/wave/x-1\nb\trefs/heads/feat/12-y\n",
            GH12: gh,
            WORKTREES: "worktree /r\nHEAD 1\nbranch refs/heads/main\n\n",
        },
    )
    assert code == 0
    assert out.stderr == ""
    status = json.loads(out.stdout)
    assert status["waveBranch"] == {"name": "wave/x-1", "pushed": True}
    assert status["issues"][0]["branches"][0]["next"] == "join"
    assert status["worktrees"] == [{"path": "/r", "head": "1", "branch": "main"}]
    assert out.stdout.startswith('{\n  "trustedVerdictAuthors": [\n    "lsimons",')
    assert out.stdout.endswith("\n}\n")


def test_main_exits_2_with_the_usage_on_bad_arguments(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = run_main(monkeypatch, capsys, ["wave/x", "twelve"], {})
    assert code == 2
    assert out.stdout == ""
    assert out.stderr == (
        'wave-status: "twelve" is not an issue number\n'
        "usage: mise run wave-status -- <wave-branch> <issue> [<issue> ...]\n"
    )


def test_main_exits_1_and_names_a_failed_command(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = run_main(monkeypatch, capsys, ["wave/x", "12"], {LS_REMOTE: "", GH12: 1})
    assert code == 1
    assert out.stdout == ""
    assert out.stderr == (f"wave-status: {GH12} failed: Command failed: {GH12}\n")


def test_main_exits_1_when_a_command_is_missing_or_cannot_start(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = run_main(
        monkeypatch, capsys, ["wave/x", "12"], {LS_REMOTE: FileNotFoundError(2, "gone")}
    )
    assert code == 1
    assert out.stderr == (
        f'wave-status: {LS_REMOTE} failed: Executable not found in $PATH: "git"\n'
    )
    code, out = run_main(
        monkeypatch, capsys, ["wave/x", "12"], {LS_REMOTE: PermissionError(13, "denied")}
    )
    assert code == 1
    assert out.stderr == f"wave-status: {LS_REMOTE} failed: [Errno 13] denied\n"


def test_main_exits_1_on_gh_output_it_cannot_read(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    for output, reason in [
        ("not json", "JSONDecodeError("),
        ("{}", "KeyError('comments')"),
        ("[]", "TypeError("),
        ('{"comments": [1]}', "AttributeError("),
    ]:
        code, out = run_main(monkeypatch, capsys, ["wave/x", "12"], {LS_REMOTE: "", GH12: output})
        assert code == 1
        assert out.stdout == ""
        assert out.stderr.startswith(f"wave-status: {GH12} failed: unreadable output: {reason}")
        assert out.stderr.count("\n") == 1


# Pointer comments (#455)

POINTER_HEADS = ["main", "wave/koala-1", "feat/388-review-hook-read-only"]


def pointer(
    author: str, created_at: str, branch: str = "feat/388-review-hook-read-only"
) -> IssueComment:
    return comment(
        author, f"Built on the branch of #388.\n\nBranch: {branch}{ATTRIBUTION}", created_at
    )


def test_pointer_lists_the_other_issues_branch_with_its_verdict_and_next_step() -> None:
    review = comment(
        "lsimons-bot",
        "Branch: feat/388-review-hook-read-only\nVerdict: approve",
        "2026-09-24T11:00:00Z",
    )
    status = wave_status(
        "wave/koala-1",
        [414, 415],
        POINTER_HEADS,
        {
            414: [pointer("lsimons-bot", "2026-09-24T10:00:00Z")],
            415: [
                pointer(
                    "lsimons", "2026-09-24T10:00:00Z", "`origin/feat/388-review-hook-read-only`."
                )
            ],
            388: [review],
        },
        [],
    )
    for issue in status["issues"]:
        assert issue["next"] == "per-branch"
        [branch] = issue["branches"]
        assert branch["name"] == "feat/388-review-hook-read-only"
        assert branch["next"] == "join"
        assert branch["verdict"] is not None and branch["verdict"]["url"] == review["url"]
        assert branch.get("pointer") == {
            "issue": 388,
            "url": "https://github.com/schubergphilis/ai-training/issues/1#2026-09-24T10:00:00Z",
        }


def test_pointer_takes_the_next_step_from_the_owner_issue_not_the_pointer_issue() -> None:
    needs_changes = comment("lsimons-bot", "Verdict: needs changes", "2026-09-24T11:00:00Z")
    approve_on_pointer_issue = comment("lsimons-bot", "Verdict: approve", "2026-09-24T12:00:00Z")
    status = wave_status(
        "wave/koala-1",
        [414],
        POINTER_HEADS,
        {
            414: [pointer("lsimons-bot", "2026-09-24T10:00:00Z"), approve_on_pointer_issue],
            388: [needs_changes],
        },
        [],
    )
    assert [(b["name"], b["next"]) for b in status["issues"][0]["branches"]] == [
        ("feat/388-review-hook-read-only", "revise")
    ]


def test_pointer_to_an_owner_without_comments_is_review_not_build() -> None:
    status = wave_status(
        "wave/koala-1",
        [414],
        POINTER_HEADS,
        {414: [pointer("lsimons-bot", "2026-09-24T10:00:00Z")]},
        [],
    )
    assert status["issues"][0]["next"] == "per-branch"
    assert [b["next"] for b in status["issues"][0]["branches"]] == ["review"]


def test_pointer_from_an_untrusted_account_changes_nothing() -> None:
    status = wave_status(
        "wave/koala-1",
        [414],
        POINTER_HEADS,
        {414: [pointer("drive-by", "2026-09-24T10:00:00Z")], 388: []},
        [],
    )
    assert status["issues"][0] == {"issue": 414, "next": "build", "branches": []}


def test_pointer_needs_a_pushed_feat_branch_of_another_issue() -> None:
    heads = [*POINTER_HEADS, "feat/414-own", "chore/388-x"]
    for branch in ["feat/388-gone", "wave/koala-1", "chore/388-x", "feat/414-own"]:
        status = wave_status(
            "wave/koala-1",
            [414],
            heads,
            {414: [pointer("lsimons-bot", "2026-09-24T10:00:00Z", branch)]},
            [],
        )
        branches = status["issues"][0]["branches"]
        assert [(b["name"], "pointer" in b) for b in branches] == [("feat/414-own", False)], branch


def test_pointer_reads_only_a_branch_line_outside_a_code_fence() -> None:
    fenced = comment(
        "lsimons-bot",
        "Post this:\n\n```text\nBranch: feat/388-review-hook-read-only\n```",
        "2026-09-24T10:00:00Z",
    )
    status = wave_status("wave/koala-1", [414], POINTER_HEADS, {414: [fenced]}, [])
    assert status["issues"][0]["next"] == "build"


def test_pointer_is_listed_after_the_own_branches_and_is_no_reply_on_them() -> None:
    heads = [*POINTER_HEADS, "feat/414-own"]
    approve = comment("lsimons-bot", "Verdict: approve", "2026-09-24T09:00:00Z")
    status = wave_status(
        "wave/koala-1",
        [414],
        heads,
        {414: [approve, pointer("lsimons-bot", "2026-09-24T10:00:00Z")], 388: []},
        [],
    )
    assert [(b["name"], b["next"], "pointer" in b) for b in status["issues"][0]["branches"]] == [
        ("feat/414-own", "join", False),
        ("feat/388-review-hook-read-only", "review", True),
    ]


def test_main_fetches_the_comments_of_the_owner_issue_of_a_pointer(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def gh_json(body: str) -> str:
        return json.dumps(
            {
                "comments": [
                    {
                        "author": {"login": "lsimons-bot"},
                        "body": body,
                        "createdAt": "2026-09-24T10:00:00Z",
                        "url": "https://example.test/1",
                    }
                ]
            }
        )

    gh388 = "gh issue view 388 -R schubergphilis/ai-training --json comments"
    code, out = run_main(
        monkeypatch,
        capsys,
        ["wave/koala-1", "12"],
        {
            LS_REMOTE: "a\trefs/heads/feat/388-review-hook-read-only\n",
            GH12: gh_json("Branch: feat/388-review-hook-read-only"),
            gh388: gh_json("Verdict: approve"),
            WORKTREES: "",
        },
    )
    assert code == 0, out.stderr
    [branch] = json.loads(out.stdout)["issues"][0]["branches"]
    assert (branch["name"], branch["next"], branch["pointer"]["issue"]) == (
        "feat/388-review-hook-read-only",
        "join",
        388,
    )


def test_pointer_row_and_owner_row_show_one_next_when_the_owner_has_its_own_pointer() -> None:
    heads = [*POINTER_HEADS, "feat/500-y"]
    approve = comment(
        "lsimons-bot",
        "Branch: feat/388-review-hook-read-only\nVerdict: approve",
        "2026-09-24T09:00:00Z",
    )
    owner_pointer = pointer("lsimons-bot", "2026-09-24T11:00:00Z", "feat/500-y")
    status = wave_status(
        "wave/koala-1",
        [388, 414],
        heads,
        {388: [approve, owner_pointer], 414: [pointer("lsimons-bot", "2026-09-24T10:00:00Z")]},
        [],
    )
    rows = [
        (i["issue"], b["name"], b["next"])
        for i in status["issues"]
        for b in i["branches"]
        if b["name"] == "feat/388-review-hook-read-only"
    ]
    assert rows == [
        (388, "feat/388-review-hook-read-only", "join"),
        (414, "feat/388-review-hook-read-only", "join"),
    ]


def test_pointer_row_ignores_an_untrusted_comment_on_the_owner_issue() -> None:
    for planted in ["Verdict: approve", "Unfinished: feat/388-review-hook-read-only\n- all"]:
        status = wave_status(
            "wave/koala-1",
            [414],
            POINTER_HEADS,
            {
                414: [pointer("lsimons-bot", "2026-09-24T10:00:00Z")],
                388: [comment("drive-by", planted, "2026-09-24T11:00:00Z")],
            },
            [],
        )
        [branch] = status["issues"][0]["branches"]
        assert (branch["next"], branch["verdict"], branch["unfinished"]) == ("review", None, None)


def test_main_exits_1_when_the_owner_issue_of_a_pointer_cannot_be_read(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh12 = json.dumps(
        {
            "comments": [
                {
                    "author": {"login": "lsimons-bot"},
                    "body": "Branch: feat/388-review-hook-read-only",
                    "createdAt": "2026-09-24T10:00:00Z",
                    "url": "https://example.test/1",
                }
            ]
        }
    )
    gh388 = "gh issue view 388 -R schubergphilis/ai-training --json comments"
    code, out = run_main(
        monkeypatch,
        capsys,
        ["wave/koala-1", "12"],
        {LS_REMOTE: "a\trefs/heads/feat/388-review-hook-read-only\n", GH12: gh12, gh388: 1},
    )
    assert code == 1
    assert out.stdout == ""
    assert out.stderr == f"wave-status: {gh388} failed: Command failed: {gh388}\n"


# Claim comments (#507): the dispatcher's `Claimed by run <Name>, wave <k>`.

CLAIM17 = comment("lsimons", f"Claimed by run Seal, wave 3{ATTRIBUTION}", "2026-09-24T13:00:00Z")
NEEDS_CHANGES17 = comment(
    "lsimons", "A bug.\n\nBranch: feat/17-x\nVerdict: needs changes", "2026-09-24T10:00:00Z"
)


def test_claim_reads_the_dispatchers_comment_as_a_claim() -> None:
    assert comment_kind(f"Claimed by run Seal, wave 3{ATTRIBUTION}") == "claim"
    assert comment_kind("Claimed by run Seal, wave 3") == "claim"
    assert (
        comment_kind(
            "Claimed by run Narwhal, wave 1 (with #417, whose remaining list includes this issue)"
            + ATTRIBUTION
        )
        == "claim"
    )
    assert comment_kind(crlf(f"Claimed by run Seal, wave 12 (#586){ATTRIBUTION}")) == "claim"


def test_claim_reads_any_other_wording_as_a_reply() -> None:
    assert comment_kind(f"```\nClaimed by run Seal, wave 3\n```{ATTRIBUTION}") == "reply"
    assert comment_kind(f"The issue was Claimed by run Seal, wave 3.{ATTRIBUTION}") == "reply"
    assert comment_kind(f"Fixed in abc.\n\nClaimed by run Seal, wave 3{ATTRIBUTION}") == "reply"
    assert comment_kind("claimed by run Seal, wave 3") == "reply"
    assert comment_kind("Claimed by run Seal, wave 3, and fixed in abc.") == "reply"
    assert comment_kind("Claimed by run Seal, wave three") == "reply"
    assert comment_kind("Claimed by run Heron, outside the waves (the maintainer asked)") == "reply"


def test_claim_with_a_branch_line_is_a_reply() -> None:
    body = f"Claimed by run Seal, wave 3\n\nBranch: feat/17-x{ATTRIBUTION}"
    assert comment_kind(body) == "reply"
    assert steps17([APPROVE17, comment("lsimons", body, "2026-09-24T13:00:00Z")]) == [
        ("feat/17-x", "lead-re-check")
    ]


def test_claim_with_a_fenced_branch_line_is_a_reply() -> None:
    body = f"Claimed by run Seal, wave 3\n\n```\nBranch: feat/17-x\n```{ATTRIBUTION}"
    assert comment_kind(body) == "reply"


def test_claim_with_a_fenced_fix_sentence_after_it_is_a_reply() -> None:
    body = f"Claimed by run Seal, wave 3\n\n```\nFixed in abc.\n```{ATTRIBUTION}"
    assert comment_kind(body) == "reply"
    assert steps17([APPROVE17, comment("lsimons", body, "2026-09-24T13:00:00Z")]) == [
        ("feat/17-x", "lead-re-check")
    ]


def test_claim_after_needs_changes_leaves_it_revise() -> None:
    assert steps17([NEEDS_CHANGES17, CLAIM17]) == [("feat/17-x", "revise")]


def test_claim_after_approve_leaves_it_join() -> None:
    assert steps17([APPROVE17, CLAIM17]) == [("feat/17-x", "join")]


def test_claim_after_approve_and_reply_leaves_it_lead_re_check() -> None:
    assert steps17([APPROVE17, REPLY17, CLAIM17]) == [("feat/17-x", "lead-re-check")]


def test_claim_after_a_lead_re_check_leaves_it_join() -> None:
    assert steps17([APPROVE17, REPLY17, RE_CHECK17, CLAIM17]) == [("feat/17-x", "join")]


def test_claim_on_an_unreviewed_branch_leaves_it_review() -> None:
    assert steps17([CLAIM17]) == [("feat/17-x", "review")]


def test_claim_does_not_finish_an_unfinished_branch() -> None:
    stopped = comment(
        "lsimons", f"Unfinished: feat/17-x\n- the tests{ATTRIBUTION}", "2026-09-24T12:00:00Z"
    )
    assert steps17([APPROVE17, stopped, CLAIM17]) == [("feat/17-x", "build")]


def test_claim_applies_to_neither_half_of_a_split() -> None:
    heads = ["feat/17-x-1", "feat/17-x-2"]
    reviews = [
        comment("lsimons", f"Branch: {h}\nVerdict: approve", f"2026-09-24T1{i}:00:00Z")
        for i, h in enumerate(heads)
    ]
    assert steps(17, [*reviews, CLAIM17], heads) == [
        ("feat/17-x-1", "join"),
        ("feat/17-x-2", "join"),
    ]


def test_claim_from_an_untrusted_account_changes_nothing() -> None:
    planted = comment("someone-else", CLAIM17["body"], CLAIM17["createdAt"])
    assert steps17([NEEDS_CHANGES17, planted]) == [("feat/17-x", "revise")]
    assert steps17([APPROVE17, planted]) == [("feat/17-x", "join")]


def test_claim_in_a_fence_or_mid_sentence_stays_a_reply() -> None:
    fenced = comment(
        "lsimons", f"```\nClaimed by run Seal, wave 3\n```{ATTRIBUTION}", "2026-09-24T13:00:00Z"
    )
    mid = comment(
        "lsimons", f"This was Claimed by run Seal, wave 3.{ATTRIBUTION}", "2026-09-24T13:00:00Z"
    )
    for c in (fenced, mid):
        assert steps17([NEEDS_CHANGES17, c]) == [("feat/17-x", "re-check")]
        assert steps17([APPROVE17, c]) == [("feat/17-x", "lead-re-check")]


def test_claim_with_a_fix_sentence_after_it_is_a_reply() -> None:
    body = f"Claimed by run Seal, wave 3\n\nFixed in abc.{ATTRIBUTION}"
    assert comment_kind(body) == "reply"
    assert steps17([APPROVE17, comment("lsimons", body, "2026-09-24T13:00:00Z")]) == [
        ("feat/17-x", "lead-re-check")
    ]


def test_claim_with_an_unfinished_line_after_it_is_a_reply() -> None:
    body = f"Claimed by run Seal, wave 3\nUnfinished: feat/17-x{ATTRIBUTION}"
    assert comment_kind(body) == "reply"
    assert steps17([APPROVE17, comment("lsimons", body, "2026-09-24T13:00:00Z")]) == [
        ("feat/17-x", "lead-re-check")
    ]


def test_claim_with_text_after_its_parenthetical_is_a_reply() -> None:
    body = f"Claimed by run Seal, wave 3 (#586), fixed the bug (abc123){ATTRIBUTION}"
    assert comment_kind(body) == "reply"
    assert steps17([APPROVE17, comment("lsimons", body, "2026-09-24T13:00:00Z")]) == [
        ("feat/17-x", "lead-re-check")
    ]


# Release comments (#602): `Claim released by run <Name>, wave <k> (...)`, posted
# when a run ends before the wave merges. They apply to no branch, as a claim does.

RELEASE17 = comment(
    "lsimons",
    f"Claim released by run Seal, wave 3 (the run ended; feat/17-x is unreviewed){ATTRIBUTION}",
    "2026-09-24T14:00:00Z",
)


def test_release_reads_as_a_claim() -> None:
    assert comment_kind(RELEASE17["body"]) == "claim"
    assert comment_kind("Claim released by run Seal, wave 3 (the run ended)") == "claim"
    assert (
        comment_kind(
            crlf(
                "Claim released by run Seal, wave 3 "
                + f"(the run ended; feat/17-x has the last verdict needs changes){ATTRIBUTION}"
            )
        )
        == "claim"
    )


def test_release_with_any_other_wording_is_a_reply() -> None:
    assert comment_kind("claim released by run Seal, wave 3 (the run ended)") == "reply"
    assert comment_kind("Claim released by run Seal (the run ended)") == "reply"
    assert (
        comment_kind(f"Claim released by run Seal, wave 3 (the run ended (#586)){ATTRIBUTION}")
        == "reply"
    )
    assert (
        comment_kind(
            f"Claim released by run Seal, wave 3 (the run ended)\nFixed in abc.{ATTRIBUTION}"
        )
        == "reply"
    )


def test_release_with_a_branch_line_is_a_reply() -> None:
    body = f"Claim released by run Seal, wave 3 (the run ended)\n\nBranch: feat/17-x{ATTRIBUTION}"
    assert comment_kind(body) == "reply"
    assert steps17([APPROVE17, comment("lsimons", body, "2026-09-24T14:00:00Z")]) == [
        ("feat/17-x", "lead-re-check")
    ]


def test_release_after_needs_changes_leaves_it_revise() -> None:
    assert steps17([NEEDS_CHANGES17, CLAIM17, RELEASE17]) == [("feat/17-x", "revise")]


def test_release_after_approve_leaves_it_join() -> None:
    assert steps17([APPROVE17, CLAIM17, RELEASE17]) == [("feat/17-x", "join")]


def test_release_on_an_unreviewed_branch_leaves_it_review() -> None:
    assert steps17([CLAIM17, RELEASE17]) == [("feat/17-x", "review")]


def test_release_does_not_finish_an_unfinished_branch() -> None:
    stopped = comment(
        "lsimons", f"Unfinished: feat/17-x\n- the tests{ATTRIBUTION}", "2026-09-24T12:00:00Z"
    )
    assert steps17([APPROVE17, stopped, RELEASE17]) == [("feat/17-x", "build")]


def test_release_from_an_untrusted_account_changes_nothing() -> None:
    planted = comment("someone-else", RELEASE17["body"], RELEASE17["createdAt"])
    assert steps17([NEEDS_CHANGES17, planted]) == [("feat/17-x", "revise")]
