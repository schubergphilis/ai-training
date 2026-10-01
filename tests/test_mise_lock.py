"""Every platform entry in mise.lock has a checksum (#611).

The lockfile format is on https://mise.jdx.dev/dev-tools/mise-lock.html,
"File Format": the lockfile is TOML, each tool version is an entry in the
array `[[tools.<name>]]`, and each platform of that version is a table
under a quoted key such as `[tools.node."platforms.macos-arm64"]`, with an
optional `checksum`. TOML attaches such a table to the last `[[tools.<name>]]`
entry above it, so a tool with two versions has its platform tables in
both entries.

`checksum` is optional in the format, but a platform without one installs
without an integrity check. `mise lock` writes an entry with only
`provenance` for a platform that upstream publishes no binary for (zizmor
on musl Linux), so after a `mise lock` run this test names the entries to
delete (docs/agents/supply-chain.md).
"""

import tomllib
from pathlib import Path
from typing import cast

import pytest

MISE_LOCK = Path(__file__).resolve().parent.parent / "mise.lock"


def platforms_without_checksum(lock_text: str) -> list[str]:
    """Return `<tool>@<version> <platform>` for each platform entry with no checksum."""
    lock = tomllib.loads(lock_text)
    missing: list[str] = []
    for tool, entries in lock.get("tools", {}).items():
        for entry in entries:
            for key, value in entry.items():
                if not key.startswith("platforms."):
                    continue
                table = cast("dict[str, object]", value) if isinstance(value, dict) else {}
                checksum = table.get("checksum")
                if not (isinstance(checksum, str) and checksum.strip()):
                    platform = key.removeprefix("platforms.")
                    missing.append(f"{tool}@{entry.get('version')} {platform}")
    return missing


def test_every_platform_in_mise_lock_has_a_checksum() -> None:
    missing = platforms_without_checksum(MISE_LOCK.read_text(encoding="utf-8"))
    assert missing == [], (
        "mise.lock has platform entries without a checksum, so mise would install "
        "them unverified. Regenerate them with `mise lock`, or delete the entry when "
        "upstream publishes no binary for that platform: " + ", ".join(missing)
    )


def test_the_real_lock_has_platform_entries() -> None:
    # Guards the check above against a format change that hides every entry.
    lock = tomllib.loads(MISE_LOCK.read_text(encoding="utf-8"))
    count = sum(
        1
        for entries in lock["tools"].values()
        for entry in entries
        for key in entry
        if key.startswith("platforms.")
    )
    assert count > 0


GOOD = """
[[tools.zizmor]]
version = "1.30.1"
backend = "aqua:zizmorcore/zizmor"

[tools.zizmor."platforms.linux-x64"]
checksum = "sha256:e65324f4430c2717591937edcec90ccbefaf14c174f8ec9415e03ca875b46e1a"
url = "https://example.invalid/zizmor.tar.gz"
"""


def test_a_lock_with_checksums_passes() -> None:
    assert platforms_without_checksum(GOOD) == []


@pytest.mark.parametrize(
    "platform_body",
    [
        'provenance = "github-attestations"',
        'checksum = ""',
        'checksum = " "',
        "checksum = 1",
    ],
    ids=["no-checksum-key", "empty-checksum", "blank-checksum", "number-checksum"],
)
def test_a_platform_without_a_checksum_fails(platform_body: str) -> None:
    text = GOOD + f'\n[tools.zizmor."platforms.linux-x64-musl"]\n{platform_body}\n'
    assert platforms_without_checksum(text) == ["zizmor@1.30.1 linux-x64-musl"]


def test_the_second_version_of_a_tool_is_checked() -> None:
    text = """
[[tools.python]]
version = "3.14.7"

[tools.python."platforms.linux-x64"]
checksum = "sha256:aa"

[[tools.python]]
version = "3.9.25"

[tools.python."platforms.linux-x64"]
url = "https://example.invalid/python.tar.gz"
"""
    assert platforms_without_checksum(text) == ["python@3.9.25 linux-x64"]
