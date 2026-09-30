"""Tests for scripts/branch_cleanup.py, with fake `git` and `gh` runners."""

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime

import pytest

import branch_cleanup
from branch_cleanup import CleanupError, Ref

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
REMOTE_REFS = [
    "git",
    "for-each-ref",
    branch_cleanup.REF_FORMAT,
    "refs/remotes/origin/",
]
LOCAL_REFS = ["git", "for-each-ref", branch_cleanup.REF_FORMAT, "refs/heads/"]
OPEN_PRS = [
    "gh",
    "pr",
    "list",
    "-R",
    branch_cleanup.REPO,
    "-s",
    "open",
    "-L",
    "1000",
    "--json",
    "headRefName,baseRefName",
    "--jq",
    ".[] | .headRefName, .baseRefName",
]


def ref_line(refname: str, sha: str, date: str) -> str:
    return f"{refname}\0{sha}\0{date}"


def cherry(branch: str) -> tuple[str, ...]:
    return ("git", "cherry", "origin/main", branch)


def ref_url(name: str) -> str:
    return f"repos/{branch_cleanup.REPO}/git/refs/heads/{name}"


class Fake:
    """A command runner that answers from a table and records every call."""

    def __init__(self, answers: Mapping[tuple[str, ...], str | CleanupError]) -> None:
        self.answers = dict(answers)
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, argv: Sequence[str]) -> str:
        key = tuple(argv)
        self.calls.append(key)
        if key not in self.answers:
            raise AssertionError(f"unexpected command: {key}")
        answer = self.answers[key]
        if isinstance(answer, CleanupError):
            raise answer
        return answer


def repo_git(extra: Mapping[tuple[str, ...], str | CleanupError] | None = None) -> Fake:
    """A git with main, HEAD, an open-PR branch and four more branches on origin.

    - old/merged: 20 days old, rebase-merged; the local branch has the same tip.
    - old/local-ahead: 20 days old, merged; the local branch has a commit more.
    - old/unmerged: 20 days old, one commit not in main.
    - new/merged: 5 days old, merged, no local branch.
    - old/in-pr: 20 days old, merged, but the head of an open PR.
    - old/worktree: 20 days old, merged, local branch checked out in a worktree.
    """
    old = "2026-09-10T10:00:00+00:00"
    new = "2026-09-25T10:00:00+00:00"
    answers: dict[tuple[str, ...], str | CleanupError] = {
        ("git", "remote", "get-url", "origin"): f"https://github.com/{branch_cleanup.REPO}.git\n",
        ("git", "fetch", "--prune", "--quiet", "origin"): "",
        tuple(REMOTE_REFS): "\n".join(
            [
                ref_line("refs/remotes/origin/HEAD", "m" * 40, old),
                ref_line("refs/remotes/origin/main", "m" * 40, old),
                ref_line("refs/remotes/origin/old/merged", "a" * 40, old),
                ref_line("refs/remotes/origin/old/local-ahead", "b" * 40, old),
                ref_line("refs/remotes/origin/old/unmerged", "c" * 40, old),
                ref_line("refs/remotes/origin/new/merged", "d" * 40, new),
                ref_line("refs/remotes/origin/old/in-pr", "e" * 40, old),
                ref_line("refs/remotes/origin/old/worktree", "f" * 40, old),
            ]
        )
        + "\n",
        tuple(LOCAL_REFS): "\n".join(
            [
                ref_line("refs/heads/main", "m" * 40, old),
                ref_line("refs/heads/old/merged", "a" * 40, old),
                ref_line("refs/heads/old/local-ahead", "9" * 40, new),
                ref_line("refs/heads/old/worktree", "f" * 40, old),
            ]
        )
        + "\n",
        ("git", "worktree", "list", "--porcelain"): (
            "worktree /repo\nHEAD mmmm\nbranch refs/heads/main\n\n"
            "worktree /wt\nHEAD ffff\nbranch refs/heads/old/worktree\n"
        ),
        cherry("origin/old/merged"): "- 1111\n- 2222\n",
        cherry("origin/old/local-ahead"): "",
        cherry("refs/heads/old/local-ahead"): "- 3333\n+ 4444\n",
        cherry("origin/old/unmerged"): "- 5555\n+ 6666\n",
        cherry("origin/new/merged"): "- 7777\n",
        cherry("origin/old/worktree"): "",
    }
    answers.update(extra or {})
    return Fake(answers)


