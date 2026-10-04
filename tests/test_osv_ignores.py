"""The maintainer's advisory overrides in osv-scanner.toml expire and name an issue.

`mise run vuln` passes the root `osv-scanner.toml` to osv-scanner with
`--config`. The format is on https://google.github.io/osv-scanner/configuration/:
an `[[IgnoredVulns]]` entry has an `id`, an optional `ignoreUntil` date and
an optional `reason`. This repository makes both optional keys required
(docs/agents/supply-chain.md): the date is at most 30 days ahead, so an
override can't stay forever, and the reason starts with the issue that
tracks the fix. `[[PackageOverrides]]` can ignore a whole package without
a date, so no other table is allowed.
"""

import datetime
import re
import tomllib
from pathlib import Path
from typing import cast

import pytest

OSV_CONFIG = Path(__file__).resolve().parent.parent / "osv-scanner.toml"
MAX_DAYS = 30
REASON = re.compile(r"^#\d+: \S")


def problems(config_text: str, today: datetime.date) -> list[str]:
    """Return one line per rule the config breaks, or an empty list."""
    config = tomllib.loads(config_text)
    found = [
        f"`{key}` is not allowed, only `IgnoredVulns`" for key in config if key != "IgnoredVulns"
    ]
    entries: object = config.get("IgnoredVulns", [])
    if not isinstance(entries, list):
        return [*found, "`IgnoredVulns` must be an array of tables (`[[IgnoredVulns]]`)"]
    for index, item in enumerate(cast("list[object]", entries)):
        name = f"entry {index + 1}"
        if not isinstance(item, dict):
            found.append(f"{name} is not a table")
            continue
        entry = cast("dict[str, object]", item)
        vuln_id: object = entry.get("id")
        if isinstance(vuln_id, str) and vuln_id:
            name = vuln_id
        else:
            found.append(f"{name} has no `id`")
        extra = sorted(set(entry) - {"id", "ignoreUntil", "reason"})
        if extra:
            found.append(
                f"{name} has keys other than id, ignoreUntil and reason: {', '.join(extra)}"
            )
        until: object = entry.get("ignoreUntil")
        if isinstance(until, datetime.datetime):
            until = until.date()
        if not isinstance(until, datetime.date):
            found.append(f"{name} has no `ignoreUntil` date")
        elif until > today + datetime.timedelta(days=MAX_DAYS):
            found.append(
                f"{name} has `ignoreUntil` {until}, more than {MAX_DAYS} days after {today}"
            )
        reason: object = entry.get("reason")
        if not (isinstance(reason, str) and REASON.match(reason)):
            found.append(f"{name} has no `reason` that starts with its issue, as in `#702: ...`")
    return found


TODAY = datetime.date(2026, 10, 4)


def test_a_dated_entry_with_an_issue_passes() -> None:
    text = '[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = 2026-11-03\nreason = "#1: no fix yet"\n'
    assert problems(text, TODAY) == []


def test_an_empty_config_passes() -> None:
    assert problems("", TODAY) == []


def test_an_entry_too_far_ahead_fails() -> None:
    text = '[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = 2026-11-04\nreason = "#1: no fix yet"\n'
    assert problems(text, TODAY) == [
        "GHSA-x has `ignoreUntil` 2026-11-04, more than 30 days after 2026-10-04"
    ]


def test_an_entry_without_a_date_or_an_issue_fails() -> None:
    text = '[[IgnoredVulns]]\nid = "GHSA-x"\nreason = "no fix yet"\n'
    assert problems(text, TODAY) == [
        "GHSA-x has no `ignoreUntil` date",
        "GHSA-x has no `reason` that starts with its issue, as in `#702: ...`",
    ]


def test_a_date_written_as_text_fails() -> None:
    text = (
        '[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = "2026-10-10"\nreason = "#1: no fix yet"\n'
    )
    assert problems(text, TODAY) == ["GHSA-x has no `ignoreUntil` date"]


@pytest.mark.parametrize("table", ["PackageOverrides", "GoVersionOverride"])
def test_any_other_table_fails(table: str) -> None:
    text = f'[[{table}]]\nname = "braces"\nignore = true\n'
    assert problems(text, TODAY) == [f"`{table}` is not allowed, only `IgnoredVulns`"]


def test_the_committed_config_follows_the_rules() -> None:
    if not OSV_CONFIG.exists():
        pytest.skip("no osv-scanner.toml, so no override is active")
    assert problems(OSV_CONFIG.read_text(encoding="utf-8"), datetime.date.today()) == []
