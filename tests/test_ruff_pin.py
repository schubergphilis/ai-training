"""The ruff-pre-commit tag in prek.toml equals the ruff pin in pyproject.toml.

Dependabot moves the `ruff==X.Y.Z` pin in pyproject.toml's dev group but
not the `ruff-pre-commit` rev in prek.toml, so the pre-commit hook and
`mise run py-lint` can run different ruff versions (#598). The rev is a
commit SHA with the tag in a trailing `# vX.Y.Z` comment. tomllib drops
comments, so it finds the rev and a regex reads the comment on that one line.
prek.toml as a whole is TOML 1.1, so only the ruff-pre-commit block is parsed.
This checks only the comment against the pin. Checking that the SHA is the
commit the tag points to needs the network.
"""

import pathlib
import re
import tomllib

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
RUFF_PRE_COMMIT = "https://github.com/astral-sh/ruff-pre-commit"
PROCEDURE = (
    "move the ruff-pre-commit rev and its `# vX.Y.Z` comment in prek.toml to the "
    "ruff version in pyproject.toml (docs/agents/supply-chain.md, the uv.lock bullet)"
)


class PinError(Exception):
    """A pin is missing, malformed or disagrees with the other one."""


def ruff_pin(pyproject_text: str) -> str:
    """Return X.Y.Z from the `ruff==X.Y.Z` entry in the dev dependency group."""
    dev = tomllib.loads(pyproject_text).get("dependency-groups", {}).get("dev", [])
    pins = [entry for entry in dev if isinstance(entry, str) and re.match(r"ruff(?![\w.-])", entry)]
    if len(pins) != 1:
        raise PinError(f"expected one ruff entry in the dev group of pyproject.toml, got {pins}")
    match = re.fullmatch(r"ruff==(\d+\.\d+\.\d+)", pins[0])
    if match is None:
        raise PinError(f"the ruff entry in pyproject.toml is not an exact pin: {pins[0]!r}")
    return match.group(1)


def ruff_pre_commit_block(prek_text: str) -> str:
    """Return the `[[repos]]` block of prek.toml whose repo is ruff-pre-commit.

    prek.toml has multi-line inline tables (TOML 1.1), which tomllib (TOML 1.0)
    rejects, so the file is split at its `[[repos]]` headers and only the
    ruff-pre-commit block, which is TOML 1.0, goes to tomllib.
    """
    blocks = re.split(r"^\[\[repos\]\][ \t]*$", prek_text, flags=re.MULTILINE)[1:]
    ruff_blocks = [block for block in blocks if RUFF_PRE_COMMIT in block]
    if len(ruff_blocks) != 1:
        raise PinError(
            f"expected one {RUFF_PRE_COMMIT} [[repos]] block in prek.toml, got {len(ruff_blocks)}"
        )
    return ruff_blocks[0]


def ruff_pre_commit_tag(prek_text: str) -> str:
    """Return X.Y.Z from the `# vX.Y.Z` comment on the ruff-pre-commit rev line."""
    block = ruff_pre_commit_block(prek_text)
    repo = tomllib.loads(block)
    if repo.get("repo") != RUFF_PRE_COMMIT or not isinstance(repo.get("rev"), str):
        raise PinError(f"the {RUFF_PRE_COMMIT} block in prek.toml has no repo and rev: {repo}")
    rev = repo["rev"]
    rev_lines = [
        line for line in block.splitlines() if re.match(r"\s*rev\s*=", line) and f'"{rev}"' in line
    ]
    if len(rev_lines) != 1:
        raise PinError(f"expected one line with rev {rev} in prek.toml, got {len(rev_lines)}")
    match = re.search(r"#\s*v(\d+\.\d+\.\d+)\s*$", rev_lines[0])
    if match is None:
        raise PinError(f"the ruff-pre-commit rev line has no `# vX.Y.Z` comment: {rev_lines[0]!r}")
    return match.group(1)