def repo_gh(extra: Mapping[tuple[str, ...], str | CleanupError] | None = None) -> Fake:
    answers: dict[tuple[str, ...], str | CleanupError] = {
        tuple(OPEN_PRS): "old/in-pr\nmain\n",
    }
    answers.update(extra or {})
    return Fake(answers)


def run_main(argv: Sequence[str], git: Fake, gh: Fake, env: Mapping[str, str] | None = None) -> int:
    return branch_cleanup.main(argv, env or {}, git=git, gh=gh, now=lambda: NOW)


# Parsing


def test_parse_refs_strips_the_prefix_and_skips_other_refs() -> None:
    output = "\n".join(
        [
            ref_line("refs/remotes/origin/feat/x", "a" * 40, "2026-09-10T10:00:00+02:00"),
            ref_line("refs/remotes/upstream/feat/y", "b" * 40, "2026-09-10T10:00:00+02:00"),
            "",
        ]
    )
    refs = branch_cleanup.parse_refs(output, "refs/remotes/origin/")
    assert refs == [Ref("feat/x", "a" * 40, datetime(2026, 9, 10, 8, 0, tzinfo=UTC))]


@pytest.mark.parametrize(
    ("output", "merged"),
    [
        ("", True),
        ("- 1111\n- 2222\n", True),
        ("- 1111\n+ 2222\n", False),
        ("+ 1111\n", False),
    ],
)
def test_cherry_merged_needs_every_commit_in_main(output: str, merged: bool) -> None:
    assert branch_cleanup.cherry_merged(output) is merged


def test_worktree_branches_reads_the_branch_lines() -> None:
    output = "worktree /a\nHEAD 1\nbranch refs/heads/x/y\n\nworktree /b\nHEAD 2\ndetached\n"
    assert branch_cleanup.worktree_branches(output) == {"x/y"}


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/schubergphilis/ai-training.git",
        "https://github.com/schubergphilis/ai-training",
        "git@github.com:schubergphilis/ai-training.git",
        "ssh://git@github.com/schubergphilis/ai-training.git",
    ],
)
def test_origin_of_the_repo_passes(url: str) -> None:
    branch_cleanup.check_origin(Fake({("git", "remote", "get-url", "origin"): url + "\n"}))


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/someone/ai-training.git",
        "https://example.com/schubergphilis/ai-training.git",
        "https://github.com/schubergphilis/ai-training-improvements.git",
    ],
)
def test_origin_elsewhere_is_rejected(url: str) -> None:
    with pytest.raises(CleanupError, match="not schubergphilis/ai-training"):
        branch_cleanup.check_origin(Fake({("git", "remote", "get-url", "origin"): url}))


# Listing


def test_lists_old_merged_branches_and_skips_the_rest() -> None:
    candidates = branch_cleanup.find_candidates(14, NOW, repo_git(), repo_gh())
    assert [(c.remote.name, c.delete_local, c.local_note) for c in candidates] == [
        ("old/local-ahead", False, "local branch kept: it has commits that are not in main"),
        ("old/merged", True, "local branch deleted too"),
        ("old/worktree", False, "local branch kept: checked out in a worktree"),
    ]


def test_a_shorter_window_includes_newer_branches() -> None:
    names = [c.remote.name for c in branch_cleanup.find_candidates(3, NOW, repo_git(), repo_gh())]
    assert "new/merged" in names
    assert "old/unmerged" not in names
    assert "old/in-pr" not in names


def test_local_branch_with_another_tip_but_merged_is_deleted() -> None:
    remote = Ref("x", "a" * 40, NOW)
    local = Ref("x", "b" * 40, NOW)
    git = Fake({cherry("refs/heads/x"): "- 1\n"})
    assert branch_cleanup.local_plan(remote, local, set(), git) == (
        True,
        "local branch deleted too (merged, different tip)",
    )


def test_dry_run_prints_the_list_and_deletes_nothing(capsys: pytest.CaptureFixture[str]) -> None:
    git, gh = repo_git(), repo_gh()
    assert run_main([], git, gh) == 0
    out = capsys.readouterr().out
    assert "3 remote branches merged into main and older than 14 days:" in out
    assert "  old/merged       2026-09-10   20d  local branch deleted too" in out
    assert "Run again with --apply" in out
    assert not any(
        "DELETE" in call or call[:2] == ("git", "branch") for call in git.calls + gh.calls
    )


def test_nothing_to_delete_says_so(capsys: pytest.CaptureFixture[str]) -> None:
    assert run_main(["--days", "30"], repo_git(), repo_gh()) == 0
    assert capsys.readouterr().out == (
        "No remote branch is merged into main and older than 30 days.\n"
    )


