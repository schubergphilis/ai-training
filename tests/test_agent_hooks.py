"""Tests for the Claude Code hooks in scripts/agent_hooks.py (#349, #342).

The guard is tested through `check_command` with the git lookups replaced,
so no test depends on the checkout it runs in, and through `main` for the
exit code and message Claude Code sees. The git helpers get a throwaway
repository with a linked worktree.
"""

import contextlib
import json
import os
import random
import subprocess
import sys
import time
from collections.abc import Callable, Generator, Sequence
from datetime import UTC, datetime, tzinfo
from pathlib import Path
from typing import ClassVar

import pytest

import agent_hooks
import run_name

MAIN = "/repo"
WORKTREE = "/repo-wt/feat/1-x"


def in_main(path: str) -> bool:
    return path.startswith(MAIN + "/") or path == MAIN


def on_branch(branch: str) -> Callable[[str], str]:
    return lambda _path: branch


def check(
    command: str, cwd: str = WORKTREE, env: dict[str, str] | None = None, branch: str = "feat/1-x"
) -> str | None:
    return agent_hooks.check_command(command, cwd, env or {}, in_main, on_branch(branch))


@pytest.mark.parametrize(
    "command",
    [
        "git push --force origin feat/1-x",
        "git push -f",
        "git push -uf origin feat/1-x",
        "git push origin +feat/1-x",
        "cd /tmp && git push --force",
    ],
)
def test_force_push_is_rejected_with_the_lease_alternative(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "--force-with-lease" in reason


@pytest.mark.parametrize(
    "command",
    [
        "git push --force-with-lease origin feat/x",
        "git push --force-with-lease",
        "git push -u origin feat/1-x",
        "git push",
    ],
)
def test_ordinary_and_lease_pushes_of_a_branch_pass(command: str) -> None:
    assert check(command) is None


@pytest.mark.parametrize(
    "command",
    ["git push origin main", "git push origin HEAD:main", "git push origin x:refs/heads/main"],
)
def test_push_to_main_is_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "no agent pushes to `main`" in reason


def test_plain_push_on_main_is_a_push_to_main() -> None:
    assert check("git push", branch="main") is not None
    assert check("git push origin HEAD", branch="main") is not None


def test_no_role_may_push_main() -> None:
    assert check("AI_TRAINING_ROLE=dispatcher git push origin main") is not None
    assert check("git push origin main", env={"AI_TRAINING_ROLE": "dispatcher"}) is not None
    assert check("AI_TRAINING_ROLE=wave-lead git push origin main") is not None


def test_merge_needs_a_merging_role() -> None:
    reason = check("gh pr merge 12 --rebase")
    assert reason is not None
    assert "wave lead" in reason
    assert check("AI_TRAINING_ROLE=wave-lead gh pr merge 12 --rebase") is None
    assert check("AI_TRAINING_ROLE=dispatcher gh pr merge 12 --rebase") is None
    assert check("gh pr merge 12 --rebase", env={"AI_TRAINING_ROLE": "coordinator"}) is None


@pytest.mark.parametrize(
    "command",
    [
        "git reset --hard",
        "git reset --hard origin/main",
        "git checkout -- .",
        "git checkout .",
        "git restore .",
    ],
)
def test_discarding_commands_are_rejected_in_the_main_checkout(command: str) -> None:
    reason = check(command, cwd=MAIN)
    assert reason is not None
    assert "main checkout" in reason


@pytest.mark.parametrize(
    "command", ["git reset --hard", "git checkout -- .", "git checkout .", "git restore ."]
)
def test_discarding_commands_pass_in_a_worktree(command: str) -> None:
    assert check(command, cwd=WORKTREE) is None


@pytest.mark.parametrize(
    "command",
    [
        "git stash",
        "git stash push -m x",
        "git stash -m x",
        "git stash save x",
        "git stash pop",
        "git stash apply",
        "git stash drop",
        "git stash clear",
        "git stash create",
        "git stash store abc",
        "git stash branch b",
    ],
)
@pytest.mark.parametrize("cwd", [MAIN, WORKTREE])
def test_stash_changes_are_rejected_in_every_worktree(command: str, cwd: str) -> None:
    reason = check(command, cwd=cwd)
    assert reason is not None
    assert "shares one stash" in reason
    assert "git worktree add --detach" in reason


def test_cd_and_dash_c_move_the_stash_check_into_a_worktree() -> None:
    for command in [f"cd {WORKTREE} && git stash", f"git -C {WORKTREE} stash"]:
        reason = check(command, cwd=MAIN)
        assert reason is not None, command
        assert "shares one stash" in reason, command


@pytest.mark.parametrize("command", ["git stash list", "git stash show", "git stash show -p"])
@pytest.mark.parametrize("cwd", [MAIN, WORKTREE])
def test_stash_list_and_show_pass_in_every_worktree(command: str, cwd: str) -> None:
    assert check(command, cwd=cwd) is None


def test_cd_and_dash_c_move_the_check_into_the_main_checkout() -> None:
    assert check(f"cd {MAIN} && git stash") is not None
    assert check(f"git -C {MAIN} reset --hard") is not None
    assert check(f"git -C {MAIN} -c core.pager=cat stash") is not None
    assert check(f"cd {MAIN}/site; git reset --hard") is not None


def test_harmless_git_in_the_main_checkout_passes() -> None:
    for command in [
        "git stash list",
        "git stash show",
        "git reset HEAD~1",
        "git checkout -- a.txt",
        "git status",
    ]:
        assert check(command, cwd=MAIN) is None, command


def test_long_sleep_is_rejected_and_short_sleep_passes() -> None:
    reason = check("sleep 480")
    assert reason is not None
    assert "notifications" in reason
    assert check("sleep 5") is None
    assert check("sleep 60") is None
    assert check("sleep 2m") is not None
    assert check("sleep 30 30 30") is not None
    assert check("mise run site-build && sleep 600") is not None


def test_gh_poll_loops_are_rejected() -> None:
    loop = "for i in $(seq 1 19); do gh pr view 3 --json state; sleep 30; done"
    reason = check(loop)
    assert reason is not None
    assert "poll loop" in reason
    assert (
        check('while [ "$(gh pr view 3 --json state -q .state)" = OPEN ]; do sleep 20; done')
        is not None
    )
    assert check("until gh run view 5 --exit-status; do sleep 10; done") is not None


def test_loops_without_gh_and_gh_without_loops_pass() -> None:
    assert check("for f in a b; do echo $f; done") is None
    assert check("for n in 359 360; do gh issue view $n --json state; done") is None
    assert check("for n in 1 2; do gh issue view $n; done; sleep 5") is not None
    assert check("gh pr checks 3 --watch") is None
    assert check("gh run watch 12") is None


def test_heredoc_bodies_and_quoted_text_are_data() -> None:
    body = "git commit -F - <<'EOF'\nsleep 600 while the gh loop ran\ngit push --force\nEOF"
    assert check(body) is None
    assert check('git commit -m "no sleep 600; for x do gh"') is None
    assert check("cat <<EOF > f\nsleep 900\nEOF\nsleep 900") is not None


def test_unbalanced_quotes_fall_back_to_plain_words() -> None:
    assert check("echo 'unterminated && sleep 900") is not None


def test_guard_bash_event_blocks_with_exit_2_and_names_the_hook() -> None:
    event = {"tool_input": {"command": "sleep 480"}, "cwd": WORKTREE}
    code, message = agent_hooks.guard_bash(event, {})
    assert code == 2
    assert message.startswith("Blocked by .claude/hooks/guard-bash.sh:")


def test_guard_bash_event_without_a_command_passes() -> None:
    assert agent_hooks.guard_bash({"tool_input": {}}, {}) == (0, "")
    assert agent_hooks.guard_bash({}, {}) == (0, "")


def test_main_reads_stdin_and_prints_the_reason(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    event = json.dumps({"tool_input": {"command": "sleep 480"}, "cwd": str(tmp_path)})
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {}) == 2
    assert "sleep" in capsys.readouterr().err
    ok = json.dumps({"tool_input": {"command": "sleep 5"}, "cwd": str(tmp_path)})
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], ok, {}) == 0


def test_main_rejects_a_bad_mode_and_ignores_bad_json(capsys: pytest.CaptureFixture[str]) -> None:
    assert agent_hooks.main(["agent_hooks.py"], "{}", {}) == 1
    assert "usage" in capsys.readouterr().err
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], "not json", {}) == 0
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], "[1]", {}) == 0


# Input the guard can't read blocks the command with exit 2, since Claude
# Code runs a command after a hook's exit 1 (#449).


@pytest.mark.parametrize(
    "command",
    [
        "git push origin main; cd ~nosuchuser",
        "git -C ~nosuchuser push origin main",
        "cd ~nosuchuser/sub && git status",
        "git -C ~nosuchuser/sub -C x status",
    ],
)
def test_guard_blocks_an_unknown_home_directory_and_names_it(
    command: str, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    event = json.dumps({"tool_input": {"command": command}, "cwd": str(tmp_path)})
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {}) == 2
    err = capsys.readouterr().err
    assert err.startswith("Blocked by .claude/hooks/guard-bash.sh:")
    assert "a `~` path it can't resolve (`~nosuchuser" in err
    assert "absolute path" in err


@pytest.mark.parametrize(
    "command", ["cd a\x00b; git push", "git -C a\x00b reset --hard", "rm -rf .scratch/a\x00b"]
)
def test_guard_blocks_a_path_with_a_null_character(command: str, tmp_path: Path) -> None:
    event = {"tool_input": {"command": command}, "cwd": str(tmp_path)}
    code, message = agent_hooks.guard_bash(event, {})
    assert code == 2
    assert message.startswith("Blocked by .claude/hooks/guard-bash.sh:")
    assert "text it can't read" in message or "`rm` of" in message


@pytest.mark.parametrize("command", ["cd ~+ && git push", "cd ~- && git push", "cd ~2"])
def test_guard_blocks_zsh_directory_stack_forms_with_the_tilde_message(command: str) -> None:
    code, message = agent_hooks.guard_bash({"tool_input": {"command": command}}, {})
    assert code == 2
    assert "a `~` path it can't resolve (`~" in message


