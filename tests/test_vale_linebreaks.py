"""Tests for scripts/vale_linebreaks.py (issue #371).

The unit tests run on inline rule text. The Vale tests run the `vale`
binary pinned in .mise.toml on the real rules: the House copies as
committed, and the synced ai-tells rules copied to a temporary styles
directory and widened there, so they don't depend on whether the local
sync was widened yet. The synced packages must be under .vale/styles/:
`mise run setup` fetches them, and CI runs `prose-sync` before `py-test`.
"""

import pathlib
import shutil
import subprocess

import pytest
import vale_linebreaks

import prose_eval
import vale_configs

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
STYLES = REPO_ROOT / ".vale" / "styles"
HOUSE = STYLES / "House"


def test_widen_pattern_replaces_each_space_and_keeps_other_escapes() -> None:
    assert vale_linebreaks.widen_pattern(r"\bfor the [^.]+\. It") == r"\bfor\sthe\s[^.]+\.\sIt"
    assert vale_linebreaks.widen_pattern(r"a\ b\\c") == r"a\sb\\c"
    assert vale_linebreaks.widen_pattern(r"dead[- ]end") == r"dead[-\s]end"
    assert vale_linebreaks.widen_pattern("trailing\\") == "trailing\\"


def test_widen_scalar_keeps_the_quoting_and_the_comment() -> None:
    assert (
        vale_linebreaks.widen_scalar('"\\\\bNo [^.]+\\" x" # c d', "f")
        == '"\\\\bNo\\\\s[^.]+\\"\\\\sx" # c d'
    )
    assert vale_linebreaks.widen_scalar("'it''s a b' # c d", "f") == "'it''s\\sa\\sb' # c d"
    assert vale_linebreaks.widen_scalar("in order to # c d", "f") == "in\\sorder\\sto # c d"
    assert vale_linebreaks.widen_scalar("'a b': c d", "f") == "'a\\sb': c d"


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ('"a\\tb"', "unsupported escape"),
        ('"a b', "unterminated double-quoted"),
        ("'a b", "unterminated single-quoted"),
        ("|", "unsupported YAML scalar"),
    ],
)
def test_widen_scalar_rejects_what_it_cannot_read(text: str, message: str) -> None:
    with pytest.raises(vale_linebreaks.RuleFormatError, match=message):
        vale_linebreaks.widen_scalar(text, "rule.yml:3")


EXISTENCE = """\
---
extends: existence
message: "Found '%s'. Say it plainly."
level: error
tokens:
  # A comment with spaces stays.
  - "\\\\bfor the [^.]+"

  - 'no more'
  - plain words # a comment
exceptions:
  - in order
action:
  name: replace
"""

EXISTENCE_WIDENED = """\
---
extends: existence
message: "Found '%s'. Say it plainly."
level: error
tokens:
  # A comment with spaces stays.
  - "\\\\bfor\\\\sthe\\\\s[^.]+"

  - 'no\\smore'
  - plain\\swords # a comment
exceptions:
  - in\\sorder
action:
  name: replace
"""

SUBSTITUTION = """\
extends: substitution
message: "Use '%s' over '%s'."
swap:
  cell phone: mobile phone
  '(?:ok|Okay) then': OK then
  "e mail": email
"""


def test_widen_rule_rewrites_the_pattern_blocks_of_an_existence_rule() -> None:
    assert vale_linebreaks.widen_rule(EXISTENCE) == EXISTENCE_WIDENED
    assert vale_linebreaks.widen_rule(EXISTENCE_WIDENED) == EXISTENCE_WIDENED


def test_widen_rule_rewrites_swap_keys_and_never_the_replacements() -> None:
    assert vale_linebreaks.widen_rule(SUBSTITUTION) == (
        "extends: substitution\n"
        "message: \"Use '%s' over '%s'.\"\n"
        "swap:\n"
        "  cell\\sphone: mobile phone\n"
        "  '(?:ok|Okay)\\sthen': OK then\n"
        '  "e\\\\smail": email\n'
    )


