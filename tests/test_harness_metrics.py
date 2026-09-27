"""Tests for scripts/harness_metrics.py, on the fixture transcripts in
tests/fixtures/harness-transcripts/: s1 is a session with a builder
subagent, and s0 is an older transcript without `origin` fields.
"""

import json
import pathlib
from collections.abc import Mapping, Sequence
from typing import cast

import pytest

import harness_metrics

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "harness-transcripts"


def collect(since: str = "") -> dict[str, object]:
    return harness_metrics.collect([("laptop-a", FIXTURES)], since)


def section(data: dict[str, object], key: str) -> dict[str, object]:
    return cast("dict[str, object]", data[key])


def sessions(data: dict[str, object]) -> dict[str, dict[str, object]]:
    rows = cast("list[dict[str, object]]", data["sessions"])
    return {str(row["session"]): row for row in rows}


def test_discover_finds_main_sessions_and_subagents_with_their_roles() -> None:
    found = harness_metrics.discover("laptop-a", FIXTURES)
    assert [(t.session, t.role, t.subagent) for t in found] == [
        ("s0", "main", False),
        ("s1", "main", False),
        ("s0", "subagent", True),
        ("s1", "builder", True),
    ]


def test_usage_counts_once_per_message_id() -> None:
    data = collect("2026-09-24")
    s1 = sessions(data)["s1"]
    # m1 is two lines with the same id and usage, so it counts once: three
    # messages of 1112 tokens each, and the synthetic one has none.
    assert s1["main_tokens"] == 3 * 1112
    assert s1["sub_tokens"] == 556
    assert section(data, "totals")["total"] == 3 * 1112 + 556


def test_since_drops_older_records_and_sessions() -> None:
    data = collect("2026-09-24")
    assert set(sessions(data)) == {"s1"}
    assert list(section(data, "by_day")) == ["2026-09-24", "2026-09-25"]
    everything = collect()
    assert set(sessions(everything)) == {"s0", "s1"}


def test_tokens_by_model_role_and_day() -> None:
    data = collect("2026-09-24")
    by_model = cast("dict[str, dict[str, int]]", data["by_model"])
    assert by_model["claude-opus-5-5"]["turns"] == 3
    assert by_model["claude-fable-5-1"]["total"] == 1112
    assert "<synthetic>" not in by_model
    by_role = cast("dict[str, dict[str, int]]", data["by_role"])
    assert by_role["main"]["transcripts"] == 1
    assert by_role["main"]["turns"] == 4
    assert by_role["builder"] == {
        "transcripts": 1,
        "turns": 1,
        "input": 1,
        "output": 50,
        "cache_write": 5,
        "cache_read": 500,
        "peak_context": 506,
        "total": 556,
    }
    by_day = cast("dict[str, dict[str, int]]", data["by_day"])
    assert by_day["2026-09-24"]["subagents"] == 1
    assert by_day["2026-09-24"]["human"] == 2


def test_tools_bash_commands_sleep_and_chimes() -> None:
    data = collect("2026-09-24")
    assert data["tools"] == {"Bash": 4, "Read": 2}
    assert data["bash_top"] == {"git status": 1, "gh pr": 1, "afplay": 1, "mise run": 1}
    assert data["sleep"] == {"calls": 2, "total_hours": round(150 / 3600, 2), "max_seconds": 120.0}
    assert data["chimes"] == 1
    assert data["most_read"] == {"/repo/AGENTS.md": 2}


def test_human_messages_interruptions_and_waits() -> None:
    human = section(collect("2026-09-24"), "human")
    # The task notification is not human. The wait before "merge it" is the
    # ten minutes since the last assistant message.
    assert human["messages"] == 2
    assert human["interruptions"] == 1
    assert human["waits"] == 1
    assert human["wait_median_minutes"] == 10.0


def test_old_transcripts_without_origin_count_typed_text_only() -> None:
    s0 = sessions(collect())["s0"]
    assert s0["human"] == 1
    assert s0["subagents"] == 1


def test_largest_tool_results_name_the_tool_and_file() -> None:
    largest = cast("list[dict[str, object]]", collect("2026-09-24")["largest_results"])
    assert [(r["chars"], r["tool"], r["label"]) for r in largest] == [
        (2000, "Read", "/repo/AGENTS.md"),
        (500, "Bash", "git status && sleep 30"),
        (6, "Bash", "AI_TRAINING_ROLE=wave-lead gh pr merge 12 --rebase; sleep 2m"),
        (2, "Bash", "mise run fast"),
    ]


