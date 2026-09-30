"""Git variables in the learner's shell don't change what the git fixtures print.

Each of these fixtures runs git with an allow-list environment:
`GIT_ENV_BASE` in the `_common.py` of most of them, `ENV_BASE` in
tests-and-docs-that-hold's `_common.py`, and `git_env` in first-hook's
`harness.py`, testing-a-skill's `clones.py`,
attribution-and-review-norms' `trailers.py` and team-practice's
`history.py`. Most of them build a fresh
repository and run git in it. `trailers.py` runs `git interpret-trailers`
in an empty directory and builds no repository. This runs every one of
them twice, once plainly and once with variables that change what git
does: a template directory whose pre-commit hook fails, extra config
through GIT_CONFIG_PARAMETERS, an external diff program and GIT_DIFF_OPTS.
The output must match byte for byte. The reversible-changes and
testing-a-skill fixtures print no diff, so for them only the failing
template hook shows a leak. The attribution-and-review-norms fixture makes
no commit and prints no diff, so for it the extra config is the variable
that could leak.

The list is kept by hand, so that a new fixture that runs git without an
allow-list environment fails here instead of being left out. A discovery
test finds every directory under `site/examples/` with a `.py` file that
runs git through `subprocess`, and fails when one is not in the list.

By default some git commands, `git commit` and `git merge` among them,
start `git maintenance run --auto` after their own work and detach it
(https://git-scm.com/docs/git-config, "maintenance.auto" and
"maintenance.autoDetach"). That run takes a lock in
the object database (https://git-scm.com/docs/git-maintenance) and can
still hold it when a fixture removes its temporary directory, so the
cleanup fails (#472, #560). Every fixture's git helper passes
`-c maintenance.auto=false`. A check runs each fixture with a `git` on
PATH that writes git's trace2 event log, and fails when the log shows a
`git maintenance` child. The fixtures in NOT_RUN build their repository
with the same helpers as the fixtures that run.
"""

import ast
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = REPO_ROOT / "site" / "examples"
GIT_FIXTURE_DIRS = [
    "coding-with-agents/attribution-and-review-norms",
    "coding-with-agents/parallel-sessions",
    "coding-with-agents/project-instructions",
    "coding-with-agents/reversible-changes",
    "coding-with-agents/reviewing-the-diff",
    "coding-with-agents/self-checking-loops",
    "coding-with-agents/team-practice",
    "coding-with-agents/tests-and-docs-that-hold",
    "customizing-agents/first-hook",
    "customizing-agents/session-handoff",
    "customizing-agents/testing-a-skill",
]
NOT_RUN = {
    # build.py needs a target directory and prints its usage without one. It
    # builds the repository with the same `build` the other fixtures call.
    "coding-with-agents/reviewing-the-diff/build.py",
    # setup_practice.py needs a target directory and prints its usage without
    # one. diff_only.py builds the same repository with the same `build`.
    "customizing-agents/session-handoff/setup_practice.py",
    # clones.py is the module the other testing-a-skill fixtures import. Run on
    # its own it defines functions and prints nothing, so it would compare two
    # empty outputs. Its `git_env` is exercised through the fixtures that call it.
    "customizing-agents/testing-a-skill/clones.py",
}

NOT_GIT_FIXTURES = {
    # changelog_guard.py runs `git diff --cached` as a plugin hook. Nothing in
    # the course runs it: the learner only reads it. The entry is the file, so
    # a later fixture in the same directory that runs git is still reported.
    "customizing-agents/plugins/release-kit/scripts/changelog_guard.py",
}
SUBPROCESS_FUNCTIONS = {
    "run",
    "Popen",
    "call",
    "check_call",
    "check_output",
    "getoutput",
    "getstatusoutput",
}
SKIPPED_DIRS = {".venv", "node_modules", "__pycache__"}


def _without(assigned: dict[str, list[ast.expr]], name: str) -> dict[str, list[ast.expr]]:
    """The assignments minus one name, so that resolving `x = x + [...]` stops."""
    return {key: values for key, values in assigned.items() if key != name}


def _is_git_name(value: str) -> bool:
    return value == "git" or value.endswith("/git")


