"""Tests for scripts/worktree_root.py, the root every agent worktree goes in (#698)."""

import os
import subprocess
from pathlib import Path

import pytest
import worktree_root


def git(*args: str, cwd: Path) -> None:
    env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull}
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, env=env)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A main checkout at `<tmp>/src/main` and a linked worktree somewhere else."""
    main = tmp_path / "src" / "main"
    main.mkdir(parents=True)
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
    (main / "site").mkdir()
    git("worktree", "add", "-q", "-b", "feat/1-x", str(tmp_path / "elsewhere" / "wt"), cwd=main)
    return tmp_path


@pytest.mark.parametrize("flags", ["gh,glab", ""])
def test_claude_docker_marker_gives_tmp_even_when_empty(repo: Path, flags: str) -> None:
    env = {"CLAUDE_DOCKER_FLAGS": flags}
    assert worktree_root.worktree_root(str(repo / "src" / "main"), env) == Path(
        "/tmp/ai-training-wt"
    )


def test_claude_docker_marker_needs_no_repository(tmp_path: Path) -> None:
    root = worktree_root.worktree_root(str(tmp_path), {"CLAUDE_DOCKER_FLAGS": ""})
    assert str(root) == "/tmp/ai-training-wt"


@pytest.mark.parametrize("where", ["src/main", "src/main/site", "elsewhere/wt"])
def test_without_the_marker_the_root_is_next_to_the_main_checkout(repo: Path, where: str) -> None:
    root = worktree_root.worktree_root(str(repo / where), {"OTHER": "x"})
    assert root == (repo / "src" / "ai-training-wt").resolve()
    assert root.is_absolute()


def test_outside_a_repository_it_raises(tmp_path: Path) -> None:
    with pytest.raises(worktree_root.WorktreeRootError):
        worktree_root.worktree_root(str(tmp_path / "missing"), {})
    with pytest.raises(worktree_root.WorktreeRootError):
        worktree_root.worktree_root("bad\0path", {})


def test_main_prints_the_root(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert worktree_root.main(str(repo / "elsewhere" / "wt"), {}) == 0
    out = capsys.readouterr().out
    assert out == f"{(repo / 'src' / 'ai-training-wt').resolve()}\n"
    assert worktree_root.main(str(repo), {"CLAUDE_DOCKER_FLAGS": "gh"}) == 0
    assert capsys.readouterr().out == "/tmp/ai-training-wt\n"


def test_main_exits_1_with_one_line_outside_a_repository(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert worktree_root.main(str(tmp_path / "missing"), {}) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err.startswith("worktree-root: ")
    assert captured.err.count("\n") == 1