def test_widen_rule_reads_a_list_item_with_more_than_one_space_after_the_dash() -> None:
    text = 'extends: existence\ntokens:\n  -   "foo bar"\n-\tin order\n'
    assert vale_linebreaks.widen_rule(text) == (
        'extends: existence\ntokens:\n  -   "foo\\\\sbar"\n-\tin\\sorder\n'
    )


def test_widen_scalar_keeps_the_trailing_whitespace_of_a_plain_scalar_unwidened() -> None:
    assert vale_linebreaks.widen_scalar("in order  ", "f") == "in\\sorder  "
    assert vale_linebreaks.widen_scalar("in order \t# a comment", "f") == "in\\sorder \t# a comment"


def test_widen_rule_leaves_other_rule_types_alone() -> None:
    sequence = "extends: sequence\nmessage: x\ntokens:\n  - tag: JJ\n    pattern: a b\n"
    assert vale_linebreaks.widen_rule(sequence) == sequence


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("extends: existence\ntokens: [a b]\n", "written inline"),
        ("extends: existence\ntokens:\n  a b\n", "list item"),
        ("extends: substitution\nswap:\n  - a b\n", "'pattern: replacement' line"),
    ],
)
def test_widen_rule_names_the_line_it_cannot_read(text: str, message: str) -> None:
    with pytest.raises(vale_linebreaks.RuleFormatError, match=rf"rule\.yml:\d: .*{message}"):
        vale_linebreaks.widen_rule(text, "rule.yml")


def test_run_widens_the_pinned_packages_only(tmp_path: pathlib.Path) -> None:
    ini = tmp_path / "vale.ini"
    ini.write_text("Packages = https://example.test/Pkg.zip, https://example.test/Missing.zip\n")
    for name in ("Pkg", "Other"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "Rule.yml").write_text(EXISTENCE)
    (tmp_path / "Pkg" / "Clean.yml").write_text(EXISTENCE_WIDENED)
    assert vale_linebreaks.run([ini, ini], tmp_path) == [tmp_path / "Pkg" / "Rule.yml"]
    assert (tmp_path / "Pkg" / "Rule.yml").read_text() == EXISTENCE_WIDENED
    assert (tmp_path / "Other" / "Rule.yml").read_text() == EXISTENCE
    assert vale_linebreaks.run([ini], tmp_path) == []