def _is_git_program(node: ast.expr, assigned: dict[str, list[ast.expr]]) -> bool:
    """The program of a command line is git.

    That is `"git"` or a path ending in `/git` as a string literal, a name
    the same file assigns such a literal to, or `shutil.which("git")`.
    """
    if isinstance(node, ast.Constant):
        return isinstance(node.value, str) and _is_git_name(node.value)
    if isinstance(node, ast.Name):
        rest = _without(assigned, node.id)
        return any(_is_git_program(value, rest) for value in assigned.get(node.id, []))
    if isinstance(node, ast.Call) and node.args:
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
        return name == "which" and _is_git_program(node.args[0], assigned)
    return False


def _is_git_command(node: ast.expr, assigned: dict[str, list[ast.expr]]) -> bool:
    """Whether a subprocess argument is a git command line.

    It covers a list or tuple literal whose first element is git as
    `_is_git_program` reads it (with or without `*args` after it), that
    literal with `+` something after it, a command string such as
    "git status", and a name that the same file assigns one of those to.
    """
    if isinstance(node, ast.List | ast.Tuple):
        return bool(node.elts) and _is_git_program(node.elts[0], assigned)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _is_git_command(node.left, assigned)
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        words = node.value.split()
        return bool(words) and _is_git_name(words[0])
    if isinstance(node, ast.Name):
        rest = _without(assigned, node.id)
        return any(_is_git_command(value, rest) for value in assigned.get(node.id, []))
    return False


def _subprocess_callers(tree: ast.Module) -> tuple[set[str], set[str]]:
    """The names `subprocess` is imported as, and the names its functions are imported as."""
    modules: set[str] = set()
    functions: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(
                alias.asname or alias.name for alias in node.names if alias.name == "subprocess"
            )
        elif isinstance(node, ast.ImportFrom) and node.module == "subprocess":
            functions.update(
                alias.asname or alias.name
                for alias in node.names
                if alias.name in SUBPROCESS_FUNCTIONS
            )
    return modules, functions


def _is_subprocess_call(call: ast.Call, modules: set[str], functions: set[str]) -> bool:
    func = call.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        return func.value.id in modules and func.attr in SUBPROCESS_FUNCTIONS
    return isinstance(func, ast.Name) and func.id in functions


def _subprocess_wrappers(tree: ast.Module, modules: set[str], functions: set[str]) -> set[str]:
    """The names of the functions the file defines that call a `subprocess` function."""
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        and any(
            isinstance(inner, ast.Call) and _is_subprocess_call(inner, modules, functions)
            for inner in ast.walk(node)
        )
    }


def runs_git(source: str, filename: str = "<source>") -> bool:
    """Whether Python source runs a git command line through `subprocess`.

    That is a `subprocess` call with a git command line, or a call to a
    function the same file defines that calls `subprocess`, with the git
    program as one of its positional arguments, such as
    `run_command(copy, "git", "status")`.
    """
    try:
        tree = ast.parse(source, filename=filename)
    except SyntaxError as error:
        raise ValueError(f"{filename} does not parse, so git discovery stops: {error}") from error
    modules, functions = _subprocess_callers(tree)
    wrappers = _subprocess_wrappers(tree, modules, functions)
    assigned: dict[str, list[ast.expr]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assigned.setdefault(target.id, []).append(node.value)
        elif (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.value is not None
        ):
            assigned.setdefault(node.target.id, []).append(node.value)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name) and node.func.id in wrappers:
            if any(_is_git_program(arg, assigned) for arg in node.args):
                return True
            continue
        if not _is_subprocess_call(node, modules, functions):
            continue
        command = (
            node.args[0]
            if node.args
            else next((kw.value for kw in node.keywords if kw.arg == "args"), None)
        )
        if command is not None and _is_git_command(command, assigned):
            return True
    return False


def git_running_files(root: pathlib.Path) -> set[str]:
    """Every `.py` file under root, relative to it, that runs git.

    Installed packages and caches (SKIPPED_DIRS) are not searched.
    """
    found: set[str] = set()
    for directory, dirnames, filenames in root.walk():
        dirnames[:] = sorted(name for name in dirnames if name not in SKIPPED_DIRS)
        for filename in sorted(filenames):
            if not filename.endswith(".py"):
                continue
            path = directory / filename
            relative = path.relative_to(root).as_posix()
            if runs_git(path.read_text(encoding="utf-8"), relative):
                found.add(relative)
    return found


def missing_git_fixture_dirs(root: pathlib.Path) -> list[str]:
    """The directories with a file that runs git, outside GIT_FIXTURE_DIRS and NOT_GIT_FIXTURES."""
    dirs = {
        pathlib.PurePosixPath(name).parent.as_posix()
        for name in git_running_files(root) - NOT_GIT_FIXTURES
    }
    return sorted(dirs - set(GIT_FIXTURE_DIRS))


