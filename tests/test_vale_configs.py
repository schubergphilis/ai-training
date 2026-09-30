"""Tests for scripts/vale_configs.py, on inline ini text and on the real configs."""

import pathlib

import pytest

import vale_configs

# The tests run from any cwd, so the real configs are found from this file.
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

BASE = """
StylesPath = .vale/styles
# A comment
; another comment
Packages = https://example.test/a.zip, \\
  https://example.test/b.zip

[*.{md,mdx}]
BasedOnStyles = Vale, House
Vale.Spelling = NO
TokenIgnores = (\\(@[^)]+\\))
write-good.Illusions = error

[*.{yaml,yml}]
BasedOnStyles = Vale
TokenIgnores = (https?://\\S+)
"""

EXTENDED = BASE + "\n[*.{md,mdx}]\nwrite-good.Passive = YES\n"


def test_parse_ini_reads_sections_comments_and_continuations() -> None:
    config = vale_configs.parse_ini(BASE)
    assert config[""] == {
        "StylesPath": ".vale/styles",
        "Packages": "https://example.test/a.zip, https://example.test/b.zip",
    }
    assert config["[*.{md,mdx}]"]["TokenIgnores"] == "(\\(@[^)]+\\))"
    assert config["[*.{yaml,yml}]"] == {"BasedOnStyles": "Vale", "TokenIgnores": "(https?://\\S+)"}


def test_parse_ini_keeps_a_comment_line_inside_a_continued_value() -> None:
    text = "Packages = a.zip, \\\n; b.zip, \\\n  c.zip\nVocab = v\n"
    assert vale_configs.parse_ini(text)[""] == {"Packages": "a.zip, ; b.zip, c.zip", "Vocab": "v"}


def test_parse_ini_rejects_a_repeated_key_in_one_section() -> None:
    with pytest.raises(ValueError, match=r"key k is set twice in section \[s\]"):
        vale_configs.parse_ini("[s]\nk = one\nk = two\n")
    with pytest.raises(ValueError, match="twice in section the top-level settings"):
        vale_configs.parse_ini("Vocab = a\nVocab = b\n")


def test_check_reports_a_repeated_key_with_the_file_name(tmp_path: pathlib.Path) -> None:
    base = tmp_path / "base.ini"
    base.write_text("[s]\nTokenIgnores = a\nTokenIgnores = b\n", encoding="utf-8")
    ext = tmp_path / "ext.ini"
    ext.write_text("[s]\nTokenIgnores = a\n", encoding="utf-8")
    assert vale_configs.check(base, ext) == [
        f"{base}: key TokenIgnores is set twice in section [s]"
    ]
    assert vale_configs.check(ext, base) == [
        f"{base}: key TokenIgnores is set twice in section [s]"
    ]


def test_parse_ini_rejects_a_bare_word() -> None:
    with pytest.raises(ValueError, match="key = value"):
        vale_configs.parse_ini("[s]\nnonsense\n")


EXTENDED_ONLY = {"[*.{md,mdx}]": {"write-good.Passive": "passive voice is a judgement call"}}


def _compare(base: str, extended: str) -> list[str]:
    return vale_configs.compare(
        vale_configs.parse_ini(base),
        vale_configs.parse_ini(extended),
        "base.ini",
        "ext.ini",
        EXTENDED_ONLY,
    )


def test_compare_accepts_the_extended_only_rules() -> None:
    assert _compare(BASE, EXTENDED) == []


def test_compare_names_file_section_and_key_when_extended_drops_a_line() -> None:
    dropped = EXTENDED.replace("TokenIgnores = (https?://\\S+)\n", "")
    problems = _compare(BASE, dropped)
    assert problems == ["ext.ini: [*.{yaml,yml}]: key TokenIgnores is in base.ini but missing here"]


def test_compare_names_file_section_and_key_when_base_drops_a_line() -> None:
    dropped = BASE.replace("TokenIgnores = (\\(@[^)]+\\))\n", "")
    problems = _compare(dropped, EXTENDED)
    assert len(problems) == 1
    assert problems[0].startswith(
        "base.ini: [*.{md,mdx}]: key TokenIgnores is in ext.ini but missing here"
    )


def test_compare_reports_a_different_value() -> None:
    changed = EXTENDED.replace("Vale.Spelling = NO", "Vale.Spelling = YES")
    assert _compare(BASE, changed) == [
        "ext.ini: [*.{md,mdx}]: key Vale.Spelling is 'YES' here and 'NO' in base.ini"
    ]


def test_compare_reports_a_top_level_difference_and_a_missing_section() -> None:
    changed = EXTENDED.replace("StylesPath = .vale/styles", "StylesPath = styles").replace(
        "[*.{yaml,yml}]", "[*.txt]"
    )
    problems = _compare(BASE, changed)
    assert (
        "ext.ini: the top-level settings: key StylesPath is 'styles' here "
        "and '.vale/styles' in base.ini" in problems
    )
    assert "ext.ini: section [*.{yaml,yml}] is in base.ini but missing here" in problems
    assert "base.ini: section [*.txt] is in ext.ini but missing here" in problems


def test_compare_reports_a_stale_or_misplaced_extended_only_entry() -> None:
    without_passive = EXTENDED.replace("write-good.Passive = YES\n", "")
    assert _compare(BASE, without_passive) == [
        "ext.ini: [*.{md,mdx}]: EXTENDED_ONLY lists write-good.Passive as extended-only "
        "but the file does not set it"
    ]
    in_both = BASE + "\n[*.{md,mdx}]\nwrite-good.Passive = YES\n"
    assert _compare(in_both, EXTENDED) == [
        "base.ini: [*.{md,mdx}]: EXTENDED_ONLY lists write-good.Passive as extended-only "
        "but the file sets it too"
    ]


@pytest.mark.parametrize("name", [".vale.ini", ".vale-extended.ini", ".vale-eval.ini"])
def test_parse_ini_reads_every_real_config(name: str) -> None:
    # scripts/prose_eval.py reads the Packages key of all three through parse_ini.
    config = vale_configs.parse_ini((REPO_ROOT / name).read_text(encoding="utf-8"))
    assert config[""]["Packages"].count(".zip") >= 1


def test_the_real_configs_agree() -> None:
    assert vale_configs.check(REPO_ROOT / ".vale.ini", REPO_ROOT / ".vale-extended.ini") == []


def test_main_reports_drift_on_stderr(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    base = tmp_path / "base.ini"
    ext = tmp_path / "ext.ini"
    base.write_text((REPO_ROOT / ".vale.ini").read_text(encoding="utf-8"), encoding="utf-8")
    real_ext = (REPO_ROOT / ".vale-extended.ini").read_text(encoding="utf-8")
    dropped = (
        "TokenIgnores = (https?://\\S+), (Academy\\s[a-z0-9-]+), (Claude\\ssupport\\s[a-z0-9-]+)\n"
    )
    assert real_ext.count(dropped) == 1
    ext.write_text(real_ext.replace(dropped, ""), encoding="utf-8")
    assert vale_configs.main(["vale_configs.py", str(base), str(ext)]) == 1
    err = capsys.readouterr().err
    assert f"{ext}: [*.{{yaml,yml}}]: key TokenIgnores is in {base} but missing here" in err
    assert "drifted apart (1 finding(s))" in err


def test_main_passes_on_the_real_configs(capsys: pytest.CaptureFixture[str]) -> None:
    assert (
        vale_configs.main(
            ["vale_configs.py", str(REPO_ROOT / ".vale.ini"), str(REPO_ROOT / ".vale-extended.ini")]
        )
        == 0
    )
    assert "share their common settings" in capsys.readouterr().out