def test_expand_user_keeps_known_homes_and_names_the_unknown_one() -> None:
    assert agent_hooks.expand_user("~") == Path.home()
    assert agent_hooks.expand_user("a/~b") == Path("a/~b")
    with pytest.raises(agent_hooks.UnknownHomeError) as raised:
        agent_hooks.expand_user("~nosuchuser/x")
    assert raised.value.word == "~nosuchuser/x"


ODD_WORDS = [
    "~nosuchuser",
    "~nosuchuser/x",
    "~+",
    "~-",
    "~2",
    "~",
    "~/x",
    "'~nosuchuser'",
    '"~nosuchuser',
    "'unclosed",
    '"unclosed',
    "'a\"b'\"c'",
    "$(cd ~nosuchuser)",
    "$(echo `cd ~x`)",
    "`echo $(ls`",
    "$((1+2))",
    "${(e)X}",
    "$=X",
    "*(e:touch pwn:)",
    "{~nosuchuser,x}",
    "{a,b}",
    "a\x00b",
    "\\",
    "<<EOF",
    "-C",
    "--",
    "",
]
ODD_COMMANDS = ["cd", "git -C", "git push origin main; cd", "rm -rf .scratch/x", "echo"]


@pytest.mark.parametrize("prefix", ODD_COMMANDS)
def test_guard_exits_0_or_2_and_never_1_on_odd_input(
    prefix: str, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    for first in ODD_WORDS:
        for second in ["", *ODD_WORDS[::3]]:
            command = f"{prefix} {first} {second}"
            event = json.dumps({"tool_input": {"command": command}, "cwd": str(tmp_path)})
            code = agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {})
            assert code in {0, 2}, command
            assert "Traceback" not in capsys.readouterr().err, command


# Polling a background command, skipped git hooks, deletes on GitHub, and
# `rm` out of `.scratch` (#391).


@pytest.mark.parametrize(
    "command",
    [
        "sleep 55 && tail -5 .scratch/fast.txt",
        "sleep 30; cat /private/tmp/task.output",
        "sleep 50\nls -la .scratch",
        "mise run fast > .scratch/f.txt 2>&1 & sleep 55; tail .scratch/f.txt",
        "sleep 55 && head -5 out.txt",
        "sleep 30; grep done log.txt",
        "sleep 10 && wc -l out.txt",
        "sleep 1 && ls",
    ],
)
def test_sleep_then_read_is_polling_and_names_the_foreground_run(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "foreground" in reason
    assert "600000" in reason


def test_reading_without_a_sleep_before_it_passes() -> None:
    assert check("tail -5 .scratch/fast.txt") is None
    assert check("cat a.txt && sleep 5") is None
    assert check("ls .scratch; sleep 1") is None
    assert check("head -5 out.txt") is None
    assert check("grep x f") is None
    assert check("wc -l out.txt") is None


def test_sleep_before_a_command_that_does_not_read_passes() -> None:
    assert check("sleep 2 && mise run fast") is None


@pytest.mark.parametrize(
    "command",
    [
        "git commit --no-verify -m x",
        "git add -A && git commit --amend --no-verify",
        "git commit -n -m x",
        "git commit -anm x",
        "git commit --no-veri -m x",
        "git push --no-verify origin feat/1-x",
        "git -C ../other push --no-verify",
        "mise run fast; git commit -m x --no-verify",
    ],
)
def test_skipping_the_git_hooks_is_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "--no-verify" in reason


@pytest.mark.parametrize(
    "command",
    [
        "git commit -m x",
        "git commit -m --no-verify",
        "git commit -mnote",
        "git commit -am --no-verify",
        'git commit -am "-n fix"',
        'git commit -m "fix: mention --no-verify"',
        "git commit -am x -- -n",
        "git push -n origin feat/1-x",
        "git log --no-verify",
        "git commit -F - <<'EOF'\ngit commit --no-verify\nEOF",
    ],
)
def test_commits_and_pushes_that_keep_the_hooks_pass(command: str) -> None:
    assert check(command) is None


@pytest.mark.parametrize(
    "command",
    [
        "mise run branch-cleanup",
        "mise run branch-cleanup -- --days 3 --apply",
        "mise r branch-cleanup",
        "mise branch-cleanup",
        "scripts/branch_cleanup.py --apply",
        "./scripts/branch_cleanup.py",
        "python3 scripts/branch_cleanup.py",
        "python3.14 -u scripts/branch_cleanup.py --days 3",
        "uv run --locked python scripts/branch_cleanup.py",
        "uv run scripts/branch_cleanup.py",
        "env FOO=1 python3 scripts/branch_cleanup.py",
        "cd scripts && python3 -m branch_cleanup",
        "git status && mise run branch-cleanup",
    ],
)
def test_branch_cleanup_is_rejected_for_agents(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "human maintainers only" in reason


@pytest.mark.parametrize(
    "command",
    [
        "git add scripts/branch_cleanup.py tests/test_branch_cleanup.py",
        "uv run --locked ruff check scripts/branch_cleanup.py",
        "cat scripts/branch_cleanup.py",
        "uv run --locked pytest tests/test_branch_cleanup.py",
        "mise tasks",
        "mise run py-test",
    ],
)
def test_commands_that_only_name_branch_cleanup_pass(command: str) -> None:
    assert check(command) is None


@pytest.mark.parametrize(
    "command",
    [
        "gh repo delete schubergphilis/ai-training --yes",
        "gh api -X DELETE repos/o/r/git/refs/heads/x",
        "gh api repos/o/r/issues/comments/1 -X DELETE",
        "gh api repos/o/r/issues/comments/1 -XDELETE",
        "gh api repos/o/r/issues/comments/1 -X=DELETE",
        "gh api --method DELETE repos/o/r/releases/1",
        "gh api repos/o/r/releases/1 --method=delete",
        "gh issue view 1 && gh api repos/o/r/labels/x --method DELETE",
    ],
)
def test_deletes_on_github_are_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "DELETE" in reason


@pytest.mark.parametrize(
    "command",
    [
        "gh api repos/o/r/pulls/1",
        "gh api -X PATCH repos/o/r/issues/comments/1 -f body=x",
        "gh api --method POST repos/o/r/issues/1/comments -f body=DELETE",
        "gh api repos/o/r/issues -X",
        "gh repo view",
    ],
)
def test_other_gh_calls_pass(command: str) -> None:
    assert check(command) is None


@pytest.mark.parametrize(
    ("command", "outside"),
    [
        ("rm -rf .scratch/x ../other", "../other"),
        ("rm -rf .scratch/../..", ".scratch/../.."),
        ("rm -rf .scratch/..", ".scratch/.."),
        ("rm -rf .scratch/x /", "/"),
        ("rm -rf .scratch/x $HOME", "$HOME"),
        ("rm -rf -- .scratch/x site", "site"),
        ("rm -rf .scratch/x ~nosuchuser/y ../..", "~nosuchuser/y"),
    ],
)
def test_rm_with_a_scratch_target_must_stay_inside_scratch(command: str, outside: str) -> None:
    reason = check(command)
    assert reason is not None
    assert f"`{outside}`" in reason


@pytest.mark.parametrize(
    "command",
    [
        "rm -rf .scratch",
        "rm -rf .scratch/",
        "rm -rf .scratch/x .scratch/y/z",
        "rm -rf .scratch/*",
        "cd site && rm -rf ../.scratch/x",
        "rm -rf site/dist",
        "rm a.txt",
    ],
)
def test_rm_inside_scratch_or_without_a_scratch_target_passes(command: str) -> None:
    assert check(command) is None


# The other ways to skip the git hooks and to delete on GitHub (#421).


@pytest.mark.parametrize(
    "command",
    [
        "gh release delete v1 --yes",
        "gh issue delete 12 --yes",
        "gh label delete bug",
        "gh run delete 123",
        "gh cache delete key",
        "gh secret delete TOKEN",
        "gh variable delete NAME",
        "gh gist delete 1",
        "gh release delete-asset v1 a.zip",
        "gh project item-delete 1 --id x",
        "gh repo deploy-key delete 1",
        "gh issue delete -R o/r 12",
        "gh issue -R o/r delete 12",
        "gh issue view 1 && gh label delete x",
        "gh api graphql -f query='mutation { deleteIssue(input: $in) { clientMutationId } }'",
        "gh api graphql -f query='mutation{deleteRef(input:{refId:\"x\"}){clientMutationId}}'",
    ],
)
def test_every_gh_delete_is_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "for the maintainer" in reason


@pytest.mark.parametrize(
    "command",
    [
        "gh issue close 12",
        "gh label create bug",
        "gh issue view 12",
        "gh search issues delete",
        "gh issue comment 12 --body 'please delete this'",
        "gh api graphql -f query='mutation { addComment(input: $input) { clientMutationId } }'",
        "gh api graphql -f query='query { viewer { login } }'",
    ],
)
def test_gh_calls_that_delete_nothing_pass(command: str) -> None:
    assert check(command) is None


@pytest.mark.parametrize(
    "command",
    [
        "git push origin --delete feat/x",
        "git push origin -d feat/x",
        "git push -d origin feat/x",
        "git push --del origin feat/x",
        "git push -ud origin feat/x",
        "git push -fd origin feat/x",
        "git push origin :feat/x",
        "git push origin +:feat/x",
        "git push origin :refs/tags/v1",
        "git push --prune origin 'refs/heads/*:refs/heads/*'",
        "git push --mirror origin",
        "git -C ../other push origin --delete feat/x",
    ],
)
def test_deleting_a_remote_branch_is_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "Deleting a branch or tag on the remote" in reason


@pytest.mark.parametrize(
    "command",
    [
        "git push origin feat/x",
        "git push -u origin feat/x",
        "git push origin :",
        "git push -o ci.skip origin feat/x",
        "git push -uoci.skip origin feat/x",
        "git push --dry-run origin feat/x",
        "git push origin feat/x:feat/x",
    ],
)
def test_pushes_that_delete_nothing_pass(command: str) -> None:
    assert check(command) is None


@pytest.mark.parametrize(
    ("command", "what"),
    [
        ("SKIP=ruff git commit -m x", "`SKIP` or `PREK_SKIP`"),
        ("SKIP=ruff,mdformat mise run fast", "`SKIP` or `PREK_SKIP`"),
        ("AI_TRAINING_ROLE=wave-lead SKIP=ruff git commit -m x", "`SKIP` or `PREK_SKIP`"),
        ("export SKIP=ruff && git commit -m x", "`SKIP` or `PREK_SKIP`"),
        ("env SKIP=ruff git commit -m x", "`SKIP` or `PREK_SKIP`"),
        ("typeset -x SKIP=ruff", "`SKIP` or `PREK_SKIP`"),
        ("PREK_SKIP=ruff git commit -m x", "`SKIP` or `PREK_SKIP`"),
        ("export PREK_SKIP=ruff", "`SKIP` or `PREK_SKIP`"),
        ("git -c core.hooksPath=/dev/null commit -m x", "core.hooksPath"),
        ("git -c core.hookspath= commit -m x", "core.hooksPath"),
        ("git -c CORE.HOOKSPATH=x push origin feat/x", "core.hooksPath"),
        ("git --config-env=core.hooksPath=H commit -m x", "core.hooksPath"),
        ("git --config-env core.hooksPath=H commit -m x", "core.hooksPath"),
        ("git config core.hooksPath /dev/null", "core.hooksPath"),
        ("git config --local core.hooksPath .nohooks", "core.hooksPath"),
        ("git config set core.hooksPath x", "core.hooksPath"),
        ("git -C ../other config core.hooksPath x", "core.hooksPath"),
        ("git merge --no-verify feat/x", "--no-verify"),
        ("git merge -m note --no-verify feat/x", "--no-verify"),
        ("git pull --no-verify origin main", "--no-verify"),
        ("git rebase --no-verify origin/main", "--no-verify"),
    ],
)
def test_other_ways_to_skip_the_git_hooks_are_rejected(command: str, what: str) -> None:
    reason = check(command)
    assert reason is not None
    assert what in reason
    assert "mise run fast" in reason
    assert "their own terminal" in reason


@pytest.mark.parametrize(
    "command",
    [
        "SKIPPED=1 mise run fast",
        "echo SKIP=ruff",
        'git commit -m "SKIP=ruff is not allowed"',
        "git config user.name x",
        "git config core.hooksPath",
        "git config --get core.hooksPath",
        "git config --unset core.hooksPath",
        "git -c user.name=x log",
        "git merge feat/x",
        "git merge --no-verify-signatures feat/x",
        "git merge -m --no-verify feat/x",
        "git rebase -n origin/main",
    ],
)
def test_commands_that_keep_the_git_hooks_pass(command: str) -> None:
    assert check(command) is None


def test_split_segments_records_the_assignments_it_drops_as_written() -> None:
    segment = agent_hooks.split_segments("A=1 SKIP=x git commit", ".")[0]
    assert segment.words == ["git", "commit"]
    assert segment.assignments == ("A=1", "SKIP=x")


# Findings 1 to 3 of the review of #421.


@pytest.mark.parametrize(
    "command",
    [
        "gh api --method POST graphql -f query='mutation { deleteRef(input: $in) { x } }'",
        "gh api -X POST graphql -f query='mutation { deleteRef(input: $in) { x } }'",
        "gh api -H 'Accept: x' graphql -f query='mutation { deleteIssue(input: $in) { x } }'",
        "gh api --hostname h graphql -f query='mutation { deleteIssue(input: $in) { x } }'",
        "AI_TRAINING_ROLE=wave-lead gh pr merge 12 --rebase -d",
        "AI_TRAINING_ROLE=dispatcher gh pr merge 12 --delete-branch",
        "AI_TRAINING_ROLE=wave-lead gh pr merge 12 -rd",
        "AI_TRAINING_ROLE=wave-lead gh pr merge 12 --rebase --delete-branch",
        "gh pr close 12 --delete-branch",
        "gh pr close 12 -d",
        "gh pr close 12 -c done -d",
        "AI_TRAINING_ROLE=wave-lead gh pr merge 12 --delete-branch=false -d",
        "gh pr close 12 --delete-branch=true",
    ],
)
def test_review_findings_of_421_on_github_deletes_are_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "for the maintainer" in reason


@pytest.mark.parametrize(
    "command",
    [
        "gh repo create delete-test --private",
        "gh pr close 12 -c 'delete it later'",
        "AI_TRAINING_ROLE=wave-lead gh pr merge 12 --delete-branch=false",
        "gh pr view 12 -d",
        "gh pr close -- -d",
    ],
)
def test_gh_commands_near_the_421_review_findings_pass(command: str) -> None:
    assert check(command) is None


def test_a_merging_role_still_merges_without_deleting_the_branch() -> None:
    assert check("AI_TRAINING_ROLE=wave-lead gh pr merge 12 --rebase") is None


@pytest.mark.parametrize(
    "command",
    [
        "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=x git commit",
        "GIT_CONFIG_KEY_3=CORE.HOOKSPATH git push origin feat/x",
        "export GIT_CONFIG_KEY_0=core.hooksPath",
        "GIT_CONFIG_PARAMETERS=\"'core.hooksPath'='/dev/null'\" git commit -m x",
        "env GIT_CONFIG_PARAMETERS=\"'core.hookspath'='x'\" git commit -m x",
    ],
)
def test_core_hooks_path_through_the_git_environment_is_rejected(command: str) -> None:
    reason = check(command)
    assert reason is not None
    assert "core.hooksPath" in reason


@pytest.mark.parametrize(
    "command",
    [
        "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=x git log",
        "GIT_CONFIG_PARAMETERS=\"'user.name'='x'\" git log",
    ],
)
def test_other_config_through_the_git_environment_passes(command: str) -> None:
    assert check(command) is None


def git(*args: str, cwd: Path) -> None:
    env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull}
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, env=env)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    main = tmp_path / "main"
    main.mkdir()
    git("init", "-q", "-b", "main", cwd=main)
    git(
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "base",
        cwd=main,
    )
    git("worktree", "add", "-q", "-b", "feat/1-x", str(tmp_path / "wt"), cwd=main)
    return tmp_path