def _fixtures() -> list[pathlib.Path]:
    found: list[pathlib.Path] = []
    for name in GIT_FIXTURE_DIRS:
        for path in sorted((EXAMPLES / name).glob("*.py")):
            if path.name.startswith(("_", "test_")) or f"{name}/{path.name}" in NOT_RUN:
                continue
            found.append(path)
    return found


def _run(fixture: pathlib.Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(fixture)],
        cwd=fixture.parent,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _hostile_env(tmp_path: pathlib.Path) -> dict[str, str]:
    hooks = tmp_path / "template" / "hooks"
    hooks.mkdir(parents=True)
    hook = hooks / "pre-commit"
    hook.write_text("#!/bin/sh\necho HOOK-RAN\nexit 1\n", encoding="utf-8")
    hook.chmod(hook.stat().st_mode | stat.S_IEXEC)
    external = tmp_path / "external-diff"
    external.write_text("#!/bin/sh\necho EXTERNAL-DIFF\n", encoding="utf-8")
    external.chmod(external.stat().st_mode | stat.S_IEXEC)
    return dict(
        os.environ,
        GIT_TEMPLATE_DIR=str(tmp_path / "template"),
        GIT_CONFIG_PARAMETERS="'diff.noprefix'='true' 'color.ui'='always'",
        GIT_EXTERNAL_DIFF=str(external),
        GIT_DIFF_OPTS="--unified=1",
    )


def test_every_git_fixture_is_found() -> None:
    names = {f"{path.parent.name}/{path.name}" for path in _fixtures()}
    assert "reversible-changes/commits.py" in names
    assert "reviewing-the-diff/stat.py" in names
    assert "testing-a-skill/fresh_clone.py" in names
    assert "testing-a-skill/tag_placement.py" in names


def test_every_example_directory_that_runs_git_is_listed() -> None:
    missing = missing_git_fixture_dirs(EXAMPLES)
    assert missing == [], "add to GIT_FIXTURE_DIRS: " + ", ".join(missing)


def test_every_listed_directory_still_runs_git() -> None:
    files = git_running_files(EXAMPLES)
    dirs = {pathlib.PurePosixPath(name).parent.as_posix() for name in files}
    stale = sorted(
        [name for name in GIT_FIXTURE_DIRS if name not in dirs]
        + [name for name in NOT_GIT_FIXTURES if name not in files]
    )
    assert stale == []


def test_a_planted_directory_that_runs_git_is_reported_missing(tmp_path: pathlib.Path) -> None:
    listed = tmp_path / GIT_FIXTURE_DIRS[0]
    listed.mkdir(parents=True)
    (listed / "listed.py").write_text(
        'import subprocess\nsubprocess.run(["git", "init"])\n', encoding="utf-8"
    )
    planted = tmp_path / "some-area" / "new-lesson"
    planted.mkdir(parents=True)
    (planted / "status.py").write_text(
        'import subprocess\nsubprocess.run(["git", "status"])\n', encoding="utf-8"
    )
    assert missing_git_fixture_dirs(tmp_path) == ["some-area/new-lesson"]


GIT_STATUS = 'import subprocess\nsubprocess.run(["git", "status"])\n'


def _plant(root: pathlib.Path, relative: str, source: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source, encoding="utf-8")


def test_a_new_git_file_next_to_an_exempted_one_is_reported_missing(
    tmp_path: pathlib.Path,
) -> None:
    for exempted in NOT_GIT_FIXTURES:
        _plant(tmp_path, exempted, GIT_STATUS)
    assert missing_git_fixture_dirs(tmp_path) == []
    exempted_dir = pathlib.PurePosixPath(next(iter(NOT_GIT_FIXTURES))).parent
    _plant(tmp_path, f"{exempted_dir}/new_fixture.py", GIT_STATUS)
    assert missing_git_fixture_dirs(tmp_path) == [str(exempted_dir)]


def test_installed_and_cached_directories_are_skipped(tmp_path: pathlib.Path) -> None:
    for skipped in (".venv/lib/tool.py", "a/node_modules/pkg/tool.py", "a/__pycache__/tool.py"):
        _plant(tmp_path, skipped, GIT_STATUS)
    assert missing_git_fixture_dirs(tmp_path) == []