def test_main_reports_the_count_and_a_format_error(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    ini = tmp_path / "vale.ini"
    ini.write_text("Packages = https://example.test/Pkg.zip\n")
    (tmp_path / "Pkg").mkdir()
    (tmp_path / "Pkg" / "Rule.yml").write_text(EXISTENCE)
    monkeypatch.setattr(vale_linebreaks, "STYLES", tmp_path)
    assert vale_linebreaks.main([str(ini)]) == 0
    assert "widened 1 rule files" in capsys.readouterr().out
    assert vale_linebreaks.main([str(ini)]) == 0
    assert capsys.readouterr().out == ""
    (tmp_path / "Pkg" / "Bad.yml").write_text("extends: existence\ntokens: [a b]\n")
    with pytest.raises(SystemExit, match="written inline"):
        vale_linebreaks.main([str(ini)])
    with pytest.raises(SystemExit, match="Usage"):
        vale_linebreaks.main([])


def test_main_reports_a_bare_package_name_without_a_traceback(tmp_path: pathlib.Path) -> None:
    ini = tmp_path / "vale.ini"
    ini.write_text("Packages = Google\n")
    with pytest.raises(SystemExit, match=r"Packages entry 'Google' is not a \.zip URL"):
        vale_linebreaks.main([str(ini)])


# House.VerbTricolon keeps its literal spaces until the maintainer decides
# what to do about the noun lists it flags once it matches across a line
# break (issue #441). Strict, so widening the rule fails here until the
# marker goes.
VERB_TRICOLON_PENDING = pytest.mark.xfail(
    strict=True, reason="House.VerbTricolon is not widened yet (issue #441)"
)


def _house_rule(rule: pathlib.Path) -> object:
    marks = [VERB_TRICOLON_PENDING] if rule.name == "VerbTricolon.yml" else []
    return pytest.param(rule, id=rule.name, marks=marks)


@pytest.mark.parametrize("rule", [_house_rule(rule) for rule in sorted(HOUSE.glob("*.yml"))])
def test_house_rules_have_no_literal_space_in_a_pattern(rule: pathlib.Path) -> None:
    text = rule.read_text(encoding="utf-8")
    assert vale_linebreaks.widen_rule(text, str(rule)) == text


def _synced_rules() -> list[pathlib.Path]:
    configs = [REPO_ROOT / ".vale.ini", REPO_ROOT / ".vale-extended.ini"]
    dirs = vale_linebreaks.package_dirs(configs, STYLES)
    return sorted(rule for directory in dirs for rule in directory.glob("*.yml"))


def test_every_synced_rule_can_be_widened() -> None:
    rules = _synced_rules()
    assert rules, "no synced Vale packages under .vale/styles/: run 'mise run setup'"
    for rule in rules:
        widened = vale_linebreaks.widen_rule(rule.read_text(encoding="utf-8"), str(rule))
        assert vale_linebreaks.widen_rule(widened, str(rule)) == widened


# Each case: the rule, and a hit in which one of the rule's literal spaces
# falls on a line break. The first is the paragraph from issue #371.
ISSUE_371 = (
    "Then it asks for the case against it, for the questions left open, and\n"
    "for what each option costs."
)
SPLIT_HITS = {
    "ai-tells.StackedAnaphora": ISSUE_371,
    "ai-tells.MotionMetaphors": "The config then drives\nthe build on every push.",
    "House.VerbTricolon": ISSUE_371,
    "House.Transitions": "The run failed. In\naddition, the log was empty.",
    "House.Idioms": "The second run came at a\nprice for the team.",
}


def _split_case(rule: str) -> object:
    marks = [VERB_TRICOLON_PENDING] if rule == "House.VerbTricolon" else []
    return pytest.param(rule, id=rule, marks=marks)


def _vale(tmp_path: pathlib.Path, rule: str, text: str) -> list[str]:
    """The checks that fire on `text` with only `rule` on, at error.

    A package rule is widened the way `prose-sync` widens it. A House rule
    is used as committed.
    """
    style, name = rule.split(".")
    styles = tmp_path / "styles"
    (styles / style).mkdir(parents=True, exist_ok=True)
    source = STYLES / style / f"{name}.yml"
    assert source.is_file(), f"{source} is missing: run 'mise run setup'"
    target = styles / style / f"{name}.yml"
    shutil.copy(source, target)
    if style != "House":
        target.write_text(
            vale_linebreaks.widen_rule(target.read_text(encoding="utf-8"), str(target))
        )
    (tmp_path / ".vale.ini").write_text(
        f"StylesPath = styles\nMinAlertLevel = suggestion\n[*.md]\n{rule} = error\n"
    )
    page = tmp_path / "page.md"
    page.write_text(text + "\n")
    out = subprocess.run(
        ["vale", "--no-exit", "--output=JSON", "--config", str(tmp_path / ".vale.ini"), str(page)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    hits = prose_eval.parse_hits(out)
    return [alert["Check"] for alerts in hits.values() for alert in alerts]


@pytest.mark.parametrize("rule", [_split_case(rule) for rule in SPLIT_HITS])
def test_rule_fires_on_a_hit_split_over_two_lines(tmp_path: pathlib.Path, rule: str) -> None:
    assert "\n" in SPLIT_HITS[rule]
    assert rule in _vale(tmp_path, rule, SPLIT_HITS[rule])


# The same hits on one line. House.VerbTricolon fires there already.
@pytest.mark.parametrize("rule", SPLIT_HITS)
def test_rule_fires_on_the_same_hit_on_one_line(tmp_path: pathlib.Path, rule: str) -> None:
    text = SPLIT_HITS[rule]
    assert rule in _vale(tmp_path, rule, text.replace("\n", " "))


def test_an_unwidened_rule_misses_the_split_hit(tmp_path: pathlib.Path) -> None:
    """Why the script exists: Vale keeps the line break, and a literal space doesn't match it."""
    styles = tmp_path / "styles" / "T"
    styles.mkdir(parents=True)
    (styles / "Rule.yml").write_text(
        EXISTENCE.replace("level: error\n", "level: error\nnonword: true\n")
    )
    (tmp_path / ".vale.ini").write_text("StylesPath = styles\n[*.md]\nBasedOnStyles = T\n")
    page = tmp_path / "page.md"

    def fires(text: str) -> bool:
        page.write_text(text)
        result = subprocess.run(
            ["vale", "--output=line", "--config", str(tmp_path / ".vale.ini"), str(page)],
            capture_output=True,
            text=True,
        )
        return "T.Rule" in result.stdout

    assert fires("It says no more than that.\n")
    assert not fires("It says no\nmore than that.\n")
    (styles / "Rule.yml").write_text(vale_linebreaks.widen_rule((styles / "Rule.yml").read_text()))
    assert fires("It says no\nmore than that.\n")


# Issue #453: the multi-word accept entries and the `TokenIgnores` phrases
# are written with `\s`, so they apply where a line break splits them. Each
# case runs Vale on the committed accept list or the committed ignore, and
# again with the entry's `\s` put back to a space, which must report the
# split text. That second run shows that the case tests the widening.
ACCEPT = STYLES / "config" / "vocabularies" / "ai-training" / "accept.txt"


def _accept_entries() -> list[str]:
    lines = ACCEPT.read_text(encoding="utf-8").splitlines()
    return [line for line in lines if line.strip() and not line.startswith("#")]


def _vale_with(
    tmp_path: pathlib.Path,
    rules: list[str],
    text: str,
    *,
    accept: list[str],
    token_ignores: str = "",
) -> list[str]:
    """The checks that fire on `text` with `rules` on, `accept` as the vocabulary.

    Vale.Terms runs in every call, since a vocabulary always feeds it. A
    package rule is widened the way `prose-sync` widens it.
    """
    styles = tmp_path / "styles"
    for rule in rules:
        style, name = rule.split(".")
        (styles / style).mkdir(parents=True, exist_ok=True)
        source = STYLES / style / f"{name}.yml"
        assert source.is_file(), f"{source} is missing: run 'mise run setup'"
        target = styles / style / f"{name}.yml"
        target.write_text(
            vale_linebreaks.widen_rule(source.read_text(encoding="utf-8"), str(source))
        )
    vocab = styles / "config" / "vocabularies" / "T"
    vocab.mkdir(parents=True, exist_ok=True)
    (vocab / "accept.txt").write_text("\n".join(accept) + "\n")
    levels = "".join(f"{rule} = error\n" for rule in rules)
    ignores = f"TokenIgnores = {token_ignores}\n" if token_ignores else ""
    (tmp_path / ".vale.ini").write_text(
        "StylesPath = styles\nMinAlertLevel = suggestion\nVocab = T\n"
        f"[*.md]\nBasedOnStyles = Vale\nVale.Spelling = NO\n{ignores}{levels}"
    )
    page = tmp_path / "page.md"
    page.write_text(text + "\n")
    out = subprocess.run(
        ["vale", "--no-exit", "--output=JSON", "--config", str(tmp_path / ".vale.ini"), str(page)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    hits = prose_eval.parse_hits(out)
    return [alert["Check"] for alerts in hits.values() for alert in alerts]


def _unwidened(entries: list[str], entry: str) -> list[str]:
    assert entry in entries, f"{entry!r} is not in {ACCEPT}"
    return [line.replace(r"\s", " ") if line == entry else line for line in entries]


# Each multi-word accept entry: the rule it exempts, and the exempted text
# split over two lines. The last two exempt Google.Headings, and a heading
# is one line, so for them the split text is miscased: with `\s` Vale.Terms
# reports it wherever the line wraps.
SPLIT_ACCEPT = {
    r"[Ii]t\sis": ("write-good.TooWordy", "The check passed. It\nis ordinary."),
    r"[Ii]t\swas": ("write-good.TooWordy", "The check ran. It\nwas ordinary."),
    r"Learn\sPrompting": ("Vale.Terms", "You learn\nprompting from a guide."),
    r"Execute\sProgram": ("Vale.Terms", "You execute\nprogram steps."),
}


def test_every_multi_word_accept_entry_is_widened_and_has_a_split_case() -> None:
    entries = _accept_entries()
    assert not [entry for entry in entries if " " in entry], "write `\\s` between the words"
    assert sorted(entry for entry in entries if r"\s" in entry) == sorted(SPLIT_ACCEPT)


@pytest.mark.parametrize("entry", SPLIT_ACCEPT)
def test_a_multi_word_accept_entry_applies_across_a_line_break(
    tmp_path: pathlib.Path, entry: str
) -> None:
    rule, text = SPLIT_ACCEPT[entry]
    rules = [] if rule == "Vale.Terms" else [rule]
    entries = _accept_entries()
    widened = _vale_with(tmp_path / "widened", rules, text, accept=entries)
    old = _vale_with(tmp_path / "old", rules, text, accept=_unwidened(entries, entry))
    if rule == "Vale.Terms":
        assert widened == ["Vale.Terms"]
        assert old == []
    else:
        assert widened == []
        assert old == [rule]


# The accepted spelling of each entry, on one line and split. Vale.Terms
# must accept all of them, and Google.Headings must accept the names in a
# heading.
ACCEPTED_TEXT = [
    "The check passed. It is ordinary. it is fine.",
    "The check passed. It\nis ordinary. it\nis fine.",
    "The check ran. It was ordinary. it was fine.",
    "The check ran. It\nwas ordinary. it\nwas fine.",
    "Read Learn Prompting and Execute Program.",
    "Read Learn\nPrompting and Execute\nProgram.",
    "## Notes on Learn Prompting\n\n## Notes on Execute Program",
]


@pytest.mark.parametrize("text", ACCEPTED_TEXT)
def test_vale_terms_accepts_the_widened_entries(tmp_path: pathlib.Path, text: str) -> None:
    rules = ["write-good.TooWordy", "Google.Headings"]
    assert _vale_with(tmp_path, rules, text, accept=_accept_entries()) == []


# Each `TokenIgnores` phrase with a space in it: the config section, the
# pattern, the rule the ignore keeps quiet, and the phrase split over two
# lines. The bibliography YAML is linted with `--ext=.md`, so a Markdown
# page tests its section as well.
SPLIT_IGNORES = {
    "significant harm": (
        "[site/src/content/docs/**/*.{md,mdx}]",
        r'("significant\sharm")',
        "ai-tells.OverusedVocabulary",
        'Practices that cause "significant\nharm" are banned.',
    ),
    "Academy slug": (
        "[*.{yaml,yml}]",
        r"(Academy\s[a-z0-9-]+)",
        "Vale.Terms",
        "See Academy\nintroduction-to-claude-cowork for the course.",
    ),
    "Claude support slug": (
        "[*.{yaml,yml}]",
        r"(Claude\ssupport\s[a-z0-9-]+)",
        "Vale.Terms",
        "See Claude support\nget-started-with-claude-cowork for the page.",
    ),
}


def _token_ignores(config: pathlib.Path, section: str) -> list[str]:
    value = vale_configs.parse_ini(config.read_text(encoding="utf-8"))[section]["TokenIgnores"]
    return [pattern.strip() for pattern in value.split(", ")]


@pytest.mark.parametrize("config", [".vale.ini", ".vale-extended.ini"])
def test_every_token_ignores_phrase_is_widened_and_has_a_split_case(config: str) -> None:
    sections = vale_configs.parse_ini((REPO_ROOT / config).read_text(encoding="utf-8"))
    patterns = {
        (section, pattern)
        for section, keys in sections.items()
        if "TokenIgnores" in keys
        for pattern in _token_ignores(REPO_ROOT / config, section)
    }
    assert not [p for p in patterns if " " in p[1]], "write `\\s` between the words"
    widened = {p for p in patterns if r"\s" in p[1]}
    assert widened == {(section, pattern) for section, pattern, _, _ in SPLIT_IGNORES.values()}


@pytest.mark.parametrize("case", SPLIT_IGNORES)
def test_a_token_ignores_phrase_applies_across_a_line_break(
    tmp_path: pathlib.Path, case: str
) -> None:
    section, pattern, rule, text = SPLIT_IGNORES[case]
    ignores = ", ".join(_token_ignores(REPO_ROOT / ".vale.ini", section))
    rules = [] if rule == "Vale.Terms" else [rule]
    accept = _accept_entries()
    assert _vale_with(tmp_path / "widened", rules, text, accept=accept, token_ignores=ignores) == []
    old = ignores.replace(pattern, pattern.replace(r"\s", " "))
    assert old != ignores
    assert _vale_with(tmp_path / "old", rules, text, accept=accept, token_ignores=old) == [rule]


# The pre-push Vale hooks in prek.toml run the package check and the
# rewrite from the `depends` of `mise run prose`, in that order, and then
# Vale (issue #454). They don't run `prose-check-configs`. Without the
# rewrite a checkout synced by a bare `vale sync` passes a line-split hit on
# a push that `mise run prose` rejects. The hooks set `require_serial` and
# the rewrite replaces each file in one step, so two copies of a hook don't
# read a rule file while the other writes it.
PACKAGE_CHECK = "scripts/prose_eval.py --check-packages .vale.ini .vale-extended.ini"
WIDEN = "scripts/vale_linebreaks.py .vale.ini .vale-extended.ini"


def _vale_hook_problem(entry: str) -> str:
    """Why a hook entry that runs Vale would run it on unwidened rules, or ''."""
    vale_at = entry.find(" vale ")
    if vale_at < 0:
        return "does not run vale"
    check_at = entry.find(PACKAGE_CHECK)
    widen_at = entry.find(WIDEN)
    if check_at < 0 or check_at > vale_at:
        return "does not check the packages before vale"
    if widen_at < 0 or widen_at > vale_at:
        return "does not widen the packages before vale"
    if widen_at < check_at:
        return "widens before the package check"
    if f"{PACKAGE_CHECK} && {WIDEN} && vale " not in entry:
        return "does not join the steps with &&"
    return ""


def _prek_hook_keys() -> dict[str, dict[str, object]]:
    """The `entry` and `require_serial` of each prek.toml hook, by hook id.

    prek.toml writes a hook as an inline table over several lines, which is
    TOML 1.1 and which `tomllib` in Python 3.14 rejects, so the `id`,
    `entry` and `require_serial` lines are read directly. Each value is on
    its own line, and its escapes (`\\"`) are also JSON escapes.
    """
    import json

    hooks: dict[str, dict[str, object]] = {}
    hook_id = ""
    for line in (REPO_ROOT / "prek.toml").read_text(encoding="utf-8").splitlines():
        key, _, value = line.strip().partition(" = ")
        if key == "id":
            hook_id = json.loads(value.rstrip(","))
            hooks[hook_id] = {}
        elif key in ("entry", "require_serial"):
            hooks[hook_id][key] = json.loads(value.rstrip(","))
    return hooks


def _prek_vale_hooks() -> dict[str, dict[str, object]]:
    """The keys of each prek.toml hook whose `entry` runs Vale, by hook id."""
    return {
        hook_id: keys
        for hook_id, keys in _prek_hook_keys().items()
        if " vale " in f" {keys.get('entry', '')}"
    }


def test_the_prek_vale_hooks_widen_the_packages_before_vale() -> None:
    hooks = _prek_vale_hooks()
    assert sorted(hooks) == ["vale", "vale-yaml"]
    for hook_id, keys in hooks.items():
        entry = keys["entry"]
        assert isinstance(entry, str), hook_id
        assert _vale_hook_problem(entry) == "", hook_id


def test_the_prek_vale_hooks_run_one_copy_at_a_time() -> None:
    hooks = _prek_vale_hooks()
    assert sorted(hooks) == ["vale", "vale-yaml"]
    for hook_id, keys in hooks.items():
        assert keys.get("require_serial") is True, hook_id


@pytest.mark.parametrize(
    ("entry", "problem"),
    [
        (f"sh -c '{PACKAGE_CHECK} && vale \"$@\"' --", "does not widen"),
        (f"sh -c '{PACKAGE_CHECK} && vale \"$@\" && {WIDEN}' --", "does not widen"),
        (f"sh -c '{WIDEN} && vale \"$@\"' --", "does not check"),
        (f"sh -c '{WIDEN} && {PACKAGE_CHECK} && vale \"$@\"' --", "widens before"),
        ("sh -c 'cspell \"$@\"' --", "does not run vale"),
        (f"sh -c '{PACKAGE_CHECK} ; {WIDEN} ; vale \"$@\"' --", "does not join"),
        (f"sh -c '{PACKAGE_CHECK} && {WIDEN} || vale \"$@\"' --", "does not join"),
    ],
)
def test_vale_hook_problem_names_a_hook_that_skips_the_rewrite(entry: str, problem: str) -> None:
    assert _vale_hook_problem(entry).startswith(problem)


def test_run_replaces_a_rule_in_one_step(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ini = tmp_path / "vale.ini"
    ini.write_text("Packages = https://example.test/Pkg.zip\n")
    (tmp_path / "Pkg").mkdir()
    rule = tmp_path / "Pkg" / "Rule.yml"
    rule.write_text(EXISTENCE)
    rule.chmod(0o644)
    replaced: list[tuple[str, str]] = []
    real_replace = vale_linebreaks.os.replace

    def watch_replace(src: str, dst: str) -> None:
        # Before the replace the rule still holds its old text, and the new
        # text is complete in a file that no `*.yml` glob matches.
        assert rule.read_text() == EXISTENCE
        assert pathlib.Path(src).read_text() == EXISTENCE_WIDENED
        assert pathlib.Path(src).parent == rule.parent
        assert not pathlib.Path(src).name.endswith(".yml")
        replaced.append((str(src), str(dst)))
        real_replace(src, dst)

    monkeypatch.setattr(vale_linebreaks.os, "replace", watch_replace)
    assert vale_linebreaks.run([ini], tmp_path) == [rule]
    assert replaced == [(replaced[0][0], str(rule))]
    assert rule.read_text() == EXISTENCE_WIDENED
    assert rule.stat().st_mode & 0o777 == 0o644
    assert sorted(path.name for path in (tmp_path / "Pkg").iterdir()) == ["Rule.yml"]


def test_a_failed_write_keeps_the_rule_and_leaves_no_temp_file(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rule = tmp_path / "Rule.yml"
    rule.write_text(EXISTENCE)

    def fail_replace(src: str, dst: str) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(vale_linebreaks.os, "replace", fail_replace)
    with pytest.raises(OSError, match="disk full"):
        vale_linebreaks.write_atomically(rule, EXISTENCE_WIDENED)
    assert rule.read_text() == EXISTENCE
    assert [path.name for path in tmp_path.iterdir()] == ["Rule.yml"]
