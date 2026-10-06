"""The testing-a-skill fixtures copy the committed first-skill package, and nothing else.

`clones.py` builds its repositories from `first-skill/fixture-package`. A
learner who ran the first-skill exercise in place leaves local edits or new
files or a `.git` of its own there, and those must not change what the
fixtures print. Where the course repository can't be read, the copy falls
back to the files as they are and says so on stderr, with git's error. The
release check that `tag_placement.py` and `first-skill/check.py` run sees
an allow-list environment, so a PYTHONPATH or any other variable in the
caller's shell doesn't reach it.
"""

import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

EXAMPLES = Path(__file__).resolve().parents[1] / "site" / "examples" / "customizing-agents"
CLONES = EXAMPLES / "testing-a-skill" / "clones.py"


@pytest.fixture(scope="module")
def clones() -> ModuleType:
    spec = importlib.util.spec_from_file_location("testing_a_skill_clones", CLONES)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _git(cwd: Path, *args: str) -> None:
    env = {
        "PATH": os.environ.get("PATH", os.defpath),
        "HOME": str(cwd),
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_AUTHOR_NAME": "Test",
        "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "Test",
        "GIT_COMMITTER_EMAIL": "test@example.com",
    }
    subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True)


def _package(parent: Path) -> Path:
    package = parent / "fixture-package"
    (package / "sub").mkdir(parents=True)
    (package / "notes.py").write_text('__version__ = "0.3.0"\n', encoding="utf-8")
    (package / "sub" / "run.sh").write_text("#!/bin/sh\n", encoding="utf-8")
    (package / "sub" / "run.sh").chmod(0o755)
    return package


def _course(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clones: ModuleType) -> Path:
    """A temporary course repository with the package committed, as clones.py sees it."""
    checkout = tmp_path / "checkout"
    package = _package(checkout / "first-skill")
    fixtures = checkout / "testing-a-skill"
    fixtures.mkdir()
    (fixtures / "clones.py").write_text("", encoding="utf-8")
    _git(checkout, "init", "-q")
    _git(checkout, "add", ".")
    _git(checkout, "commit", "-q", "-m", "start")
    monkeypatch.setattr(clones, "PACKAGE", package)
    monkeypatch.setattr(clones, "HERE", fixtures)
    return package


COMMITTED = {"notes.py": '__version__ = "0.3.0"\n', "sub/run.sh": "#!/bin/sh\n"}


def _files(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): path.read_text(encoding="utf-8")
        for path in sorted(root.rglob("*"))
        if path.is_file() and ".git" not in path.relative_to(root).parts
    }