def test_a_file_that_does_not_parse_names_the_file(tmp_path: pathlib.Path) -> None:
    _plant(tmp_path, "some-area/new-lesson/broken.py", "def (:\n")
    with pytest.raises(ValueError, match=r"some-area/new-lesson/broken\.py"):
        missing_git_fixture_dirs(tmp_path)


@pytest.mark.parametrize(
    "source",
    [
        'import subprocess\nsubprocess.run(["git", "status"])\n',
        "import subprocess\ndef git(*args):\n"
        '    return subprocess.run(["git", "-c", "x=y", *args], check=False)\n',
        'import subprocess\nsubprocess.run(args=("git", "log"))\n',
        'import subprocess\nsubprocess.check_output(["git"] + ["log"])\n',
        'import subprocess\nsubprocess.run("git status", shell=True)\n',
        'import subprocess\nsubprocess.Popen(["/usr/bin/git", "status"])\n',
        'import subprocess\nCMD = ["git", "status"]\nsubprocess.run(CMD)\n',
        'import subprocess as sp\nsp.call(["git", "status"])\n',
        'from subprocess import run as sh\nsh(["git", "status"])\n',
        'import subprocess\nGIT = "git"\nsubprocess.run([GIT, "status"])\n',
        'import shutil\nimport subprocess\nsubprocess.run([shutil.which("git"), "status"])\n',
        'import subprocess\nsubprocess.getoutput("git status")\n',
        'import subprocess\nsubprocess.getstatusoutput("git status")\n',
        'import subprocess\nGIT = "git"\nCMD = [GIT]\nCMD = CMD + ["log"]\nsubprocess.run(CMD)\n',
        "import subprocess\ndef run_command(cwd, *args):\n"
        '    return subprocess.run(list(args), cwd=cwd)\nrun_command(".", "git", "status")\n',
    ],
    ids=[
        "list",
        "starred",
        "args-tuple",
        "concat",
        "string",
        "path",
        "name",
        "alias",
        "from-import",
        "name-element",
        "which",
        "getoutput",
        "getstatusoutput",
        "reassigned-name",
        "wrapper",
    ],
)
def test_the_discovery_finds_each_call_form(source: str) -> None:
    assert runs_git(source)


@pytest.mark.parametrize(
    "source",
    [
        '"""Runs `git status` with subprocess.run(["git", "status"])."""\nimport subprocess\n',
        'import subprocess\n# subprocess.run(["git", "status"])\n'
        'subprocess.run(["python3", "-V"])\n',
        'import subprocess\nprint("git status")\nsubprocess.run(["python3", "-V"])\n',
        'ALLOW = ["Bash(git status *)"]\n',
        'import other\nother.run(["git", "status"])\n',
        'import subprocess\nsubprocess.run(["gitk"])\n',
        "import subprocess\ndef run_command(cwd, *args):\n"
        '    return subprocess.run(list(args), cwd=cwd)\nrun_command(".", "python3", "-V")\n',
        'def label(*args):\n    return " ".join(args)\nlabel("git", "status")\n',
    ],
    ids=[
        "docstring",
        "comment",
        "other-string",
        "rule-string",
        "other-module",
        "gitk",
        "wrapper-other-program",
        "not-a-wrapper",
    ],
)
def test_the_discovery_ignores_text_that_does_not_run_git(source: str) -> None:
    assert not runs_git(source)


def test_every_not_run_entry_names_a_file() -> None:
    missing = sorted(entry for entry in NOT_RUN if not (EXAMPLES / entry).is_file())
    assert missing == []


@pytest.mark.parametrize("fixture", _fixtures(), ids=lambda path: f"{path.parent.name}/{path.name}")
def test_git_variables_in_the_shell_do_not_change_the_output(
    fixture: pathlib.Path, tmp_path: pathlib.Path
) -> None:
    clean = _run(fixture, dict(os.environ))
    hostile = _run(fixture, _hostile_env(tmp_path))
    assert "HOOK-RAN" not in hostile.stdout + hostile.stderr
    assert "EXTERNAL-DIFF" not in hostile.stdout + hostile.stderr
    assert (hostile.returncode, hostile.stdout) == (clean.returncode, clean.stdout), (
        f"stderr with the caller's environment:\n{clean.stderr}\n"
        f"stderr with the git variables:\n{hostile.stderr}"
    )


