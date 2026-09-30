"""Builds the git repositories the testing-a-skill fixtures compare.

Both start from a copy of the first-skill fixture package, one directory
over, and never change that package. The author's repository has the history
the release skill was written in: the package committed as release 0.3.0,
the tag `v0.3.0` on that commit, and one change after it. The clean clone is
what a colleague has after copying the package and committing it: one commit
and no tag.

The copy holds the package as it is committed in the course repository, so
a local edit, an untracked file or a `.git` of its own in `fixture-package`
(left by a learner who ran the first-skill exercise in place) doesn't change
what the fixtures print, and a note on stderr says the edits were left out.
Where the course repository can't be read, as in a download of the examples
without `.git`, there is no committed version: the copy takes the files as
they are, and a note on stderr says so and gives git's error.

Every git command runs with an allow-list environment: PATH, a temporary
HOME, LC_ALL=C, a fixed identity and date, and the global and system config
at /dev/null. No setting or hook from the machine that runs the fixture
reaches the repositories, so the output is the same everywhere.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent / "first-skill" / "fixture-package"

CHANGE_SUBJECT = "Document where notes are stored"
CHANGE_TEXT = "\nNotes are stored in `notes.json`, next to `notes.py`.\n"
FIXED_DATE = "2026-09-25T12:00:00+00:00"


def git_env(home: Path) -> dict[str, str]:
    """The only variables git sees. Nothing else from the caller's environment passes."""
    return {
        "PATH": os.environ.get("PATH", os.defpath),
        "HOME": str(home),
        "LC_ALL": "C",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_AUTHOR_NAME": "Learner",
        "GIT_AUTHOR_EMAIL": "learner@example.com",
        "GIT_AUTHOR_DATE": FIXED_DATE,
        "GIT_COMMITTER_NAME": "Learner",
        "GIT_COMMITTER_EMAIL": "learner@example.com",
        "GIT_COMMITTER_DATE": FIXED_DATE,
    }


def python_env() -> dict[str, str]:
    """The only variables the package's release check sees.

    An allow-list like `git_env`, so a PYTHONPATH, PYTHONSAFEPATH or color
    setting in the caller's environment can't change what the check prints.
    The same list is `python_env` in first-skill's `check.py`: keep the two
    in step.
    """
    return {
        "PATH": os.environ.get("PATH", os.defpath),
        "LANG": "C",
        "LC_ALL": "C",
        "PYTHONDONTWRITEBYTECODE": "1",
        "NO_COLOR": "1",
        "PYTHON_COLORS": "0",
    }


class Repo:
    """A copy of the fixture package with its own git repository."""

    def __init__(self, path: Path, home: Path) -> None:
        self.path = path
        self.env = git_env(home)

    def git(self, *args: str, check: bool = True) -> "subprocess.CompletedProcess[str]":
        result = subprocess.run(
            # maintenance.auto=false: a commit starts no detached `git maintenance`
            # run, which could still hold a lock when the temporary directory is removed.
            ["git", "-c", "maintenance.auto=false", *args],
            cwd=self.path,
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        if check and result.returncode != 0:
            raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
        return result

    def last_tag(self) -> Optional[str]:
        """What `git describe --tags --abbrev=0` prints, or None when it fails."""
        result = self.git("describe", "--tags", "--abbrev=0", check=False)
        return result.stdout.strip() if result.returncode == 0 else None

    def subjects(self, since: Optional[str]) -> list[str]:
        """The commit subjects after the tag `since`, or of the whole log, newest first."""
        revisions = [f"{since}..HEAD"] if since else []
        return self.git("log", "--format=%s", *revisions).stdout.splitlines()


def _git_bytes(cwd: Path, env: dict[str, str], *args: str) -> "subprocess.CompletedProcess[bytes]":
    """Runs a git command and keeps its output as bytes, with its stderr and return code."""
    return subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, check=False)