def test_main_checkout_and_branch_lookups_against_a_real_repository(repo: Path) -> None:
    assert agent_hooks.is_main_checkout(str(repo / "main"))
    assert not agent_hooks.is_main_checkout(str(repo / "wt"))
    assert not agent_hooks.is_main_checkout(str(repo / "missing"))
    assert agent_hooks.current_branch(str(repo / "main")) == "main"
    assert agent_hooks.current_branch(str(repo / "wt")) == "feat/1-x"
    assert agent_hooks.current_branch(str(repo / "missing")) == ""


def test_default_lookups_block_stash_in_every_worktree(repo: Path) -> None:
    assert agent_hooks.check_command("git stash", str(repo / "main"), {}) is not None
    assert agent_hooks.check_command("git stash", str(repo / "wt"), {}) is not None
    assert agent_hooks.check_command("git push", str(repo / "main"), {}) is not None


def test_hook_messages_name_the_worktree_root_next_to_the_main_checkout(repo: Path) -> None:
    root = (repo / "ai-training-wt").resolve()
    stash = agent_hooks.check_command("git stash", str(repo / "wt"), {})
    assert stash is not None
    assert f"`{root}/`" in stash
    reset = agent_hooks.check_command("git reset --hard", str(repo / "main"), {})
    assert reset is not None
    assert f"`{root}/`" in reset


@pytest.mark.parametrize("flags", ["gh,glab", ""])
def test_hook_messages_name_tmp_inside_claude_docker(repo: Path, flags: str) -> None:
    env = {"CLAUDE_DOCKER_FLAGS": flags}
    for command, where in [("git stash", "wt"), ("git reset --hard", "main")]:
        reason = agent_hooks.check_command(command, str(repo / where), env)
        assert reason is not None, command
        assert "`/tmp/ai-training-wt/`" in reason, command


def test_hook_messages_name_the_task_when_git_fails() -> None:
    for command, cwd in [("git stash", WORKTREE), ("git reset --hard", MAIN)]:
        reason = check(command, cwd=cwd)
        assert reason is not None, command
        assert "`mise run worktree-root` prints it" in reason, command


def test_stash_message_through_main_exits_2_when_git_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    event = json.dumps({"cwd": str(tmp_path / "missing"), "tool_input": {"command": "git stash"}})
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {}) == 2
    assert "`mise run worktree-root` prints it" in capsys.readouterr().err


def test_formatter_for_picks_biome_under_site_and_ruff_for_python(tmp_path: Path) -> None:
    biome = tmp_path / "site" / "node_modules" / ".bin" / "biome"
    ruff = tmp_path / ".venv" / "bin" / "ruff"
    for tool in (biome, ruff):
        tool.parent.mkdir(parents=True)
        tool.write_text("")
    ts = agent_hooks.formatter_for(tmp_path / "site" / "src" / "a.ts", tmp_path)
    assert ts == (
        [str(biome), "check", "--write", "--no-errors-on-unmatched", "src/a.ts"],
        tmp_path / "site",
    )
    py = agent_hooks.formatter_for(tmp_path / "scripts" / "a.py", tmp_path)
    assert py == ([str(ruff), "format", "--quiet", "scripts/a.py"], tmp_path)
    assert agent_hooks.formatter_for(tmp_path / "docs" / "a.md", tmp_path) is None
    assert agent_hooks.formatter_for(tmp_path / "site" / "a.md", tmp_path) is None
    assert agent_hooks.formatter_for(Path("/elsewhere/a.ts"), tmp_path) is None


def test_formatter_for_skips_a_missing_tool(tmp_path: Path) -> None:
    assert agent_hooks.formatter_for(tmp_path / "site" / "a.ts", tmp_path) is None
    assert agent_hooks.formatter_for(tmp_path / "a.py", tmp_path) is None


