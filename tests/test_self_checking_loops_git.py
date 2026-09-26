"""The self-checking-loops fixtures leave no git process running after a commit.

By default `git commit` starts `git maintenance run --auto --detach`, and that
process can still hold `.git/objects/maintenance.lock` when a fixture removes
its temporary directory. The cleanup then fails with "Directory not empty:
'objects'" and the fixture exits 1 after its full output (#472). The `git`
helper in the fixtures' `_common.py` turns that run off with
`maintenance.auto=false`.

git's trace2 event log names every child process a command starts, so the
tests read it instead of racing the cleanup. The first test commits with
git's defaults and sees the maintenance child, which shows that the log
finds it. The second test runs the fixtures' own `start_repository` and sees
none.
"""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

COMMON = (
    Path(__file__).resolve().parents[1]
    / "site"
    / "examples"
    / "coding-with-agents"
    / "self-checking-loops"
    / "_common.py"
)


@pytest.fixture(scope="module")
def common() -> ModuleType:
    spec = importlib.util.spec_from_file_location("self_checking_loops_common", COMMON)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def maintenance_children(trace: Path) -> list[list[str]]:
    """The command lines of every `git maintenance` child in a trace2 event log."""
    children: list[list[str]] = []
    for line in trace.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        argv = event.get("argv", [])
        if event.get("event") == "child_start" and "maintenance" in argv:
            children.append(argv)
    return children


def test_a_plain_commit_starts_maintenance_and_the_trace_shows_it(
    common: ModuleType, tmp_path: Path
) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "file.txt").write_text("one\n", encoding="utf-8")
    trace = tmp_path / "trace.json"
    env = dict(common.GIT_ENV_BASE, HOME=str(tmp_path), GIT_TRACE2_EVENT=str(trace))
    for args in (["init", "--quiet"], ["add", "."], ["commit", "--quiet", "-m", "one"]):
        subprocess.run(["git", *args], cwd=repo, env=env, check=True, capture_output=True)
    assert maintenance_children(trace) != []


def test_the_fixture_commit_starts_no_maintenance(
    common: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    trace = tmp_path / "trace.json"
    monkeypatch.setitem(common.GIT_ENV_BASE, "GIT_TRACE2_EVENT", str(trace))
    copy = common.make_copy(str(tmp_path))
    common.start_repository(copy)
    common.git(copy, "add", "-A")
    assert trace.is_file()
    assert maintenance_children(trace) == []
    assert not (Path(copy) / ".git" / "objects" / "maintenance.lock").exists()
