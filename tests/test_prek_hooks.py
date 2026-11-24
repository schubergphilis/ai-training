"""prek installs nothing: every hook in prek.toml is `builtin` or a local `system` hook.

A remote hook repo makes prek download and build packages from a registry
when it prepares the hook's environment. For the Python hook repos that was
an unpinned setuptools and pins without hashes (#823). The tools now come
from uv.lock, site/bun.lock and mise.lock, which hold hashes, and prek only
runs them. This test keeps it that way. It also replaces the old check that
the ruff-pre-commit tag equals the ruff pin in pyproject.toml (#598): the
hook runs the ruff from .venv, so there is one pin.

The rules come from the prek docs:

- `repo = "builtin"` runs prek's own Rust code and needs no download
  (https://prek.j178.dev/built-in-hooks/, "Network needed for first
  preparation: No").
- `language = "system"` means prek does not install the command
  (https://prek.j178.dev/local-hooks/). The entry can still download
  something itself, so an entry that starts a registry runner such as
  `uvx` or `npx` fails too.

prek.toml has multi-line inline tables (TOML 1.1), which tomllib (TOML 1.0)
rejects, so the file is split at its `[[repos]]` headers, comments are
dropped, and each block is read with regular expressions that accept both
TOML string quotes.
"""

import pathlib
import re

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ALLOWED_REPOS = ("local", "builtin")
PROCEDURE = (
    "install the tool from a lock file (pyproject.toml and uv.lock, site/package.json and "
    "site/bun.lock, or .mise.toml) and run it as a local `system` hook "
    "(prek.toml header, docs/agents/supply-chain.md)"
)


# Commands that fetch a package from a registry when they run. A hook entry
# that uses one installs something even though prek does not.
REGISTRY_RUNNERS = re.compile(
    r"(?<![\w.-])(uvx|npx|pnpx|bunx|pipx|pnpm dlx|yarn dlx|npm exec|bun x|uv tool run"
    r"|uv run --with|pip install|uv pip install)(?![\w.-])"
)


class HookError(Exception):
    """A prek.toml hook would make prek install something."""


def repo_blocks(prek_text: str) -> list[str]:
    """Return the text of each `[[repos]]` block, without the header line."""
    return re.split(r"^\[\[repos\]\][ \t]*$", prek_text, flags=re.MULTILINE)[1:]


def strip_comment(line: str) -> str:
    """Return the line up to a `#` that is outside a TOML string."""
    quote = ""
    escaped = False
    for index, char in enumerate(line):
        if escaped:
            escaped = False
        elif quote:
            # A basic ("...") TOML string has backslash escapes, and a
            # literal ('...') string does not.
            if quote == '"' and char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
        elif char in "\"'":
            quote = char
        elif char == "#":
            return line[:index]
    return line


def strip_comments(block: str) -> str:
    """Drop comments, so the header's prose and trailing notes are not read as config."""
    return "\n".join(strip_comment(line) for line in block.splitlines())


def string_values(key: str, config: str) -> list[str]:
    """Return every `key = "value"` or `key = 'value'` in the config, in order."""
    pattern = rf"""(?<![\w-]){re.escape(key)}\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')"""
    return [double or single for double, single in re.findall(pattern, config)]


def check_block(block: str) -> None:
    """Raise HookError when the block is not a `builtin` or local `system` repo."""
    config = strip_comments(block)
    repos = string_values("repo", config)
    if len(repos) != 1:
        raise HookError(f"expected one `repo =` line in a [[repos]] block, got {repos}")
    repo = repos[0]
    if repo not in ALLOWED_REPOS:
        raise HookError(f"prek.toml has the remote repo {repo!r}: {PROCEDURE}")
    if re.search(r"\badditional_dependencies\b", config):
        raise HookError(f"a {repo!r} hook in prek.toml has additional_dependencies: {PROCEDURE}")
    ids = string_values("id", config)
    if not ids:
        raise HookError(f"a {repo!r} [[repos]] block in prek.toml has no hooks")
    languages = string_values("language", config)
    if repo == "builtin":
        if languages:
            raise HookError(f"builtin hooks take no language, got {languages}")
        return
    if len(languages) != len(ids) or any(language != "system" for language in languages):
        raise HookError(
            f'every local hook needs language = "system", got {languages} for {ids}: {PROCEDURE}'
        )
    for entry in string_values("entry", config):
        runner = REGISTRY_RUNNERS.search(entry)
        if runner is not None:
            raise HookError(
                f"the hook entry {entry!r} runs {runner.group(1)!r}, which downloads from a "
                f"registry: {PROCEDURE}"
            )