def test_format_file_runs_the_formatter_in_the_edited_worktree(repo: Path) -> None:
    wt = repo / "wt"
    ruff = wt / ".venv" / "bin" / "ruff"
    ruff.parent.mkdir(parents=True)
    log = repo / "ran.txt"
    ruff.write_text(f'#!/bin/sh\necho "$PWD $*" > "{log}"\n')
    ruff.chmod(0o755)
    edited = wt / "x.py"
    edited.write_text("x=1\n")
    assert (
        agent_hooks.main(
            ["agent_hooks.py", "format"], json.dumps({"tool_input": {"file_path": str(edited)}}), {}
        )
        == 0
    )
    assert log.read_text().split() == [str(wt.resolve()), "format", "--quiet", "x.py"]


def test_format_file_never_fails(repo: Path, tmp_path: Path) -> None:
    assert agent_hooks.format_file({"tool_input": {}}) == 0
    assert agent_hooks.format_file({"tool_input": {"file_path": "/no/such/dir/a.py"}}) == 0
    outside = tmp_path / "outside.md"
    assert agent_hooks.format_file({"tool_input": {"file_path": str(repo / "main" / "a.md")}}) == 0
    assert agent_hooks.format_file({"tool_input": {"file_path": str(outside)}}) == 0
    broken = repo / "wt" / ".venv" / "bin" / "ruff"
    broken.parent.mkdir(parents=True)
    broken.write_text("not a program")
    broken.chmod(0o755)
    assert agent_hooks.format_file({"tool_input": {"file_path": str(repo / "wt" / "b.py")}}) == 0