def check_ruff_pins(pyproject_text: str, prek_text: str) -> None:
    """Raise PinError naming both versions when they differ."""
    pin = ruff_pin(pyproject_text)
    tag = ruff_pre_commit_tag(prek_text)
    if pin != tag:
        raise PinError(
            f"pyproject.toml pins ruff=={pin} but prek.toml's ruff-pre-commit rev "
            f"is tagged v{tag}: {PROCEDURE}"
        )


PYPROJECT = """
[dependency-groups]
dev = [
  "pytest==9.1.1",
  "ruff==0.16.8",
]
"""

PREK = """
[[repos]]
repo = "https://github.com/other/repo"
rev = "1111111111111111111111111111111111111111" # v9.9.9
hooks = [
  {
    id = "other",
    # A multi-line inline table is TOML 1.1, which tomllib rejects.
  }
]

# Python lint and format.
[[repos]]
repo = "https://github.com/astral-sh/ruff-pre-commit"
rev = "2eeb5678de71a00c0902cbda7105d328432f72cb" # v0.16.8
hooks = [{ id = "ruff-check" }]
"""


def test_the_real_files_agree() -> None:
    check_ruff_pins(
        (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"),
        (REPO_ROOT / "prek.toml").read_text(encoding="utf-8"),
    )


def test_the_whole_fixture_is_not_toml_1_0() -> None:
    with pytest.raises(tomllib.TOMLDecodeError):
        tomllib.loads(PREK)


def test_matching_versions_pass() -> None:
    assert ruff_pin(PYPROJECT) == "0.16.8"
    assert ruff_pre_commit_tag(PREK) == "0.16.8"
    check_ruff_pins(PYPROJECT, PREK)


def test_a_moved_pyproject_pin_fails_and_names_both_versions() -> None:
    with pytest.raises(PinError) as caught:
        check_ruff_pins(PYPROJECT.replace("ruff==0.16.8", "ruff==0.16.9"), PREK)
    message = str(caught.value)
    assert "ruff==0.16.9" in message
    assert "v0.16.8" in message
    assert "docs/agents/supply-chain.md" in message


def test_a_moved_prek_tag_fails() -> None:
    with pytest.raises(PinError, match=r"ruff==0\.16\.8.*v0\.16\.7"):
        check_ruff_pins(PYPROJECT, PREK.replace("# v0.16.8", "# v0.16.7"))


def test_another_repos_tag_is_not_read() -> None:
    assert ruff_pre_commit_tag(PREK.replace("# v9.9.9", "# v0.16.8")) == "0.16.8"
    with pytest.raises(PinError, match=r"ruff==9\.9\.9.*v0\.16\.8"):
        check_ruff_pins(PYPROJECT.replace("0.16.8", "9.9.9"), PREK)


@pytest.mark.parametrize(
    ("prek", "reason"),
    [
        (PREK.replace(" # v0.16.8", ""), "no `# vX.Y.Z` comment"),
        (PREK.replace("# v0.16.8", "# 0.16.8"), "no `# vX.Y.Z` comment"),
        (PREK.replace("astral-sh/ruff-pre-commit", "astral-sh/ruff"), "got 0"),
        (PREK + PREK[PREK.index("# Python") :], "got 2"),
    ],
)
def test_a_missing_or_malformed_tag_fails(prek: str, reason: str) -> None:
    with pytest.raises(PinError, match=re.escape(reason)):
        ruff_pre_commit_tag(prek)


@pytest.mark.parametrize(
    ("pyproject", "reason"),
    [
        (PYPROJECT.replace('  "ruff==0.16.8",\n', ""), "expected one ruff entry"),
        (PYPROJECT.replace("ruff==0.16.8", "ruff>=0.16.8"), "not an exact pin"),
    ],
)
def test_a_missing_or_loose_pin_fails(pyproject: str, reason: str) -> None:
    with pytest.raises(PinError, match=reason):
        ruff_pin(pyproject)