def check_prek(prek_text: str) -> None:
    """Raise HookError for the first block that would make prek install something."""
    blocks = repo_blocks(prek_text)
    if not blocks:
        raise HookError("prek.toml has no [[repos]] blocks")
    for block in blocks:
        check_block(block)


PREK = """
# A comment that names repo = "https://example.com" is not config.
[[repos]]
repo = "builtin"
hooks = [
  { id = "trailing-whitespace", exclude = '\\.mdx?$' },
  { id = "check-toml" },
]

[[repos]]
repo = "local"
hooks = [
  {
    id = "mdformat",
    name = "mdformat",
    entry = ".venv/bin/mdformat",
    language = "system",
    types = ["markdown"],
  },
  { id = "gitleaks", name = "gitleaks", entry = "gitleaks detect", language = "system" },
]
"""


def test_the_real_prek_toml_installs_nothing() -> None:
    check_prek((REPO_ROOT / "prek.toml").read_text(encoding="utf-8"))


def test_builtin_and_local_system_hooks_pass() -> None:
    check_prek(PREK)
    assert len(repo_blocks(PREK)) == 2


def test_a_trailing_comment_is_not_config() -> None:
    check_prek(
        PREK.replace('types = ["markdown"],', 'types = ["markdown"], # was language = "python"')
    )


def test_a_hash_inside_a_string_is_kept() -> None:
    assert strip_comment("entry = 'sh -c \"echo #1\"' # note") == "entry = 'sh -c \"echo #1\"' "


def test_a_local_runner_name_inside_a_path_passes() -> None:
    check_prek(PREK.replace(".venv/bin/mdformat", "site/node_modules/.bin/npx-free-tool"))


@pytest.mark.parametrize(
    ("prek", "reason"),
    [
        (
            PREK.replace(
                'repo = "builtin"', 'repo = "https://github.com/pre-commit/pre-commit-hooks"'
            ),
            "remote repo 'https://github.com/pre-commit/pre-commit-hooks'",
        ),
        (
            PREK.replace('language = "system",\n    types', 'language = "python",\n    types'),
            'needs language = "system"',
        ),
        (
            PREK.replace(
                'language = "system",\n    types',
                'language = "system",\n'
                '    additional_dependencies = ["mdformat-gfm==1.0.0"],\n'
                "    types",
            ),
            "has additional_dependencies",
        ),
        (PREK.replace(', language = "system" }', " }"), 'needs language = "system"'),
        (
            PREK.replace('{ id = "check-toml" }', '{ id = "check-toml", language = "python" }'),
            "take no language",
        ),
        (PREK.replace('repo = "local"\n', ""), "expected one `repo =` line"),
        (
            PREK.replace('entry = ".venv/bin/mdformat"', 'entry = "uvx mdformat"'),
            "runs 'uvx'",
        ),
        (
            PREK.replace('entry = "gitleaks detect"', 'entry = "bun x markdownlint-cli2"'),
            "runs 'bun x'",
        ),
        (
            PREK.replace(
                '{ id = "gitleaks"',
                "{ id = 'other', language = 'python' },\n  { id = \"gitleaks\"",
            ),
            'needs language = "system"',
        ),
        (
            PREK.replace(
                'entry = "gitleaks detect"', 'entry = "sh -c \\"echo \\\\\\"x\\\\\\"; npx foo\\""'
            ),
            "runs 'npx'",
        ),
        ('minimum_prek_version = "0.3.0"\n', "no [[repos]] blocks"),
    ],
)
def test_a_hook_that_installs_something_fails(prek: str, reason: str) -> None:
    with pytest.raises(HookError, match=re.escape(reason)):
        check_prek(prek)