@pytest.mark.parametrize(
    "command",
    [
        "git diff origin/main...HEAD",
        "git log --oneline -5",
        "git -C /tmp/ai-training-wt/feat/1-x show HEAD",
        "git status --short",
        "gh pr diff 12",
        "gh pr view 12 --json files",
        "gh issue view 12",
        "gh issue view 12 --json title,body,labels",
        "mise run site-test",
        "cd /Users/me/git/ai-training-wt/feat/1-x && git diff origin/main...HEAD | head -50",
        "ls site/src",
        "grep -rn 'a > b' site 2>/dev/null",
        "git diff 2>&1 | head",
        "grep -c x file >/dev/null",
        'grep -n "=>" site/src/lib/url.ts',
        "git log -1 &>/dev/null",
    ],
)
def test_review_bash_allows_the_read_only_review_commands(command: str) -> None:
    event = {"tool_input": {"command": command}}
    assert agent_hooks.review_bash(event) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "git commit -am fix",
        "git push",
        "gh pr comment 12 --body x",
        "gh issue comment 12 --body x",
        "sed -i s/a/b/ file.md",
        "rm -rf site",
        "git diff && git checkout -- .",
        "AI_TRAINING_ROLE=dispatcher git diff",
        "git",
    ],
)
def test_review_bash_rejects_anything_else(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "not a review command" in message


@pytest.mark.parametrize(
    "command",
    [
        "grep -rn foo . > out.txt",
        "wc -l a >> b",
        "wc -l a>>b",
        "git diff > review.patch",
        "grep a &> f",
        "grep a >| f",
        "git log 2>err.txt",
    ],
)
def test_review_bash_rejects_a_redirect_to_a_file(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "redirects output to a file" in message


def test_output_redirects_skips_quoted_and_escaped_text() -> None:
    assert agent_hooks.output_redirects("grep 'a>b' f") == []
    assert agent_hooks.output_redirects('grep "a>b \\" > x" f') == []
    assert agent_hooks.output_redirects(r"grep a\>b f") == []
    assert agent_hooks.output_redirects("cmd 2>&1 >&- > out") == ["&1", "&-", "out"]


def test_review_bash_through_main(capsys: pytest.CaptureFixture[str]) -> None:
    event = json.dumps({"tool_input": {"command": "git push"}})
    assert agent_hooks.main(["agent_hooks.py", "review-bash"], event, {}) == 2
    assert "code-reviewer hook" in capsys.readouterr().err
    assert agent_hooks.review_bash({"tool_input": {}}) == (0, "")


# The security reviewer's hook of #495: the review rules plus three audits.

SECURITY_AUDITS = ["mise run audit", "mise run site-audit", "mise run vuln"]


def security_bash(command: str) -> tuple[int, str]:
    event = {"tool_input": {"command": command}}
    return agent_hooks.review_bash(event, agent_hooks.SECURITY_REVIEW)


@pytest.mark.parametrize(
    "command",
    [
        *SECURITY_AUDITS,
        "cd /tmp/ai-training-wt/x && mise run vuln 2>&1 | tail -20",
        "mise run site-test",
        "git log -p --all -- .env",
        "mise run issue-brief -- 384",
        'echo \'{"tool_input": {"command": "git push -f"}}\''
        " | python3 scripts/agent_hooks.py guard-bash",
        "cat .scratch/e.json | python3 scripts/agent_hooks.py review-bash; echo $?",
    ],
)
def test_security_bash_allows_the_review_commands_and_the_audits(command: str) -> None:
    assert security_bash(command) == (0, "")


@pytest.mark.parametrize("command", [*SECURITY_AUDITS, "python3 scripts/agent_hooks.py guard-bash"])
def test_the_code_reviewer_may_not_run_the_security_commands(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "not a review command" in message


@pytest.mark.parametrize(
    "command",
    [
        "mise run fast",
        "mise run ci",
        "mise run site-format",
        "mise run audit extra",
        "mise run vuln && git push",
        "echo $(mise run site-audit; rm -rf site)",
        "gh issue create --title x --body y",
        "gh api -X POST repos/schubergphilis/ai-training/security-advisories",
        "zizmor .",
        "osv-scanner scan -L uv.lock",
        "GH_TOKEN=x mise run audit",
        "python3 scripts/agent_hooks.py format",
        "python3 scripts/agent_hooks.py session-title",
        "python3 scripts/agent_hooks.py guard-bash extra",
        "python3 -c 'import os' scripts/agent_hooks.py guard-bash",
        "python3 other.py guard-bash",
        "python3 ../x/scripts/agent_hooks.py guard-bash",
    ],
)
def test_security_bash_rejects_anything_else(command: str) -> None:
    code, message = security_bash(command)
    assert code == 2
    assert "security-reviewer hook" in message
    assert "not a review command" in message


HOOK_CALL = "python3 scripts/agent_hooks.py guard-bash"


@pytest.mark.parametrize(
    "command",
    [
        f"{HOOK_CALL} < e.json",
        f"{HOOK_CALL} <<< '{{}}'",
        f"{HOOK_CALL} <e.json",
        f"{HOOK_CALL} 0<e.json",
    ],
)
def test_security_bash_rejects_stdin_from_a_file_or_here_string(command: str) -> None:
    code, _ = security_bash(command)
    assert code == 2


@pytest.mark.parametrize(
    "command",
    [
        f"cd /tmp && echo '{{}}' | {HOOK_CALL}",
        f"cd ../x && echo '{{}}' | {HOOK_CALL}",
        f"cd ~ && echo '{{}}' | {HOOK_CALL}",
        f"cd - ; echo '{{}}' | {HOOK_CALL}",
        f"cd /tmp\necho '{{}}' | {HOOK_CALL}",
        f"echo '{{}}' | {HOOK_CALL}; cd /tmp",
        f"chdir /tmp && echo '{{}}' | {HOOK_CALL}",
        f"pushd ../x && echo '{{}}' | {HOOK_CALL}",
        f"popd && echo '{{}}' | {HOOK_CALL}",
        f"for d in ../x; do cd $d; done; echo '{{}}' | {HOOK_CALL}",
    ],
)
def test_security_bash_runs_a_hook_call_only_without_a_directory_change(command: str) -> None:
    code, message = security_bash(command)
    assert code == 2
    assert "runs only in a command without cd" in message


@pytest.mark.parametrize(
    "command",
    [
        f"cd /tmp && echo $({HOOK_CALL})",
        f"cd /tmp && echo `{HOOK_CALL}`",
        f'echo "$(cd /tmp && {HOOK_CALL})"',
        f"echo $(cd /tmp) | {HOOK_CALL}",
        f"cat <(cd /tmp && {HOOK_CALL})",
    ],
)
def test_security_bash_sees_a_directory_change_in_a_substitution(command: str) -> None:
    code, _ = security_bash(command)
    assert code == 2


def test_security_bash_keeps_cd_for_everything_else() -> None:
    assert security_bash(f"echo '{{}}' | {HOOK_CALL}") == (0, "")
    assert security_bash("cd ../x && mise run vuln") == (0, "")
    assert security_bash("cd ../x && git log -1 && mise run site-audit") == (0, "")
    # `cd` in the text of a quoted argument is data.
    assert security_bash(f"echo 'cd /tmp' | {HOOK_CALL}") == (0, "")


def test_security_bash_rejects_a_redirect_and_an_unreadable_command() -> None:
    code, message = security_bash("mise run vuln > report.txt")
    assert code == 2
    assert "redirects output to a file" in message
    code, message = security_bash("mise run 'vuln")
    assert code == 2
    assert "can't check" in message


def test_security_bash_through_main(capsys: pytest.CaptureFixture[str]) -> None:
    allowed = json.dumps({"tool_input": {"command": "mise run site-audit"}})
    assert agent_hooks.main(["agent_hooks.py", "security-bash"], allowed, {}) == 0
    blocked = json.dumps({"tool_input": {"command": "git push"}})
    assert agent_hooks.main(["agent_hooks.py", "security-bash"], blocked, {}) == 2
    assert "security-reviewer hook" in capsys.readouterr().err


def test_the_security_reviewer_agent_is_wired_to_its_hook_and_has_no_write_tools() -> None:
    root = Path(__file__).resolve().parent.parent
    text = (root / ".claude" / "agents" / "security-reviewer.md").read_text(encoding="utf-8")
    frontmatter = text.split("---\n")[1]
    # The top-level `key: value` lines. `hooks:` holds a nested list instead.
    top = [line for line in frontmatter.splitlines() if not line.startswith(" ")]
    fields = dict(line.split(": ", 1) for line in top if ": " in line)
    assert fields["model"] == "fable"
    assert fields["effort"] == "high"
    tools = {tool.strip() for tool in fields["tools"].split(",")}
    assert tools == {"Read", "Grep", "Glob", "WebFetch", "WebSearch", "Bash"}
    assert '.claude/hooks/security-bash.sh"' in frontmatter
    hook = root / ".claude" / "hooks" / "security-bash.sh"
    assert os.access(hook, os.X_OK)
    assert hook.read_text(encoding="utf-8").rstrip().endswith('agent_hooks.py" security-bash')


# The read-only commands and the named check tasks of #388.


@pytest.mark.parametrize(
    "command",
    [
        "cat site/astro.config.mjs",
        "sed -n 1,20p scripts/agent_hooks.py",
        "sed -n '/^## Now/,/^## Change/p' docs/agents/testing.md",
        "sed -ne '$p' -e '1p' file",
        "sed -n '/foo$/p' file",
        "sed -n '/foo$/,$p' file",
        "for f in a b; do sed -n 1p $f; done",
        "sed -nE 10,12p a b",
        "git diff --stat | sort | uniq -c",
        "sort -u -k 2 names.txt",
        "uniq -f 1 names.txt",
        "echo ---",
        "git ls-files '*.mdx' | wc -l",
        "mise tasks",
        "mise tasks --name-only",
        "mise tasks info site-test",
        "for f in a.md b.md; do echo $f; sed -n 1,3p $f; done",
        "for f in $(git ls-files '*.md')\ndo\n  head -1 $f\ndone | sort",
        "mise run setup",
        "mise run py-test",
        "mise run site-test",
        "mise run data 2>&1 | tail -5",
    ],
)
def test_review_bash_allows_the_read_only_commands_of_388(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "sed -i s/a/b/ file.md",
        "sed -i.bak -n 1p file.md",
        "sed -ni 1p file.md",
        "sed --in-place -n 1p file.md",
        "sed -n 1p file.md -i",
        "sed -n '1w out.txt' file.md",
        "sed -n '1p;w out' file.md",
        "sed -n '1e rm -rf .' file.md",
        "X=$'a/w pwn\\n/a'; sed -n \"/$X/p\" f",
        'sed -n "/${X}/p" f',
        "sed -n /$(echo a)/p f",
        "sed -n $p f",
        "sed -n $'1p\\nw pwn' f",
        "sed -n '/`x`/p' f",
        "sed s/a/b/ file.md",
        "sed -n",
        "sed -n -e",
        "sort -o out.txt names.txt",
        "sort -uo out.txt names.txt",
        "sort --output=out.txt names.txt",
        "sort --compress-program=sh names.txt",
        "sort --out=x names.txt",
        "sort --compress=sh names.txt",
        "uniq names.txt out.txt",
        "mise tasks run site-format",
        "mise tasks add x",
        "mise tasks edit lint",
        "for f in *.md; do sed -i s/a/b/ $f; done",
        "for f in a; do rm $f; done",
        "mise run site-format",
        "mise run py-format",
        "mise run lint",
        "mise run site-install",
        "mise run py-install",
        "mise run fast",
        "mise run ci",
        "mise run",
        "mise run site-test site-format",
    ],
)
def test_review_bash_rejects_the_writers_of_388(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "not a review command" in message


def test_review_bash_names_the_allowed_tasks_and_sed_in_the_block_message() -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": "mise run site-format"}})
    assert code == 2
    assert "py-test" in message
    assert "sed -n" in message
    assert "awk" in message
    assert "git range-diff" in message


@pytest.mark.parametrize(
    "command",
    [
        "mise run issue-brief -- 606",
        'mise run issue-brief -- "606"',
        "cd /r/wt && mise run issue-brief -- 606",
        "mise run issue-brief -- 606 2>&1 | head -40",
    ],
)
def test_review_bash_allows_the_issue_brief_of_606(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")
    event = {"tool_input": {"command": command}}
    assert agent_hooks.review_bash(event, agent_hooks.SECURITY_REVIEW) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "mise run issue-brief",
        "mise run issue-brief 606",
        "mise run issue-brief -- 606 607",
        "mise run issue-brief -- 0606",
        "mise run issue-brief -- '#606'",
        "mise run issue-brief -- #606",
        "mise run issue-brief -- x",
        "mise run issue-brief -- --help",
        "mise run issue-brief -- 6*",
        "mise run issue-brief -- $n",
        "mise run issue-brief -- $=X",
        "mise run issue-brief -- ${n}",
        "mise run issue-brief -- $(echo 606)",
        "mise run issue-brief site-test -- 606",
        "mise run issue-brief -- 606; mise run fast",
        "mise run issue-brief -- 606 > brief.txt",
    ],
)
def test_review_bash_rejects_any_other_issue_brief_command(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert message.startswith("Blocked by the code-reviewer hook:")


@pytest.mark.parametrize(
    "command",
    [
        # zsh: brace expansion, a glob qualifier and an unclosed quote
        # can't be read, and only exit 2 blocks the call.
        "mise run issue-brief -- {606,607}",
        "mise run issue-brief -- 606(N)",
        "mise run issue-brief -- '606",
    ],
)
def test_review_bash_blocks_an_issue_brief_it_cannot_read_with_exit_2(command: str) -> None:
    code, _ = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2


@pytest.mark.parametrize(
    "command",
    [
        "gh issue view 606 --comments",
        "gh issue view --comments 606",
        "gh issue view 606 --comments=true",
        "gh issue view 606 -c",
        "gh issue view 606 -wc",
        "gh issue view 606 -c=true",
        "gh issue view 606 -c=1",
        "gh issue view 606 -wc=t",
        "gh pr view 5 -c=1",
        "gh issue view 1\ngh issue view 606 --comments",
        "gh issue view 1\r\ngh issue view 606 --comments\r\n",
        "gh issue view 606 -R schubergphilis/ai-training -c",
        "gh issue view 606 --json comments",
        "gh issue view 606 --json=title,comments -q .comments",
        "gh issue view 606 --json 'body, comments'",
        "gh issue view 606 --json Comments",
        "gh pr view 12 --comments",
        "gh pr view 12 --json reviews",
        "gh pr view 12 --json title,latestReviews",
        "cd /r/wt && gh issue view 606 --comments | head",
        "echo $(gh issue view 606 --comments)",
        "for n in 1 2; do gh issue view $n --comments; done",
        # zsh: a word the shell decides can become `--comments`.
        "for f in --comments; do gh issue view 606 $f; done",
        "for f in comments; do gh issue view 606 --json $f; done",
        "gh issue view 606 --json=$f",
        "gh issue view 606 $=X",
        "gh issue view 606 --json comm*",
        "gh issue view 606 -*",
        "gh issue view 606 --json comm?nts",
        "gh issue view 606 --json [c]omments",
        "gh issue view 606 --json `echo comments`",
        "gh issue view 606 --json $(echo comments)",
    ],
)
def test_review_bash_rejects_a_read_of_every_comment(command: str) -> None:
    for scope in (agent_hooks.CODE_REVIEW, agent_hooks.SECURITY_REVIEW):
        code, message = agent_hooks.review_bash({"tool_input": {"command": command}}, scope)
        assert code == 2
        assert "mise run issue-brief -- <issue>" in message


@pytest.mark.parametrize(
    "command",
    [
        "gh issue view 606",
        "gh issue view 606 --json body,title,labels,state",
        "gh issue view 606 --json commentsX",
        "gh issue view 606 -R schubergphilis/ai-training",
        "gh pr view 12 --json files,reviewDecision",
        "grep -n -- --comments .claude/agents/builder.md",
        "gh pr view 12 --json files -q '.files[].path'",
        "gh issue view 606 --json labels -q '.labels[].name'",
        'gh issue view 606 --json labels --jq ".labels[] | .name"',
        "gh issue view 606 --json title -t '{{.title}}'",
        "ls site/*.md",
    ],
)
def test_review_bash_allows_an_issue_or_pr_read_without_the_comments(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")


def test_review_bash_names_the_issue_brief_in_the_block_message() -> None:
    _, message = agent_hooks.review_bash({"tool_input": {"command": "mise run fast"}})
    assert "mise run issue-brief -- <issue>" in message


def test_review_bash_message_shows_the_expansion_as_written() -> None:
    _, message = agent_hooks.review_bash({"tool_input": {"command": "sed -n $p f"}})
    assert "`sed -n $p f`" in message


def test_mark_expansions_skips_single_quotes_and_escaped_dollars() -> None:
    marked = agent_hooks.mark_expansions("echo \\$a '$b' \"$c '$d'\" ${e} $/")
    assert marked == "echo \\$a '$b' \"\x00c '\x00d'\" \x00{e} $/"


# Command and process substitution, zsh expansions and brace expansion (#414).


@pytest.mark.parametrize(
    "command",
    [
        "for f in $(git ls-files site); do wc -l $f; done",
        "cat <(git log --oneline -3)",
        "echo `git log -1 --format=%h`",
        'echo "$(git log -1 --format=%h)"',
        "git diff $(git log -1 --format=%h origin/main) --stat",
        "echo $(echo $(git log -1 --format=%h))",
        "grep -E '(a|b){1,3}' file",
        'grep -n "f(x)" file',
        "grep -n a\\(b file",
        "echo $'a (b)\\tc'",
        "git show HEAD@{1} --stat",
        "sed -n '/x$/p' file",
        "sed -n '$p' file",
        "echo '`' '$(x)'",
    ],
)
def test_review_bash_checks_substitutions_and_allows_read_ones(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "echo $(rm -rf .)",
        "for f in $(touch x); do :; done",
        "cat <(touch x)",
        "echo `touch x`",
        "cat =(touch x)",
        'echo "$(touch x)"',
        'echo "`touch x`"',
        "echo ${X:-$(touch x)}",
        "echo $(echo $(touch x))",
        "echo $(git diff > out.txt)",
        "$(echo git) diff",
        "mise run $(echo site-format)",
        "sed -n /$(echo a)/p f",
        "X=$'a/w pwn\\n/a'; sed -n \"/$=X/p\" f",
        "X=$'a/w pwn\\n/a'; sed -n \"/$^X/p\" f",
        "X=$'a/w pwn\\n/a'; sed -n \"/$+X/p\" f",
        "sed -n '/a$b/p' f",
    ],
)
def test_review_bash_rejects_a_substitution_that_runs_another_command(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "not a review command" in message or "redirects output" in message


@pytest.mark.parametrize(
    ("command", "what"),
    [
        ("ls *(e:'touch pwn':)", "unquoted `(`"),
        ("ls *(+f)", "unquoted `(`"),
        ("grep x *(.)", "unquoted `(`"),
        ("for ((i=0; i<3; i++)); do echo $i; done", "unquoted `(`"),
        ("(cd site && ls)", "unquoted `(`"),
        ("ls )", "unquoted `)`"),
        ("X='$(touch x)'; echo ${(e)X}", "zsh parameter flag"),
        ('echo "${(e)X}"', "zsh parameter flag"),
        ("ls ${~X}", "zsh parameter flag"),
        ("ls $~X", "zsh parameter flag"),
        ("for X in '*(e:touch pwn:)'; do ls ${^~X}; done", "zsh parameter flag"),
        ("ls ${=~X}", "zsh parameter flag"),
        ("ls ${+~X}", "zsh parameter flag"),
        ("touch x; cd ~nosuchuser", "`~` path it can't resolve (`~nosuchuser`)"),
        ("git -C ~nosuchuser status", "`~` path it can't resolve"),
        ("X=$'a/w pwn\\n/a'; sed -n \"/$~X/p\" f", "zsh parameter flag"),
        ("echo $((1+2))", "arithmetic expansion"),
        ("uniq names.txt{,.out}", "brace expansion"),
        ("sort {-o,out.txt} names.txt", "brace expansion"),
        ("sort -{o,out.txt} names.txt", "brace expansion"),
        ("sed -n 1p f {-i,}", "brace expansion"),
        ("cat f{1..3}", "brace expansion"),
        ("echo $(git log", "unclosed quote or substitution"),
        ('echo "a', "unclosed quote or substitution"),
        ("echo 'a", "unclosed quote"),
        ("echo $'a\\'", "unclosed quote"),
        ("echo `git log", "unclosed backtick"),
        ("echo `echo \\`touch x\\``", "nested backtick"),
        ("echo " + "$(" * 1000 + ")" * 1000, "nested too deep"),
    ],
)
def test_review_bash_rejects_what_it_cannot_read(command: str, what: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "can't check a command" in message
    assert what in message


@pytest.mark.parametrize("command", ["touch x; cd ~nosuchuser", "git -C ~nosuchuser status"])
def test_review_bash_gives_the_unknown_user_case_its_own_hint(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "use an absolute path." in message
    assert "quote a" not in message


def test_review_bash_keeps_the_quoting_hint_for_other_cases() -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": "ls *(+f)"}})
    assert code == 2
    assert "quote a `(`, `)` or `{` that is text" in message
    assert "absolute path" not in message


def test_review_bash_rejects_a_command_shlex_cannot_split() -> None:
    # The scanner accepts `$'...'` with an escaped quote, but shlex doesn't
    # know that quoting and raises on the quote it reads as unclosed.
    code, message = agent_hooks.review_bash({"tool_input": {"command": "echo $'a\\'b'"}})
    assert code == 2
    assert "can't check a command with No closing quotation" in message


def test_review_bash_message_names_the_inner_command_and_shows_the_substitution() -> None:
    _, message = agent_hooks.review_bash({"tool_input": {"command": "echo $(touch x)"}})
    assert "`touch x` is not a review command" in message
    _, message = agent_hooks.review_bash({"tool_input": {"command": "$(echo git) diff"}})
    assert "`$(...) diff` is not a review command" in message


def test_extract_substitutions_returns_the_outer_and_inner_commands() -> None:
    outer, inner = agent_hooks.extract_substitutions(
        'for f in $(git ls-files "$(echo a)"); do cat <(head `echo b`); done'
    )
    assert outer == "for f in \x01; do cat \x01; done"
    assert inner == ["echo a", 'git ls-files "\x01"', "echo b", "head \x01"]


# git config options, assignment prefixes and git --output (#415).


@pytest.mark.parametrize(
    "command",
    [
        "git diff",
        "git log -p",
        "git show",
        "git -C /Users/me/git/ai-training-wt/feat/1-x --no-pager log --oneline -3",
        "git log --oneline --output-indicator-new=+ -1",
        "git diff -- output.txt",
        "cd site && ls",
    ],
)
def test_review_bash_allows_git_reads_without_config_or_output(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "git -c core.fsmonitor='touch x' status",
        "git -ccore.fsmonitor=x status",
        "git -C site -c diff.external=sh diff",
        "git --config-env=core.fsmonitor=CMD status",
        "git --config-env core.fsmonitor=CMD status",
        "GIT_EXTERNAL_DIFF=sh git diff",
        "CMD='touch x' git --config-env=core.fsmonitor=CMD status",
        "PATH=/tmp/x ls",
        "PATH=/tmp/x; ls",
        "for f in a; do GIT_PAGER=sh git log; done",
        "git diff --output=f",
        "git diff --output f",
        "git log --output=f",
        "git log -p --outp=f",
        "git show --out f",
        "git show --o=f",
    ],
)
def test_review_bash_rejects_git_config_assignments_and_git_output(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "not a review command" in message


def test_split_segments_keeps_assignments_only_when_asked() -> None:
    kept = agent_hooks.split_segments("X=1 git diff", ".", keep_assignments=True)
    assert kept[0].words == ["X=1", "git", "diff"]
    dropped = agent_hooks.split_segments("X=1 git diff", ".")
    assert dropped[0].words == ["git", "diff"]


@pytest.mark.parametrize(
    "command", ["touch x; cd ~nosuchuser", "touch x; git -C ~nosuchuser status"]
)
def test_review_bash_blocks_an_unknown_home_directory_with_exit_2(command: str) -> None:
    # `Path.expanduser` raises `RuntimeError`, and exit 1 wouldn't block.
    assert agent_hooks.review_bash({"tool_input": {"command": command}})[0] == 2


def test_guard_hook_script_blocks_the_unknown_home_of_449(tmp_path: Path) -> None:
    hook = Path(__file__).resolve().parents[1] / ".claude" / "hooks" / "guard-bash.sh"
    event = {
        "tool_input": {"command": "git push origin main; cd ~nosuchuser"},
        "cwd": str(tmp_path),
    }
    run = subprocess.run(
        [str(hook)], input=json.dumps(event), capture_output=True, text=True, check=False
    )
    assert run.returncode == 2
    assert "Traceback" not in run.stderr
    assert "`~nosuchuser`" in run.stderr


@pytest.mark.parametrize("command", ["git stash", "git -C {a,b} stash"])
def test_guard_hook_script_blocks_without_the_worktree_root_module(
    tmp_path: Path, command: str
) -> None:
    # PYTHONSAFEPATH=1 keeps scripts/ off the path, so `import worktree_root`
    # fails. The hook must still block with exit 2, since exit 1 doesn't (#698).
    hook = Path(__file__).resolve().parents[1] / ".claude" / "hooks" / "guard-bash.sh"
    event = {"tool_input": {"command": command}, "cwd": str(tmp_path)}
    run = subprocess.run(
        [str(hook)],
        input=json.dumps(event),
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "PYTHONSAFEPATH": "1"},
    )
    assert run.returncode == 2
    assert "Traceback" not in run.stderr
    assert "shares one stash" in run.stderr
    assert "`mise run worktree-root` prints it" in run.stderr


def test_hook_hint_falls_back_when_the_module_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(agent_hooks, "worktree_root", None)
    hint = agent_hooks.worktree_root_hint("/", {"CLAUDE_DOCKER_FLAGS": ""})
    assert hint == "the worktree root (`mise run worktree-root` prints it)"


# More spellings that got past the #414 and #415 checks (#448).


@pytest.mark.parametrize(
    ("command", "what"),
    [
        ("for X in $'a/w pwn\\n/a'; do echo `sed -n \"/\\$X/p\" f`; done", "not a review"),
        ("for x in $'a/w pwn\\n/a'; do echo `sed -n \"/\\$x/p\" f`; done", "not a review"),
        ('echo `sed -n "/\\$x/p" f`', "not a review"),
        ("echo `echo \\`touch x\\``", "nested backtick"),
        ("sort {-o,\\ out.txt} names.txt", "brace expansion"),
        ("sort {-o,' out.txt'} names.txt", "brace expansion"),
        ('sort {-o," out.txt"} names.txt', "brace expansion"),
        ("for PATH in ./bin; do ls; done", "not a review"),
        ("for GIT_DIR in x; do git log; done", "not a review"),
        ("for HOME in x; do ls; done", "not a review"),
        ("for path in ./bin; do ls; done", "not a review"),
        ("for fpath in x; do ls; done", "not a review"),
        ("cat <<EOF\nit's\n$(touch x)\nit's\nEOF", "unquoted here-document"),
        ("cat <<EOF\ntext\nEOF", "unquoted here-document"),
        ("cat <<-EOF\n\ttext\n\tEOF", "unquoted here-document"),
        ("cat << EOF\ntext\nEOF", "unquoted here-document"),
        ("echo $(cat <<EOF\ntext\nEOF\n)", "unquoted here-document"),
        ("grep a <<<EOF\ntouch x\nEOF", "not a review"),
        ("grep a <<<'EOF'\ntouch x\nEOF", "not a review"),
    ],
)
def test_review_bash_rejects_the_spellings_of_448(command: str, what: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert what in message


@pytest.mark.parametrize(
    "command",
    [
        "for f in a b; do echo $f; done",
        "for file in $(git ls-files site); do wc -l $file; done",
        "for x_1 in a; do echo $x_1; done",
        "echo `git log -1 --format=%h`",
        "echo `echo a\\\\b`",
        "cat <<'EOF'\nsome text\nEOF",
        'cat <<"EOF"\nsome text\nEOF',
        "cat <<\\EOF\nsome text\nEOF",
        "cat <<-'EOF'\n\tsome text\n\tEOF",
        "grep a <<<'some text'",
        'grep "{a,b}" f',
        "grep -E 'x{1,3}' f",
        "echo {a}",
    ],
)
def test_review_bash_still_allows_the_read_ones_near_448(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "sed -n '/x/!p' f",
        "sed -n '1,5!p;$p' f",
        "cut -c1-40 f",
        "cut -d: -f1 f | sort",
        "od -c f",
        "git range-diff A...B",
        "awk '{print length}' f",
        "awk -F: -v n=2 '{print $n}' f",
        "awk -F : -vn=2 -- '{print}' f",
        "awk 'BEGIN{print ENVIRON[\"HOME\"]}'",
        "git branch",
        "git branch -a",
        "git branch -vv",
        "git branch -r --list 'feat/*'",
        "git branch --contains HEAD",
        "git branch --merged main",
        "git branch --show-current",
        "git branch --format='%(refname)' --sort=-committerdate",
        "git ls-remote",
        "git ls-remote origin",
        "git ls-remote --tags origin 'refs/tags/v*'",
        "for t in py-lint spell; do mise run $t; done",
        'for t in py-lint spell\ndo\n  mise run "$t"\ndone',
        "for t in py-test; do mise run ${t}; done",
    ],
)
def test_review_bash_allows_the_read_only_commands_of_732(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}}) == (0, "")


@pytest.mark.parametrize(
    "command",
    [
        "sed -n '/x/w out' f",
        "sed -n '/x/W out' f",
        "sed -n '1e date' f",
        "sed -n '1r /etc/passwd' f",
        "sed -n '/x/!w out' f",
        "cut -c1-40 f > out",
        "od -c f >> out",
        "git range-diff --output=x A...B",
        "awk '{system(\"rm x\")}' f",
        "awk '{print > \"f\"}' f",
        "awk '{print | \"sh\"}' f",
        "awk '{\"date\" | getline d}' f",
        "awk 'BEGIN{getline l < \"f\"}'",
        "awk '@include \"x\"'",
        'awk \'BEGIN{f="system"; @f("rm x")}\'',
        "awk -f prog f",
        "awk -i inplace '{print}' f",
        "awk --include x '{print}' f",
        "awk -l x '{print}'",
        "awk -o out '{print}'",
        "awk '{print}' -f prog",
        'awk "$P" f',
        "awk '{print}' $(touch x)",
        "awk -v 'x=1'",
        "git branch -D x",
        "git branch -d x",
        "git branch --delete x",
        "git branch -m x y",
        "git branch -M x",
        "git branch --move x y",
        "git branch -c x y",
        "git branch -C x y",
        "git branch --copy x y",
        "git branch -u origin/x",
        "git branch --set-upstream-to=origin/x",
        "git branch --edit-description",
        "git branch -f x",
        "git branch --force x",
        "git branch --del x",
        "git branch newname",
        "git branch -a newname",
        "git branch --sort=refname newname",
        "git branch --contains -d x",
        "git ls-remote --upload-pack=evil origin",
        "git ls-remote --upload-pack evil origin",
        "git ls-remote --exec=evil origin",
        "git ls-remote 'ext::sh -c touch% x'",
        "for t in py-lint fast; do mise run $t; done",
        "for t in $X; do mise run $t; done",
        "for t in py-*; do mise run $t; done",
        "for t in py-lint; do t=fast; mise run $t; done",
        "for t in py-lint; do echo; mise run $t; done",
        "for t in py-lint; do mise run $t; mise run $t; done",
        "for t in py-lint; do mise run $t:h; done",
        "for t in py-lint; do mise run $=t; done",
        "for t in py-lint; do mise run $t x; done",
        "for t in py-lint; do mise run $u; done",
        "for t in py-lint; do AI_TRAINING_ROLE=lead mise run $t; done",
        "for t in py-lint; { mise run $t }",
    ],
)
def test_review_bash_rejects_the_writers_near_732(command: str) -> None:
    code, message = agent_hooks.review_bash({"tool_input": {"command": command}})
    assert code == 2
    assert "not a review command" in message or "to a file" in message


@pytest.mark.parametrize(
    "command",
    [
        "for t in $(echo fast); do mise run $t; done",
        "for t in {fast,ci}; do mise run $t; done",
        "for t (py-lint) mise run $t",
        "awk '{print}' *(e:'rm x':)",
    ],
)
def test_review_bash_rejects_a_task_loop_or_awk_the_shell_decides(command: str) -> None:
    assert agent_hooks.review_bash({"tool_input": {"command": command}})[0] == 2


def test_review_bash_allows_a_task_loop_over_the_security_tasks() -> None:
    event = {"tool_input": {"command": "for t in audit vuln; do mise run $t; done"}}
    assert agent_hooks.review_bash(event, agent_hooks.SECURITY_REVIEW) == (0, "")
    assert agent_hooks.review_bash(event)[0] == 2


def test_guard_checks_the_lines_after_a_here_string() -> None:
    assert check("cat <<<EOF\ngit push --force\nEOF") is not None
    assert check("cat <<<'EOF'\ngit push --force\nEOF") is not None
    assert check("git commit -F - <<'EOF'\ngit push --force\nEOF") is None


def test_brace_expansion_skips_escaped_and_quoted_text() -> None:
    assert agent_hooks.is_brace_expansion("{-o,\\ x}", 0)
    assert agent_hooks.is_brace_expansion("{-o,'x}'}", 0)
    assert agent_hooks.is_brace_expansion('{-o,"a\\"b"}', 0)
    assert not agent_hooks.is_brace_expansion("{-o 'x,y'", 0)
    assert not agent_hooks.is_brace_expansion("{'unclosed,", 0)


FUZZ_PIECES = [
    *("git", "-C", "cd", "push", "main", "rm", "-rf", ".scratch/", "..", "sleep", "900"),
    *("while", "gh", "do", "done", "stash", "reset", "--hard", "~nosuchuser", "~", "~+"),
    *(";", "&&", "||", "|", "\n", "'", '"', "\\", "$(", ")", "`", "(", "{", "}", ","),
    *("<<E", "E", "$=X", "*(.)", "\x00", "=", "AI_TRAINING_ROLE=lead"),
]


def test_guard_exits_0_or_2_on_random_shell_text(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    rng = random.Random(449)
    for _ in range(3000):
        pieces = rng.choices(FUZZ_PIECES, k=rng.randint(1, 12))
        command = "".join(p + rng.choice(["", " ", " "]) for p in pieces)
        event = json.dumps({"tool_input": {"command": command}, "cwd": str(tmp_path)})
        code = agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {})
        assert code in {0, 2}, repr(command)
        assert "Traceback" not in capsys.readouterr().err, repr(command)


class TestSessionTitle:
    """The `session-title` hook (#373): a `/wave` prompt names the session, nothing blocks."""

    ISSUES: ClassVar[list[dict[str, object]]] = [
        {
            "number": 363,
            "title": "Run: Ferret (lessons)",
            "state": "CLOSED",
            "createdAt": "2026-09-24T08:00:00Z",
        },
        {
            "number": 586,
            "title": "Run: Seal (harness)",
            "state": "OPEN",
            "createdAt": "2026-09-27T23:59:00Z",
        },
    ]
    NOW = datetime(2026, 9, 28, 7, 30, tzinfo=UTC)

    @staticmethod
    def gh_with(issues: list[dict[str, object]]) -> Callable[[Sequence[str]], object]:
        def gh(args: Sequence[str]) -> object:
            assert list(args[:2]) == ["issue", "list"]
            return issues

        return gh

    def title(self, prompt: object, issues: list[dict[str, object]] | None = None) -> str | None:
        return agent_hooks.session_title(
            {"prompt": prompt},
            gh=self.gh_with(self.ISSUES if issues is None else issues),
            now=lambda: self.NOW,
        )

    def test_a_new_run_takes_the_next_name_the_default_kind_and_today(self) -> None:
        # Seal is the newest run, so the next name is the one after it.
        sequence = run_name.run_name_sequence(run_name.NAMES_FILE.read_text(encoding="utf-8"))
        after_seal = sequence[sequence.index("Seal") + 1].lower()
        assert self.title("/wave") == f"wave {after_seal} lessons 2026-09-28"
        assert self.title("  /wave 4 --only 12,13\n") == f"wave {after_seal} lessons 2026-09-28"

    @pytest.mark.parametrize("flag", ["--kind code", "--kind=code"])
    def test_kind_comes_from_the_kind_flag(self, flag: str) -> None:
        title = self.title(f"/wave 3 {flag} --no-filing")
        assert title is not None
        assert title.endswith(" code 2026-09-28")

    def test_a_resume_takes_the_runs_name_kind_and_start_date(self) -> None:
        # The run's createdAt date, not today, and its kind, not --kind.
        assert self.title("/wave --resume Seal") == "wave seal harness 2026-09-27"
        assert self.title("/wave --kind code --resume seal") == "wave seal harness 2026-09-27"

    @pytest.mark.parametrize(
        "prompt",
        [
            "/wave --resume Ferret",  # closed
            "/wave --resume Heron",  # never opened
            "/wave --resume",  # no name
            "/wave --kind",  # no kind
            "/wave --kind docs",  # the skill stops on an unknown kind
        ],
    )
    def test_an_unknown_resume_name_or_a_bad_flag_sets_no_title(self, prompt: str) -> None:
        assert self.title(prompt) is None

    @pytest.mark.parametrize(
        "prompt",
        ["fix the tests", "/wave-status", "please run /wave", "", "\n\n", 42, None],
    )
    def test_a_prompt_that_is_not_wave_sets_no_title_and_calls_no_gh(self, prompt: object) -> None:
        def gh(_args: Sequence[str]) -> object:
            raise AssertionError("gh must not run for this prompt")

        assert agent_hooks.session_title({"prompt": prompt}, gh=gh) is None

    def test_a_long_title_is_cut_to_100_characters(self) -> None:
        name = "A" + "a" * 120
        issues: list[dict[str, object]] = [
            {
                "number": 900,
                "title": f"Run: {name} (code)",
                "state": "OPEN",
                "createdAt": "2026-09-27T10:00:00Z",
            }
        ]
        title = self.title(f"/wave --resume {name}", issues)
        assert title is not None
        assert title == f"wave {name.lower()}"[: agent_hooks.SESSION_TITLE_MAX]
        assert len(title) == agent_hooks.SESSION_TITLE_MAX

    def main_with(
        self, monkeypatch: pytest.MonkeyPatch, gh: Callable[[Sequence[str]], object], stdin: str
    ) -> int:
        monkeypatch.setattr(agent_hooks, "session_gh", gh)
        monkeypatch.setattr(agent_hooks, "datetime", FixedDatetime)
        return agent_hooks.main(["agent_hooks.py", "session-title"], stdin, {})

    def test_main_prints_the_hook_output(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        stdin = json.dumps({"hook_event_name": "UserPromptSubmit", "prompt": "/wave --resume Seal"})
        assert self.main_with(monkeypatch, self.gh_with(self.ISSUES), stdin) == 0
        out = json.loads(capsys.readouterr().out)
        assert out == {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "sessionTitle": "wave seal harness 2026-09-27",
            }
        }

    def test_main_uses_the_utc_date_for_a_new_run(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        # At 2026-09-27 23:30 UTC the local date at UTC+2 is already
        # 2026-09-28, so a hook that asked for local time fails here.
        stdin = json.dumps({"prompt": "/wave --kind code"})
        with local_zone("Etc/GMT-2"):  # POSIX sign: this zone is UTC+2
            assert datetime.fromtimestamp(FixedDatetime.INSTANT.timestamp()).day == 28
            assert self.main_with(monkeypatch, self.gh_with(self.ISSUES), stdin) == 0
        title = json.loads(capsys.readouterr().out)["hookSpecificOutput"]["sessionTitle"]
        assert title.endswith(" code 2026-09-27")

    def test_the_fixed_clock_gives_local_time_without_a_zone(self) -> None:
        # The fake clock must tell UTC from local time, or the test above
        # proves nothing.
        with local_zone("Etc/GMT-2"):
            assert FixedDatetime.now().date().isoformat() == "2026-09-28"
            assert FixedDatetime.now(UTC).date().isoformat() == "2026-09-27"

    def test_guard_and_session_title_run_when_run_name_cannot_import(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        # None in sys.modules makes `import run_name` raise ImportError.
        monkeypatch.setitem(sys.modules, "run_name", None)
        push = json.dumps({"tool_input": {"command": "git push --force"}, "cwd": WORKTREE})
        assert agent_hooks.main(["agent_hooks.py", "guard-bash"], push, {}) == 2
        wave = json.dumps({"prompt": "/wave"})
        assert agent_hooks.main(["agent_hooks.py", "session-title"], wave, {}) == 0
        assert capsys.readouterr().out == ""

    def test_importing_the_hooks_does_not_import_run_name(self) -> None:
        scripts = Path(agent_hooks.__file__).resolve().parent
        done = subprocess.run(
            [sys.executable, "-c", "import sys, agent_hooks; print('run_name' in sys.modules)"],
            cwd=scripts,
            capture_output=True,
            text=True,
            check=True,
        )
        assert done.stdout.strip() == "False"

    @pytest.mark.parametrize(
        "error",
        [
            run_name.RunNameError("gh issue list failed"),
            OSError("no gh"),
            KeyError("title"),
            TypeError("gh printed a dict"),
            RuntimeError("anything else"),
        ],
    )
    def test_main_exits_0_with_no_title_when_run_name_fails(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
        error: Exception,
    ) -> None:
        def gh(_args: Sequence[str]) -> object:
            raise error

        stdin = json.dumps({"prompt": "/wave"})
        assert self.main_with(monkeypatch, gh, stdin) == 0
        captured = capsys.readouterr()
        assert captured.out == ""
        assert "session-title: no title" in captured.err

    def test_main_exits_0_when_gh_prints_the_wrong_json(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        stdin = json.dumps({"prompt": "/wave --resume Seal"})
        assert self.main_with(monkeypatch, lambda _args: [{"number": 1}], stdin) == 0
        assert capsys.readouterr().out == ""

    def test_main_exits_0_when_the_names_file_is_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
        tmp_path: Path,
    ) -> None:
        monkeypatch.setattr(run_name, "NAMES_FILE", tmp_path / "missing.txt")
        stdin = json.dumps({"prompt": "/wave"})
        assert self.main_with(monkeypatch, self.gh_with(self.ISSUES), stdin) == 0
        assert capsys.readouterr().out == ""

    @pytest.mark.parametrize("stdin", ["not json", "[1]", "", '{"prompt": "/wave"'])
    def test_main_exits_0_on_bad_json(self, stdin: str, capsys: pytest.CaptureFixture[str]) -> None:
        assert agent_hooks.main(["agent_hooks.py", "session-title"], stdin, {}) == 0
        assert capsys.readouterr().out == ""

    def test_session_gh_turns_a_failing_gh_into_a_run_name_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fail(*_args: object, **_kwargs: object) -> object:
            raise subprocess.TimeoutExpired(["gh"], agent_hooks.SESSION_GH_TIMEOUT)

        monkeypatch.setattr(agent_hooks.subprocess, "run", fail)
        with pytest.raises(run_name.RunNameError, match="gh issue list failed"):
            agent_hooks.session_gh(["issue", "list"])

    def test_session_gh_parses_gh_output(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def ok(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(args, 0, stdout='[{"number": 1}]', stderr="")

        monkeypatch.setattr(agent_hooks.subprocess, "run", ok)
        assert agent_hooks.session_gh(["issue", "list"]) == [{"number": 1}]

    def test_the_wrapper_exits_0_with_no_title_when_gh_fails(self, tmp_path: Path) -> None:
        # A PATH whose gh exits 1, and python3 from this interpreter.
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        fake_gh = bin_dir / "gh"
        fake_gh.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        fake_gh.chmod(0o755)
        (bin_dir / "python3").symlink_to(sys.executable)
        wrapper = Path(__file__).resolve().parent.parent / ".claude" / "hooks" / "session-title.sh"
        env = {"PATH": f"{bin_dir}:/usr/bin:/bin", "HOME": str(tmp_path)}
        for stdin in ('{"prompt": "/wave --kind code"}', "not json", '{"prompt": "hello"}'):
            done = subprocess.run(
                [str(wrapper)], input=stdin, capture_output=True, text=True, env=env, check=False
            )
            assert done.returncode == 0, stdin
            assert done.stdout == "", stdin


class FixedDatetime(datetime):
    """`datetime` with `now` fixed at 2026-09-27 23:30 UTC, for the tests through `main`.

    `now(tz)` gives that instant in `tz`, and `now()` in the local zone,
    as `datetime.now` does.
    """

    INSTANT: ClassVar[datetime] = datetime(2026, 9, 27, 23, 30, tzinfo=UTC)

    @classmethod
    def now(cls, tz: tzinfo | None = None) -> datetime:
        moment = cls.INSTANT.astimezone(tz)
        return moment if tz is not None else moment.replace(tzinfo=None)


@contextlib.contextmanager
def local_zone(zone: str) -> Generator[None]:
    """Set the process's local time zone (`TZ` and `time.tzset`) and restore it after."""
    old = os.environ.get("TZ")
    os.environ["TZ"] = zone
    time.tzset()
    try:
        yield
    finally:
        if old is None:
            del os.environ["TZ"]
        else:
            os.environ["TZ"] = old
        time.tzset()


@pytest.mark.parametrize(
    "command",
    [
        "echo x > osv-scanner.toml",
        "echo x >>osv-scanner.toml",
        "cat a 1> ./osv-scanner.toml",
        "printf x | tee -a osv-scanner.toml",
        "cp /tmp/x osv-scanner.toml",
        "rm osv-scanner.toml",
        "sed -i '' 's/11-03/12-03/' osv-scanner.toml",
        "sed -Ei 's/11-03/12-03/' osv-scanner.toml",
        "perl -pi -e 's/a/b/' ../ai-training/osv-scanner.toml",
        "git checkout main -- osv-scanner.toml",
        "git restore osv-scanner.toml",
        "git rm osv-scanner.toml",
    ],
)
def test_a_write_to_the_osv_config_asks_the_maintainer(
    command: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert check(command) is None, command
    event = json.dumps({"tool_input": {"command": command}, "cwd": WORKTREE})
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {}) == 0
    output = json.loads(capsys.readouterr().out)["hookSpecificOutput"]
    assert output["hookEventName"] == "PreToolUse"
    assert output["permissionDecision"] == "ask"
    assert "30 days" in output["permissionDecisionReason"]


@pytest.mark.parametrize(
    "command",
    [
        "cat osv-scanner.toml",
        "sed -n 1,20p osv-scanner.toml",
        "git diff osv-scanner.toml",
        "git add osv-scanner.toml",
        "osv-scanner scan source --config osv-scanner.toml -L uv.lock",
        "git commit -m 'docs: say why osv-scanner.toml has an entry'",
        "gh issue create --title x --body 'see osv-scanner.toml'",
        "cat osv-scanner.toml > .scratch/osv.toml",
    ],
)
def test_reading_or_naming_the_osv_config_passes_without_asking(
    command: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert check(command) is None, command
    event = json.dumps({"tool_input": {"command": command}, "cwd": WORKTREE})
    assert agent_hooks.main(["agent_hooks.py", "guard-bash"], event, {}) == 0
    assert capsys.readouterr().out == ""


def test_an_empty_argument_does_not_split_the_command() -> None:
    reason = check("git push '' --force")
    assert reason is not None
    assert "--force-with-lease" in reason