def _failure(result: "subprocess.CompletedProcess[bytes]") -> str:
    """git's error message, for the note that says why the copy fell back."""
    message = result.stderr.decode("utf-8", "replace").strip()
    return message or f"git exited with {result.returncode}"


def copy_committed(source: Path, dest: Path, env: dict[str, str], course: Path) -> Optional[str]:
    """Writes the files under `source` committed at HEAD of the course repository into `dest`.

    The course repository is the one that holds the directory `course`. git
    runs from its top level and reads `source` as a path in that repository,
    so a `.git` a learner made inside `source` is never the one read. Local
    edits and untracked files in `source` never reach `dest`, and a note on
    stderr says when there are some, or that `git status` failed. Returns
    None when the copy is written, or, writing nothing, why it couldn't be:
    git's own error where git failed.
    """
    top = _git_bytes(course, env, "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return _failure(top)
    toplevel = Path(top.stdout.decode("utf-8").strip()).resolve()
    try:
        prefix = source.resolve().relative_to(toplevel).as_posix()
    except ValueError:
        return f"{source} is outside the repository at {toplevel}"
    listing = _git_bytes(toplevel, env, "ls-tree", "-r", "-z", f"HEAD:{prefix}")
    if listing.returncode != 0:
        return _failure(listing)
    if not listing.stdout:
        return f"HEAD:{prefix} holds no files"
    for entry in listing.stdout.decode("utf-8").split("\0"):
        if not entry:
            continue
        meta, name = entry.split("\t", 1)
        mode, kind, obj = meta.split(" ")
        if "__pycache__" in name.split("/"):
            continue
        if kind != "blob" or mode not in ("100644", "100755"):
            raise SystemExit(f"{source / name}: mode {mode} {kind} is not a plain file")
        content = _git_bytes(toplevel, env, "cat-file", "blob", obj)
        if content.returncode != 0:
            raise SystemExit(
                f"git cat-file blob {obj} failed for {source / name}: {_failure(content)}"
            )
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content.stdout)
        if mode == "100755":
            target.chmod(0o755)
    status = _git_bytes(toplevel, env, "--no-optional-locks", "status", "--porcelain", "--", prefix)
    if status.returncode != 0:
        print(
            f"note: git status failed for {source}, so the copy can't say whether"
            f" it has uncommitted changes ({_failure(status)})",
            file=sys.stderr,
        )
    elif status.stdout.strip():
        print(
            f"note: {source} has uncommitted changes, and the copy takes the"
            " committed version without them",
            file=sys.stderr,
        )
    return None


def _copy_package(root: Path, name: str) -> Repo:
    home = root / f"{name}-home"
    home.mkdir(parents=True)
    path = root / name
    reason = copy_committed(PACKAGE, path, git_env(home), HERE)
    if reason is not None:
        print(
            f"note: no committed version of {PACKAGE} to read ({reason}), so the"
            " copy takes its files as they are, local edits included",
            file=sys.stderr,
        )
        shutil.copytree(PACKAGE, path, ignore=shutil.ignore_patterns(".git", "__pycache__"))
    repo = Repo(path, home)
    repo.git("init", "-q", "--initial-branch=main")
    return repo


def author_repo(root: Path) -> Repo:
    """The repository the skill was written in: release 0.3.0 tagged, and one change since."""
    repo = _copy_package(root, "author")
    repo.git("add", ".")
    repo.git("commit", "-q", "-m", "release: 0.3.0")
    repo.git("tag", "v0.3.0")
    with (repo.path / "README.md").open("a", encoding="utf-8") as readme:
        readme.write(CHANGE_TEXT)
    repo.git("commit", "-q", "-a", "-m", CHANGE_SUBJECT)
    return repo


def clean_clone(root: Path) -> Repo:
    """A colleague's copy: the package committed once, with no tag."""
    repo = _copy_package(root, "clean-clone")
    repo.git("add", ".")
    repo.git("commit", "-q", "-m", "Import the notes package")
    return repo
