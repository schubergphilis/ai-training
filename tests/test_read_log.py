"""Tests for the reader of the lesson "Seeing what the agent sends".

The lesson's Predict covers a well-formed sample log (`mise run examples`).
These cover what the page has no checkpoint for: the one-line failures for
a missing, empty or broken log, which never print a request's content, and
a definition marked `defer_loading`, which the counts leave out.
"""

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "site/examples/customizing-agents/seeing-what-the-agent-sends/read_log.py"
)

SECRET = "hunter2-do-not-print"


@pytest.fixture(scope="module")
def read_log() -> ModuleType:
    spec = importlib.util.spec_from_file_location("seeing_read_log", FIXTURE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def failure(read_log: ModuleType, log_dir: Path) -> str:
    with pytest.raises(SystemExit) as stopped:
        read_log.summarize(str(log_dir))
    message = str(stopped.value.code)
    assert message.startswith("read_log: ")
    assert "\n" not in message
    assert SECRET not in message
    return message


def tool(name: str, **extra: object) -> dict[str, object]:
    return {"name": name, "description": "d" * 40, "input_schema": {"type": "object"}, **extra}


def test_a_missing_directory_fails_in_one_line(read_log: ModuleType, tmp_path: Path) -> None:
    assert "is not a directory" in failure(read_log, tmp_path / "missing")


def test_an_empty_directory_names_the_variables(read_log: ModuleType, tmp_path: Path) -> None:
    message = failure(read_log, tmp_path)
    assert "no *.request.json files" in message
    assert "OTEL_LOG_RAW_API_BODIES" in message


def test_a_truncated_request_names_the_file_only(read_log: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "a.request.json").write_text('{"messages": [{"content": "' + SECRET)
    assert "a.request.json is not valid JSON" in failure(read_log, tmp_path)


def test_a_body_that_is_not_an_object_fails(read_log: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "a.request.json").write_text(json.dumps([SECRET]))
    assert "is not a request body" in failure(read_log, tmp_path)


def test_a_tools_field_that_is_not_a_list_fails(read_log: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "a.request.json").write_text(json.dumps({"tools": SECRET}))
    assert "tools field" in failure(read_log, tmp_path)


def test_a_broken_index_line_fails(read_log: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "a.request.json").write_text(json.dumps({"tools": [tool("Read")]}))
    (tmp_path / "index.jsonl").write_text('{"query_source": "' + SECRET + "\n")
    assert "index.jsonl has a line that is not valid JSON" in failure(read_log, tmp_path)


def test_an_empty_body_is_skipped(read_log: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "a.request.json").write_text("{}")
    lines = read_log.summarize(str(tmp_path))
    assert "skipped 1 request(s) without tools" in lines
    assert len([line for line in lines if line.strip().startswith("1 ")]) == 0


def test_deferred_definitions_are_left_out(read_log: ModuleType, tmp_path: Path) -> None:
    body = {
        "system": "s" * 40,
        "tools": [tool("mcp__notes__read_note"), tool("mcp__notes__add_note", defer_loading=True)],
        "messages": [],
    }
    (tmp_path / "a.request.json").write_text(json.dumps(body))
    entry = {"query_source": "repl_main_thread", "request_file": str(tmp_path / "a.request.json")}
    (tmp_path / "index.jsonl").write_text(json.dumps(entry) + "\n")
    lines = read_log.summarize(str(tmp_path))
    assert "mcp__notes: 1 tools" in lines
    assert "left out 1 deferred definition(s)" in lines
    assert lines[2].endswith("repl_main_thread")
