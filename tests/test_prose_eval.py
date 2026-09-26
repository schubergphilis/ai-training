"""Tests for scripts/prose_eval.py, on fixture JSON rather than a Vale run."""

import collections
import importlib
import json
import pathlib
from collections.abc import Sequence

import pytest

import prose_eval

# The tests run from any cwd, so the real config is found from this file.
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

HITS: prose_eval.Hits = {
    "docs/spec/S01-dictionary.md": [
        {"Check": "ai-tells.Delve", "Message": "Avoid 'delve'.", "Line": 3},
        {"Check": "write-good.Passive", "Message": "'is written' may be passive.", "Line": 9},
    ],
    "README.md": [
        {"Check": "ai-tells.Delve", "Message": "Avoid 'delve'.", "Line": 1},
    ],
}


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("site/src/content/docs/basics/what-is-ai.mdx", "lessons"),
        ("docs/spec/S01-dictionary.md", "spec"),
        ("docs/agents/writing-a-lesson.md", "agent-docs"),
        ("docs/prose/README.md", "agent-docs"),
        (".claude/skills/ai-tutor/SKILL.md", "agent-docs"),
        ("site/src/data/topics.yaml", "data"),
        ("README.md", "repo-docs"),
    ],
)
def test_area(path: str, expected: str) -> None:
    assert prose_eval.area(path) == expected


def test_parse_hits_empty_output_is_no_hits() -> None:
    assert prose_eval.parse_hits("") == {}
    assert prose_eval.parse_hits("  \n") == {}


def test_parse_hits_reads_vale_json() -> None:
    assert prose_eval.parse_hits(json.dumps(HITS)) == HITS


def test_hits_per_rule_counts_across_files() -> None:
    assert prose_eval.hits_per_rule(HITS) == collections.Counter(
        {"ai-tells.Delve": 2, "write-good.Passive": 1}
    )


def test_word_count(tmp_path: pathlib.Path) -> None:
    doc = tmp_path / "a.md"
    doc.write_text("one two\n\nthree  four\n")
    assert prose_eval.word_count(str(doc)) == 4


def test_words_per_area_totals_and_rows() -> None:
    files = ["README.md", "docs/spec/S01-dictionary.md", "docs/spec/S02-sources.md"]
    totals, rows = prose_eval.words_per_area(files, count=lambda path: len(path))
    assert totals == collections.Counter({"repo-docs": 9, "spec": 27 + 24})
    assert rows == [
        ("repo-docs", "README.md", 9),
        ("spec", "docs/spec/S01-dictionary.md", 27),
        ("spec", "docs/spec/S02-sources.md", 24),
    ]


def test_write_wordcount(tmp_path: pathlib.Path) -> None:
    prose_eval.write_wordcount(tmp_path, [("spec", "docs/spec/a.md", 12)])
    assert (
        tmp_path / "wordcount.tsv"
    ).read_text() == "area\tfile\twords\nspec\tdocs/spec/a.md\t12\n"


def test_summary_lists_rules_most_common_first() -> None:
    totals = collections.Counter({"spec": 100, "repo-docs": 50})
    text = prose_eval.summary(HITS, totals)
    assert text.splitlines() == [
        "3 hits in 2 files; 150 words",
        "      2  ai-tells.Delve",
        "      1  write-good.Passive",
        "words per area: {'spec': 100, 'repo-docs': 50}",
    ]


def test_main_without_package_exits_with_usage() -> None:
    with pytest.raises(SystemExit) as exc:
        prose_eval.main(["prose_eval.py"])
    assert "Usage" in str(exc.value)