# Deleting


def delete_answers(name: str, sha: str) -> dict[tuple[str, ...], str | CleanupError]:
    return {
        ("gh", "api", ref_url(name).replace("/refs/", "/ref/"), "--jq", ".object.sha"): sha + "\n",
        ("gh", "api", "-X", "DELETE", ref_url(name)): "",
    }


def test_apply_deletes_on_github_then_locally(capsys: pytest.CaptureFixture[str]) -> None:
    git = repo_git(
        {
            ("git", "branch", "--delete", "--remotes", "origin/old/merged"): "",
            ("git", "branch", "--delete", "--remotes", "origin/old/local-ahead"): "",
            ("git", "branch", "--delete", "--remotes", "origin/old/worktree"): "",
            ("git", "branch", "-D", "old/merged"): "",
        }
    )
    gh = repo_gh(
        delete_answers("old/local-ahead", "b" * 40)
        | delete_answers("old/merged", "a" * 40)
        | delete_answers("old/worktree", "f" * 40)
    )
    assert run_main(["--apply"], git, gh) == 0
    assert [call for call in gh.calls if "DELETE" in call] == [
        ("gh", "api", "-X", "DELETE", ref_url("old/local-ahead")),
        ("gh", "api", "-X", "DELETE", ref_url("old/merged")),
        ("gh", "api", "-X", "DELETE", ref_url("old/worktree")),
    ]
    assert [call for call in git.calls if call[:3] == ("git", "branch", "-D")] == [
        ("git", "branch", "-D", "old/merged")
    ]
    out = capsys.readouterr().out
    assert "deleted local branch old/merged\n" in out
    assert out.endswith("Deleted 3 branches.\n")


def test_apply_stops_at_the_first_gh_error(capsys: pytest.CaptureFixture[str]) -> None:
    gh = repo_gh(
        delete_answers("old/local-ahead", "b" * 40)
        | {("gh", "api", "-X", "DELETE", ref_url("old/local-ahead")): CleanupError("gh broke")}
    )
    assert run_main(["--apply"], repo_git(), gh) == 1
    assert capsys.readouterr().err == "gh broke\n"
    assert gh.calls[-1] == ("gh", "api", "-X", "DELETE", ref_url("old/local-ahead"))


def test_apply_stops_when_the_branch_moved_on_github(capsys: pytest.CaptureFixture[str]) -> None:
    gh = repo_gh(delete_answers("old/local-ahead", "0" * 40))
    assert run_main(["--apply"], repo_git(), gh) == 1
    assert "Someone pushed to it" in capsys.readouterr().err
    assert not any("DELETE" in call for call in gh.calls)


def test_a_gh_error_while_listing_stops_before_anything(capsys: pytest.CaptureFixture[str]) -> None:
    gh = Fake({tuple(OPEN_PRS): CleanupError("gh: not logged in")})
    assert run_main(["--apply"], repo_git(), gh) == 1
    assert capsys.readouterr().err == "gh: not logged in\n"


# The command line and the agent check


def test_an_agent_is_refused_before_any_command(capsys: pytest.CaptureFixture[str]) -> None:
    git, gh = Fake({}), Fake({})
    assert run_main([], git, gh, env={"CLAUDECODE": "1"}) == 1
    assert "human maintainers only" in capsys.readouterr().err
    assert git.calls == gh.calls == []


@pytest.mark.parametrize("argv", [["--days", "-1"], ["--days", "x"], ["--nope"]])
def test_usage_errors_exit_2(argv: list[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        branch_cleanup.parse_args(argv)
    assert exc.value.code == 2


def test_parse_args_defaults() -> None:
    assert branch_cleanup.parse_args([]) == (14, False)
    assert branch_cleanup.parse_args(["--days", "3", "--apply"]) == (3, True)


def test_run_command_returns_stdout() -> None:
    assert branch_cleanup.run_command(["python3", "-c", "print('hi')"]) == "hi\n"


def test_run_command_reports_the_exit_code_and_stderr() -> None:
    script = "import sys; sys.stderr.write('bad\\n'); sys.exit(3)"
    with pytest.raises(CleanupError, match="exit code 3: bad"):
        branch_cleanup.run_command(["python3", "-c", script])


def test_run_command_reports_a_missing_program() -> None:
    with pytest.raises(CleanupError, match="failed"):
        branch_cleanup.run_command(["no-such-program-for-branch-cleanup"])