@pytest.mark.parametrize(
    ("command", "key"),
    [
        ("git -C x status", "git"),
        ("git push --force-with-lease", "git push"),
        ("FOO=1 BAR=2 mise run ci", "mise run"),
        ("/usr/bin/python3 -c 'x'", "python3"),
        ("ls -la | head", "ls"),
        ("   ", "(empty)"),
        # Item 3: leading `cd` segments are skipped.
        ("cd site && bunx vitest", "bunx vitest"),
        ("cd /repo && cd site && git push", "git push"),
        ("cd /repo; FOO=1 mise run fast 2>&1 | tail -5", "mise run"),
        ("cd /repo", "cd"),
        # Item 4: a segment that only sets variables is skipped.
        ("VAR=1; git status", "git status"),
        ("X=$(git rev-parse HEAD); cd /repo && gh pr view", "gh pr"),
        ("A=1 B=`pwd`;", "(empty)"),
    ],
)
def test_bash_key(command: str, key: str) -> None:
    assert harness_metrics.bash_key(command) == key


def test_sleep_seconds_reads_units_and_ignores_other_words() -> None:
    assert harness_metrics.sleep_seconds("sleep 5; sleep 1.5m && (sleep 1h)") == [5, 90, 3600]
    assert harness_metrics.sleep_seconds("echo nosleep 5; sleepy 3; sleep $n") == []


HEREDOC_COMMAND = """cat > wait.sh <<'EOF'
sleep 60
afplay /System/Library/Sounds/Glass.aiff
EOF
cat <<-END >> notes
\tsleep 7
\tEND
git commit -m "wait; sleep 9 && afplay x" && echo afplay sleep 4
mise run fast 2>&1 | tail -3; sleep 5"""


def test_sleep_and_afplay_only_at_command_position() -> None:
    # Item 7: heredoc bodies, quoted strings and arguments don't count.
    assert harness_metrics.sleep_seconds(HEREDOC_COMMAND) == [5]
    assert not harness_metrics.runs_afplay(HEREDOC_COMMAND)
    assert harness_metrics.runs_afplay("cd /x && /usr/bin/afplay Glass.aiff")
    assert harness_metrics.sleep_seconds("cat <<< 'sleep 3'; sleep 2") == [2]


def test_segments_split_at_operators_outside_quotes() -> None:
    assert harness_metrics.segments("a 'b; c' && d \\\n e | f 2>&1 &> g; (h)") == [
        ["a", "'b; c'"],
        ["d", "e"],
        ["f", "2>&1", "&>", "g"],
        ["h"],
    ]
    assert harness_metrics.segments('echo "x \\" y"; z') == [["echo", '"x \\" y"'], ["z"]]