def test_main_writes_report(
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    doc = tmp_path / "README.md"
    doc.write_text("five words are in here\n")

    def fake_vale(files: Sequence[str]) -> prose_eval.Hits:
        return HITS

    def synced(ini: pathlib.Path, styles: pathlib.Path) -> None:
        pass

    monkeypatch.setattr(prose_eval, "check_packages_synced", synced)
    monkeypatch.setattr(prose_eval, "tracked_files", lambda: [str(doc)])
    monkeypatch.setattr(prose_eval, "run_vale", fake_vale)

    out_dir = tmp_path / "out"
    prose_eval.main(["prose_eval.py", "ai-tells", str(out_dir)])

    assert json.loads((out_dir / "ai-tells.json").read_text()) == HITS
    assert (out_dir / "wordcount.tsv").read_text().splitlines()[1] == f"repo-docs\t{doc}\t5"
    assert capsys.readouterr().out.startswith("3 hits in 2 files; 5 words\n")


# One line, no comments: the ini forms (comments, continuation lines, a
# repeated key) are vale_configs.parse_ini's and tested in test_vale_configs.py.
EVAL_INI_TEXT = (
    "StylesPath = .vale/styles\n"
    "Packages = https://github.com/errata-ai/write-good/releases/download/v0.4.1/write-good.zip, "
    "https://github.com/tbhb/vale-ai-tells/releases/download/v1.37.0/ai-tells.zip\n"
)


def write_ini(tmp_path: pathlib.Path, text: str = EVAL_INI_TEXT) -> pathlib.Path:
    ini = tmp_path / ".vale-eval.ini"
    ini.write_text(text)
    return ini


def test_pinned_packages_reads_the_names(tmp_path: pathlib.Path) -> None:
    assert prose_eval.pinned_packages(write_ini(tmp_path)) == ["write-good", "ai-tells"]


def test_pinned_packages_reads_the_real_eval_ini() -> None:
    names = prose_eval.pinned_packages(REPO_ROOT / ".vale-eval.ini")
    assert "write-good" in names
    assert "ai-tells" in names


def test_missing_packages_names_only_the_unsynced(tmp_path: pathlib.Path) -> None:
    styles = tmp_path / "styles"
    (styles / "write-good").mkdir(parents=True)
    assert prose_eval.missing_packages(["write-good", "ai-tells"], styles) == ["ai-tells"]


def test_check_packages_synced_passes_when_all_present(tmp_path: pathlib.Path) -> None:
    ini = write_ini(tmp_path)
    styles = tmp_path / "styles"
    for name in ("write-good", "ai-tells"):
        (styles / name).mkdir(parents=True)
    prose_eval.check_packages_synced(ini, styles)


def test_check_packages_synced_exits_naming_the_sync_command(tmp_path: pathlib.Path) -> None:
    ini = write_ini(tmp_path)
    styles = tmp_path / "styles"
    styles.mkdir()
    with pytest.raises(SystemExit) as exc:
        prose_eval.check_packages_synced(ini, styles)
    message = str(exc.value)
    assert "write-good, ai-tells" in message
    assert "mise run prose-eval-sync" in message


def test_check_packages_synced_names_setup_for_the_main_configs(
    tmp_path: pathlib.Path,
) -> None:
    styles = tmp_path / "styles"
    styles.mkdir()
    for name in (".vale.ini", ".vale-extended.ini"):
        ini = tmp_path / name
        ini.write_text(EVAL_INI_TEXT)
        with pytest.raises(SystemExit) as exc:
            prose_eval.check_packages_synced(ini, styles)
        assert "mise run setup" in str(exc.value)
        assert "prose-eval-sync" not in str(exc.value)


def test_pinned_packages_rejects_a_bare_package_name(tmp_path: pathlib.Path) -> None:
    ini = write_ini(tmp_path, "StylesPath = .vale/styles\nPackages = Google\n")
    with pytest.raises(prose_eval.UnsupportedPackageError, match=r"^Google$"):
        prose_eval.pinned_packages(ini)


def test_check_packages_synced_exits_on_a_mixed_list(tmp_path: pathlib.Path) -> None:
    ini = write_ini(
        tmp_path,
        "Packages = Google, https://github.com/errata-ai/write-good/releases/download/v0.4.1/write-good.zip\n",
    )
    styles = tmp_path / "styles"
    (styles / "write-good").mkdir(parents=True)
    with pytest.raises(SystemExit) as exc:
        prose_eval.check_packages_synced(ini, styles)
    message = str(exc.value)
    assert "entry 'Google'" in message
    assert "bare package name is not supported" in message


def test_package_entries_splits_the_top_level_value(tmp_path: pathlib.Path) -> None:
    assert prose_eval.package_entries(write_ini(tmp_path)) == [
        "https://github.com/errata-ai/write-good/releases/download/v0.4.1/write-good.zip",
        "https://github.com/tbhb/vale-ai-tells/releases/download/v1.37.0/ai-tells.zip",
    ]


def test_package_entries_ignores_packages_under_a_section(tmp_path: pathlib.Path) -> None:
    ini = write_ini(
        tmp_path, "StylesPath = .vale/styles\n[*.md]\nPackages = https://e.test/a.zip\n"
    )
    assert prose_eval.package_entries(ini) == []


def test_check_packages_synced_exits_on_a_parse_error(tmp_path: pathlib.Path) -> None:
    ini = write_ini(tmp_path, EVAL_INI_TEXT + "nonsense\n")
    with pytest.raises(SystemExit) as exc:
        prose_eval.check_packages_synced(ini, tmp_path)
    message = str(exc.value)
    assert message.startswith(f"prose: {ini}: line is not a comment")
    assert "'nonsense'" in message


def test_check_packages_synced_exits_on_empty_package_list(tmp_path: pathlib.Path) -> None:
    ini = write_ini(tmp_path, "StylesPath = .vale/styles\n")
    with pytest.raises(SystemExit) as exc:
        prose_eval.check_packages_synced(ini, tmp_path)
    assert "no .zip packages" in str(exc.value)
    assert "bare package name is not supported" in str(exc.value)


def test_pinned_packages_reads_the_real_main_configs() -> None:
    for name in (".vale.ini", ".vale-extended.ini"):
        assert "write-good" in prose_eval.pinned_packages(REPO_ROOT / name)


def test_main_check_packages_runs_every_named_config(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    styles = tmp_path / "styles"
    for name in ("write-good", "ai-tells"):
        (styles / name).mkdir(parents=True)
    monkeypatch.setattr(prose_eval, "STYLES", styles)
    good = write_ini(tmp_path)
    bad = tmp_path / ".vale.ini"
    bad.write_text("Packages = https://example.com/missing.zip\n")
    prose_eval.main(["prose_eval.py", "--check-packages", str(good)])
    with pytest.raises(SystemExit) as exc:
        prose_eval.main(["prose_eval.py", "--check-packages", str(good), str(bad)])
    assert "missing" in str(exc.value)
    assert "mise run setup" in str(exc.value)


def test_main_check_packages_without_a_config_exits_with_usage() -> None:
    with pytest.raises(SystemExit) as exc:
        prose_eval.main(["prose_eval.py", "--check-packages"])
    assert "Usage" in str(exc.value)


def test_main_stops_before_writing_when_not_synced(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(prose_eval, "EVAL_INI", write_ini(tmp_path))
    monkeypatch.setattr(prose_eval, "STYLES", tmp_path / "styles")
    out_dir = tmp_path / "out"
    with pytest.raises(SystemExit):
        prose_eval.main(["prose_eval.py", "ai-tells", str(out_dir)])
    assert not out_dir.exists()


def test_styles_path_is_resolved_from_the_repository_root(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Reload with another working directory, so a cwd-relative STYLES would differ.
    monkeypatch.chdir(tmp_path)
    try:
        styles = importlib.reload(prose_eval).STYLES
    finally:
        monkeypatch.undo()
        importlib.reload(prose_eval)
    assert styles == REPO_ROOT / ".vale" / "styles"


def synced_styles(tmp_path: pathlib.Path) -> pathlib.Path:
    styles = tmp_path / "styles"
    for name in ("write-good", "ai-tells"):
        (styles / name).mkdir(parents=True)
    return styles


def test_check_packages_synced_exits_when_the_vale_config_dir_exists(
    tmp_path: pathlib.Path,
) -> None:
    # Issue #450: every package directory is still there, so only the
    # .vale-config check catches the redirected sync.
    ini = write_ini(tmp_path)
    styles = synced_styles(tmp_path)
    (styles / ".vale-config" / "styles").mkdir(parents=True)
    with pytest.raises(SystemExit) as exc:
        prose_eval.check_packages_synced(ini, styles)
    message = str(exc.value)
    assert f"{styles / '.vale-config'}/ exists" in message
    assert "scripts/prose_eval.py --clear-config-dir" in message
    assert "mise run prose-sync" in message


def test_main_check_packages_exits_when_the_vale_config_dir_exists(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    styles = synced_styles(tmp_path)
    (styles / ".vale-config").mkdir()
    monkeypatch.setattr(prose_eval, "STYLES", styles)
    with pytest.raises(SystemExit) as exc:
        prose_eval.main(["prose_eval.py", "--check-packages", str(write_ini(tmp_path))])
    assert "--clear-config-dir" in str(exc.value)


def test_clear_config_dir_removes_only_that_directory(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    styles = synced_styles(tmp_path)
    config_dir = styles / ".vale-config"
    (config_dir / "styles" / "Google").mkdir(parents=True)
    (config_dir / "5-Harper.ini").write_text("StylesPath = styles\n")
    prose_eval.clear_config_dir(config_dir)
    assert not config_dir.exists()
    assert sorted(p.name for p in styles.iterdir()) == ["ai-tells", "write-good"]
    assert "removed" in capsys.readouterr().out
    prose_eval.check_packages_synced(write_ini(tmp_path), styles)


def test_clear_config_dir_without_the_directory_is_a_no_op(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    styles = synced_styles(tmp_path)
    prose_eval.clear_config_dir(styles / ".vale-config")
    assert "nothing to remove" in capsys.readouterr().out
    assert sorted(p.name for p in styles.iterdir()) == ["ai-tells", "write-good"]


def test_clear_config_dir_refuses_another_name(tmp_path: pathlib.Path) -> None:
    styles = synced_styles(tmp_path)
    with pytest.raises(SystemExit, match="refusing to remove"):
        prose_eval.clear_config_dir(styles / "write-good")
    assert (styles / "write-good").is_dir()


def test_clear_config_dir_does_not_follow_a_symlink(tmp_path: pathlib.Path) -> None:
    styles = synced_styles(tmp_path)
    target = tmp_path / "elsewhere"
    target.mkdir()
    (target / "keep.txt").write_text("keep\n")
    (styles / ".vale-config").symlink_to(target, target_is_directory=True)
    with pytest.raises(SystemExit, match="not a plain directory"):
        prose_eval.clear_config_dir(styles / ".vale-config")
    assert (target / "keep.txt").exists()
    with pytest.raises(SystemExit, match="exists"):
        prose_eval.check_no_config_dir(styles)


def test_main_clear_config_dir_targets_the_styles_path(monkeypatch: pytest.MonkeyPatch) -> None:
    removed: list[pathlib.Path] = []
    monkeypatch.setattr(prose_eval, "clear_config_dir", removed.append)
    prose_eval.main(["prose_eval.py", "--clear-config-dir"])
    assert removed == [prose_eval.STYLES / ".vale-config"]
    assert prose_eval.CONFIG_DIR == REPO_ROOT / ".vale" / "styles" / ".vale-config"