def test_local_edits_and_untracked_files_do_not_reach_the_copy(
    clones: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    package = _course(tmp_path, monkeypatch, clones)
    (package / "notes.py").write_text('__version__ = "0.4.0"\n', encoding="utf-8")
    (package / "left-over.txt").write_text("from a run in place\n", encoding="utf-8")
    (package / "__pycache__").mkdir()
    (package / "__pycache__" / "notes.pyc").write_text("cache\n", encoding="utf-8")

    repo = clones.clean_clone(tmp_path / "out")

    assert _files(repo.path) == COMMITTED
    assert os.access(repo.path / "sub" / "run.sh", os.X_OK)
    err = capsys.readouterr().err
    assert "has uncommitted changes" in err
    assert "local edits included" not in err


def test_a_clean_package_copies_without_a_note(
    clones: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _course(tmp_path, monkeypatch, clones)

    repo = clones.clean_clone(tmp_path / "out")

    assert _files(repo.path) == COMMITTED
    assert capsys.readouterr().err == ""


def test_a_repository_inside_the_package_is_not_the_one_read(
    clones: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # The first-skill exercise says to `git init` the package and commit; a
    # learner who does that in place leaves a repository with a 0.4.0 in it.
    package = _course(tmp_path, monkeypatch, clones)
    _git(package, "init", "-q")
    (package / "notes.py").write_text('__version__ = "0.4.0"\n', encoding="utf-8")
    _git(package, "add", ".")
    _git(package, "commit", "-q", "-m", "release: 0.4.0")

    repo = clones.clean_clone(tmp_path / "out")

    assert _files(repo.path) == COMMITTED
    assert "has uncommitted changes" in capsys.readouterr().err


def test_a_failing_git_status_is_named_in_the_note(
    clones: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    package = _course(tmp_path, monkeypatch, clones)
    (package / "notes.py").write_text('__version__ = "0.4.0"\n', encoding="utf-8")
    real = clones._git_bytes

    def git_bytes(cwd: Path, env: dict[str, str], *args: str) -> subprocess.CompletedProcess[bytes]:
        if "status" in args:
            return subprocess.CompletedProcess(
                ["git", *args], 128, b"", b"fatal: index is locked\n"
            )
        return real(cwd, env, *args)

    monkeypatch.setattr(clones, "_git_bytes", git_bytes)

    repo = clones.clean_clone(tmp_path / "out")

    assert _files(repo.path) == COMMITTED
    err = capsys.readouterr().err
    assert "git status failed" in err
    assert "(fatal: index is locked)" in err
    assert "the copy takes the committed version" not in err


def test_a_committed_symlink_stops_the_copy(
    clones: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    package = _course(tmp_path, monkeypatch, clones)
    (package / "link.py").symlink_to("notes.py")
    _git(tmp_path / "checkout", "add", ".")
    _git(tmp_path / "checkout", "commit", "-q", "-m", "add a link")

    with pytest.raises(SystemExit, match="mode 120000 blob is not a plain file"):
        clones.clean_clone(tmp_path / "out")


def test_a_package_outside_a_git_checkout_is_copied_as_it_is(
    clones: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    package = _package(tmp_path / "download" / "first-skill")
    fixtures = tmp_path / "download" / "testing-a-skill"
    fixtures.mkdir()
    (package / "__pycache__").mkdir()
    (package / "__pycache__" / "notes.pyc").write_text("cache\n", encoding="utf-8")
    monkeypatch.setattr(clones, "PACKAGE", package)
    monkeypatch.setattr(clones, "HERE", fixtures)

    repo = clones.clean_clone(tmp_path / "out")

    assert _files(repo.path) == COMMITTED
    err = capsys.readouterr().err
    assert "local edits included" in err
    assert "not a git repository" in err


def test_a_git_error_is_named_in_the_note(
    clones: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # A `.git` file that points nowhere makes git fail with its own error,
    # the way a `safe.directory` refusal or a broken checkout does.
    package = _package(tmp_path / "broken" / "first-skill")
    fixtures = tmp_path / "broken" / "testing-a-skill"
    fixtures.mkdir()
    (tmp_path / "broken" / ".git").write_text(f"gitdir: {tmp_path / 'missing'}\n", encoding="utf-8")
    monkeypatch.setattr(clones, "PACKAGE", package)
    monkeypatch.setattr(clones, "HERE", fixtures)

    repo = clones.clean_clone(tmp_path / "out")

    assert _files(repo.path) == COMMITTED
    err = capsys.readouterr().err
    assert "local edits included" in err
    # git's own message for a `.git` file it can't follow, which differs
    # from the "(or any of the parent directories)" of a missing checkout.
    # Git 2.56 words it "gitfile does not point to a valid repository".
    assert "(fatal: " in err
    assert (
        "not a git repository: " in err or "gitfile does not point to a valid repository: " in err
    )


def test_the_course_package_is_copied_from_git(clones: ModuleType, tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir()
    reason = clones.copy_committed(
        clones.PACKAGE, tmp_path / "copy", clones.git_env(home), clones.HERE
    )
    assert reason is None
    assert (tmp_path / "copy" / "release_check.py").is_file()


PYTHON_ENV = {"PATH", "LANG", "LC_ALL", "PYTHONDONTWRITEBYTECODE", "NO_COLOR", "PYTHON_COLORS"}


def _load(path: Path, name: str, monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    # tag_placement.py imports clones from its own directory.
    monkeypatch.setattr(sys, "path", [str(path.parent), *sys.path])
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_release_checks_see_only_the_allow_list(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    tag_placement = _load(EXAMPLES / "testing-a-skill" / "tag_placement.py", "tp", monkeypatch)
    check = _load(EXAMPLES / "first-skill" / "check.py", "first_skill_check", monkeypatch)
    monkeypatch.setenv("SKILL_FIXTURE_MARKER", "1")
    seen: list[dict[str, str]] = []

    def fake_run(
        *_args: object, env: dict[str, str], **_kwargs: object
    ) -> subprocess.CompletedProcess[str]:
        seen.append(env)
        return subprocess.CompletedProcess([], 0, "release 0.3.0: ok\n", "")

    monkeypatch.setattr(subprocess, "run", fake_run)

    class FakeRepo:
        path = tmp_path

    tag_placement.release_check(FakeRepo())
    check.run_check(tmp_path)

    assert all("SKILL_FIXTURE_MARKER" not in env for env in seen)
    assert [set(env) for env in seen] == [PYTHON_ENV, PYTHON_ENV]


@pytest.mark.parametrize(
    ("fixture", "cwd_name"),
    [("testing-a-skill/tag_placement.py", "author"), ("first-skill/check.py", "fixture-package")],
)
def test_pythonpath_in_the_shell_does_not_reach_the_release_check(
    fixture: str, cwd_name: str, tmp_path: Path
) -> None:
    # sitecustomize runs at every interpreter start on PYTHONPATH. It prints
    # only inside the package copy, so it shows up in the output only when
    # the release check inherits the caller's environment.
    site = tmp_path / "site"
    site.mkdir()
    (site / "sitecustomize.py").write_text(
        f"import os\nif os.path.basename(os.getcwd()) == {cwd_name!r}:\n    print('LEAK')\n",
        encoding="utf-8",
    )
    path = EXAMPLES / fixture

    def run(env: dict[str, str]) -> str:
        return subprocess.run(
            [sys.executable, str(path)],
            cwd=path.parent,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        ).stdout

    clean = run(dict(os.environ))
    hostile = run(dict(os.environ, PYTHONPATH=str(site)))
    assert "LEAK" not in hostile
    assert hostile == clean