def write_jsonl(path: pathlib.Path, rows: Sequence[Mapping[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def write_meta(path: pathlib.Path, agent_type: str) -> None:
    path.with_suffix(".meta.json").write_text(json.dumps({"agentType": agent_type}))


def assistant(
    stamp: str,
    message_id: str,
    uuid: str = "",
    model: str = "claude-opus-5-5",
    content: list[dict[str, object]] | None = None,
    **usage: int,
) -> dict[str, object]:
    record: dict[str, object] = {
        "type": "assistant",
        "timestamp": f"2026-09-26T{stamp}.000Z",
        "message": {
            "id": message_id,
            "model": model,
            "content": content or [{"type": "text", "text": "ok"}],
            "usage": usage,
        },
    }
    if uuid:
        record["uuid"] = uuid
    return record


def human(stamp: str, text: str, uuid: str = "") -> dict[str, object]:
    record: dict[str, object] = {
        "type": "user",
        "timestamp": f"2026-09-26T{stamp}.000Z",
        "message": {"role": "user", "content": text},
        "origin": {"kind": "human"},
    }
    if uuid:
        record["uuid"] = uuid
    return record


def bash_call(call_id: str, command: str) -> list[dict[str, object]]:
    return [{"type": "tool_use", "id": call_id, "name": "Bash", "input": {"command": command}}]


def test_streamed_usage_takes_the_maximum_of_each_field(tmp_path: pathlib.Path) -> None:
    # Item 1: the lines of m1 carry partial usage, and the largest output
    # isn't on the last line. Each field counts at its maximum.
    write_jsonl(
        tmp_path / "s.jsonl",
        [
            human("10:00:00", "go"),
            assistant(
                "10:00:01", "m1", input_tokens=3, output_tokens=2, cache_read_input_tokens=90
            ),
            assistant("10:00:02", "m1", input_tokens=3, output_tokens=150),
            assistant(
                "10:00:03", "m1", input_tokens=3, output_tokens=120, cache_read_input_tokens=100
            ),
        ],
    )
    data = harness_metrics.collect([("a", tmp_path)])
    totals = section(data, "totals")
    assert (totals["input"], totals["output"], totals["cache_read"]) == (3, 150, 100)
    by_model = cast("dict[str, dict[str, int]]", data["by_model"])
    assert by_model["claude-opus-5-5"]["turns"] == 1
    assert by_model["claude-opus-5-5"]["output"] == 150
    assert cast("dict[str, dict[str, int]]", data["by_day"])["2026-09-26"]["output"] == 150
    assert sessions(data)["s"]["output"] == 150


def test_continued_session_counts_repeated_records_once(tmp_path: pathlib.Path) -> None:
    # Item 2: session b continues session a and repeats its records, with
    # the same uuids and message ids, in its main transcript and subagent.
    first = [
        human("10:00:00", "start", uuid="u1"),
        assistant(
            "10:00:01", "m1", uuid="u2", content=bash_call("t1", "git status"), output_tokens=100
        ),
    ]
    subagent = [assistant("10:00:02", "m2", uuid="u3", output_tokens=40)]
    continued = {"type": "continued-in", "timestamp": "2026-09-26T10:00:03.000Z"}
    write_jsonl(tmp_path / "a.jsonl", [*first, continued])
    write_jsonl(tmp_path / "a" / "subagents" / "agent-1.jsonl", subagent)
    write_meta(tmp_path / "a" / "subagents" / "agent-1.jsonl", "builder")
    write_jsonl(
        tmp_path / "b.jsonl",
        [
            *first,
            human("11:00:00", "next", uuid="u4"),
            assistant("11:00:01", "m3", uuid="u5", output_tokens=7),
        ],
    )
    write_jsonl(tmp_path / "b" / "subagents" / "agent-2.jsonl", subagent)
    write_meta(tmp_path / "b" / "subagents" / "agent-2.jsonl", "builder")
    data = harness_metrics.collect([("a", tmp_path)])
    assert section(data, "totals")["output"] == 147
    assert section(data, "human")["messages"] == 2
    assert data["tools"] == {"Bash": 1}
    rows = sessions(data)
    assert (rows["a"]["output"], rows["a"]["subagents"], rows["a"]["human"]) == (140, 1, 1)
    assert (rows["b"]["output"], rows["b"]["subagents"], rows["b"]["human"]) == (7, 0, 1)
    by_role = cast("dict[str, dict[str, int]]", data["by_role"])
    assert (by_role["builder"]["transcripts"], by_role["builder"]["turns"]) == (1, 1)
    # The wait before "next" is measured from the repeated assistant record
    # at 10:00:01, and "start" has no assistant message before it.
    assert (section(data, "human")["waits"], section(data, "human")["wait_median_minutes"]) == (
        1,
        60.0,
    )


def test_message_ids_repeat_across_transcripts_without_uuids(tmp_path: pathlib.Path) -> None:
    write_jsonl(tmp_path / "a.jsonl", [assistant("10:00:00", "m1", output_tokens=5)])
    write_jsonl(tmp_path / "b.jsonl", [assistant("10:00:00", "m1", output_tokens=5)])
    assert section(harness_metrics.collect([("a", tmp_path)]), "totals")["output"] == 5


def test_no_rows_for_sessions_and_roles_outside_the_window(tmp_path: pathlib.Path) -> None:
    # Item 5: session old and its reviewer are all before --since.
    old = [
        {"type": "ai-title", "aiTitle": "Old"},
        {**human("10:00:00", "old"), "timestamp": "2026-09-20T10:00:00.000Z"},
    ]
    write_jsonl(tmp_path / "old.jsonl", old)
    write_jsonl(
        tmp_path / "old" / "subagents" / "agent-1.jsonl",
        [{**assistant("10:00:00", "m0", output_tokens=9), "timestamp": "2026-09-20T10:00:01.000Z"}],
    )
    write_meta(tmp_path / "old" / "subagents" / "agent-1.jsonl", "reviewer")
    write_jsonl(tmp_path / "new.jsonl", [assistant("10:00:00", "m1", output_tokens=5)])
    data = harness_metrics.collect([("a", tmp_path)], "2026-09-25")
    assert set(sessions(data)) == {"new"}
    assert set(cast("dict[str, object]", data["by_role"])) == {"main"}
    assert set(cast("dict[str, object]", data["by_role_model"])) == {"main"}
    assert list(section(data, "by_day")) == ["2026-09-26"]


def test_model_by_role_and_peak_context(tmp_path: pathlib.Path) -> None:
    # Item 6: main runs on two models, the builder on one.
    write_jsonl(
        tmp_path / "s.jsonl",
        [
            assistant(
                "10:00:00", "m1", input_tokens=10, cache_read_input_tokens=1000, output_tokens=1
            ),
            assistant("10:00:01", "m2", model="claude-fable-5-1", cache_creation_input_tokens=3000),
            assistant("10:00:02", "m3", model="<synthetic>"),
        ],
    )
    builder = tmp_path / "s" / "subagents" / "agent-1.jsonl"
    write_jsonl(
        builder,
        [
            assistant(
                "10:01:00", "m4", input_tokens=5, cache_read_input_tokens=200, output_tokens=2
            ),
            assistant(
                "10:01:01", "m5", input_tokens=5, cache_read_input_tokens=400, output_tokens=2
            ),
        ],
    )
    write_meta(builder, "builder")
    data = harness_metrics.collect([("a", tmp_path)])
    by_role_model = cast("dict[str, dict[str, dict[str, int]]]", data["by_role_model"])
    assert {r: sorted(models) for r, models in by_role_model.items()} == {
        "builder": ["claude-opus-5-5"],
        "main": ["claude-fable-5-1", "claude-opus-5-5"],
    }
    assert by_role_model["builder"]["claude-opus-5-5"]["turns"] == 2
    assert by_role_model["main"]["claude-fable-5-1"]["total"] == 3000
    by_role = cast("dict[str, dict[str, int]]", data["by_role"])
    assert by_role["main"]["peak_context"] == 3000
    assert by_role["builder"]["peak_context"] == 405
    text = harness_metrics.markdown(data)
    assert "## Model by role" in text
    assert "| builder | claude-opus-5-5 | 2 | 0.0M | 0.0M |" in text
    assert "| builder | 1 | 2 | 0.0M | 0.0M | 0.0M | 405 |" in text


def test_heredoc_sleep_and_chime_are_not_counted(tmp_path: pathlib.Path) -> None:
    # Item 7 through the whole report.
    write_jsonl(
        tmp_path / "s.jsonl",
        [assistant("10:00:00", "m1", content=bash_call("t1", HEREDOC_COMMAND))],
    )
    data = harness_metrics.collect([("a", tmp_path)])
    assert section(data, "sleep")["calls"] == 1
    assert data["chimes"] == 0
    assert data["bash_top"] == {"cat": 1}


def test_read_config_labels_and_comments(tmp_path: pathlib.Path) -> None:
    text = f"# this machine\nmain={tmp_path}\n\n{tmp_path}/b  # synced\n"
    assert harness_metrics.read_config(text) == [
        ("main", tmp_path),
        ("source-2", tmp_path / "b"),
    ]
    assert harness_metrics.parse_source("~/x", 1)[1] == pathlib.Path("~/x").expanduser()
    assert harness_metrics.parse_source("/a=b/c", 3) == ("source-3", pathlib.Path("/a=b/c"))


def test_tool_label() -> None:
    assert harness_metrics.tool_label("Grep", {"pattern": "foo"}) == "foo"
    assert harness_metrics.tool_label("Agent", {"description": "Build #12"}) == "Build #12"
    assert harness_metrics.tool_label("Bash", {}) == ""


def test_markdown_prints_every_table() -> None:
    text = harness_metrics.markdown(collect("2026-09-24"))
    for heading in (
        "## Totals",
        "## Sessions",
        "## By day (UTC)",
        "## By model",
        "## By role",
        "## Tool calls",
        "## Top Bash commands",
        "## Most-read files",
        "## Largest tool results",
    ):
        assert heading in text
    assert "| laptop-a | s1 | 2026-09-24T10:00 |" in text
    assert "sleep 2 calls" in text


def test_main_writes_json_and_prints_markdown(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = tmp_path / "dirs"
    config.write_text(f"laptop-a={FIXTURES}\n", encoding="utf-8")
    out = tmp_path / "metrics.json"
    code = harness_metrics.main(
        ["--config", str(config), "--since", "2026-09-24", "--json", str(out)]
    )
    assert code == 0
    assert "## Totals" in capsys.readouterr().out
    data = cast("dict[str, object]", json.loads(out.read_text(encoding="utf-8")))
    assert data["since"] == "2026-09-24"
    assert data["sources"] == [{"label": "laptop-a", "path": str(FIXTURES)}]


@pytest.mark.parametrize(
    ("argv", "message"),
    [
        ([], "name a transcript directory or --config"),
        (["--config", "/nonexistent/dirs"], "no config at"),
        (["/nonexistent/dir"], "not a directory"),
        ([str(FIXTURES), "--since", "24-09-2026"], "--since needs YYYY-MM-DD"),
    ],
)
def test_main_rejects_bad_input(
    argv: list[str], message: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert harness_metrics.main(argv) == 2
    assert message in capsys.readouterr().err