def maintenance_children(trace_dir: pathlib.Path) -> tuple[int, list[list[str]]]:
    """How many git processes a trace2 event directory logs, and every `git maintenance` child."""
    starts = 0
    children: list[list[str]] = []
    for trace in sorted(trace_dir.iterdir()):
        for line in trace.read_text(encoding="utf-8").splitlines():
            event = json.loads(line)
            argv = event.get("argv", [])
            if event.get("event") == "start":
                starts += 1
            elif event.get("event") == "child_start" and "maintenance" in argv:
                children.append(argv)
    return starts, children


def _traced_env(tmp_path: pathlib.Path) -> tuple[dict[str, str], pathlib.Path]:
    """The caller's environment with a `git` first on PATH that logs trace2 events.

    The fixtures pass the caller's PATH to git and drop every other
    variable, so the wrapper sets GIT_TRACE2_EVENT itself. A directory as
    the target gives each git process its own file
    (https://git-scm.com/docs/api-trace2, "GIT_TRACE2_EVENT").
    """
    real_git = shutil.which("git")
    assert real_git is not None
    trace_dir = tmp_path / "trace2"
    trace_dir.mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    wrapper = bin_dir / "git"
    wrapper.write_text(
        f"#!/bin/sh\nGIT_TRACE2_EVENT='{trace_dir}' exec '{real_git}' \"$@\"\n",
        encoding="utf-8",
    )
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IEXEC)
    path = os.pathsep.join([str(bin_dir), os.environ.get("PATH", "")])
    return dict(os.environ, PATH=path), trace_dir


PLANTED_COMMIT = """import os, subprocess, sys
env = {{
    "PATH": os.environ["PATH"],
    "HOME": sys.argv[1] if len(sys.argv) > 1 else os.getcwd(),
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
    "GIT_AUTHOR_NAME": "Learner",
    "GIT_AUTHOR_EMAIL": "learner@example.com",
    "GIT_COMMITTER_NAME": "Learner",
    "GIT_COMMITTER_EMAIL": "learner@example.com",
}}
def git(*args):
    subprocess.run(["git", "-c", "commit.gpgsign=false", {extra}*args], env=env, check=True)
os.mkdir("repo")
os.chdir("repo")
with open("file.txt", "w") as handle:
    handle.write("one\\n")
git("init", "--quiet")
git("add", ".")
git("commit", "--quiet", "-m", "one")
"""


@pytest.mark.parametrize(
    ("extra", "expected"),
    [("", True), ('"-c", "maintenance.auto=false", ', False)],
    ids=["without-the-setting", "with-the-setting"],
)
def test_the_trace_check_sees_a_commit_that_starts_maintenance(
    tmp_path: pathlib.Path, extra: str, expected: bool
) -> None:
    fixture = tmp_path / "planted" / "commit.py"
    fixture.parent.mkdir()
    fixture.write_text(PLANTED_COMMIT.format(extra=extra), encoding="utf-8")
    env, trace_dir = _traced_env(tmp_path)
    result = _run(fixture, env)
    assert result.returncode == 0, result.stderr
    starts, children = maintenance_children(trace_dir)
    assert starts >= 3
    assert (children != []) is expected


@pytest.mark.parametrize("directory", GIT_FIXTURE_DIRS)
def test_no_git_fixture_starts_a_maintenance_run(directory: str, tmp_path: pathlib.Path) -> None:
    """Each fixture of the directory runs with the traced git and logs no maintenance child.

    Some fixtures run no git themselves, so the count of git processes is
    checked over the directory: zero there means the traced `git` was
    never used, and the check would pass without looking.
    Each traced run must exit and print as an untraced run does, so a
    fixture that stops before its commit can't pass the check.
    """
    fixtures = [path for path in _fixtures() if path.parent == EXAMPLES / directory]
    assert fixtures != []
    total = 0
    found: dict[str, list[list[str]]] = {}
    for index, fixture in enumerate(fixtures):
        run_dir = tmp_path / str(index)
        run_dir.mkdir()
        env, trace_dir = _traced_env(run_dir)
        traced = _run(fixture, env)
        plain = _run(fixture, dict(os.environ))
        assert (traced.returncode, traced.stdout) == (plain.returncode, plain.stdout), (
            f"{fixture.name} with the traced git:\n{traced.stderr}"
        )
        starts, children = maintenance_children(trace_dir)
        total += starts
        if children:
            found[fixture.name] = children
    assert total > 0, f"no fixture in {directory} ran git through the traced PATH"
    assert found == {}, f"git maintenance children: {found}"
