"""No skill or command file holds an argument placeholder by accident (#532).

Claude Code replaces argument placeholders in a skill's content before the
model reads it. The forms, from "Available string substitutions" on
https://code.claude.com/docs/en/skills, are `$ARGUMENTS`, `$ARGUMENTS[N]`,
`$N` (such as `$0` for the first argument), and `$name` for a name the
`arguments` frontmatter list declares. The same page says a file in
`.claude/commands/` works the same way as a skill, and that a single
backslash before the token (`\\$1`) keeps it literal, while a doubled
backslash (`\\\\$1`) does not.

So an awk `$0` in `.claude/skills/wave/SKILL.md` reached the dispatcher as
`--resume` whenever `/wave` had arguments, and the run body check failed.
This test reads every `SKILL.md` under `.claude/skills/` and every `.md`
file under `.claude/commands/`. Supporting files in a skill directory and
the subagent files in `.claude/agents/` are not skill content on that page,
so their `$0` reaches the model as written and they are not checked.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DOCS = "https://code.claude.com/docs/en/skills (Available string substitutions)"

# `$` then a digit (`$0`, `$ARGUMENTS[N]`'s shorthand) or `ARGUMENTS` (which
# covers `$ARGUMENTS[N]` too). Declared names are added per file.
FIXED = r"\d|ARGUMENTS"


def substituted_files(root: Path) -> list[Path]:
    """Return the files whose content Claude Code substitutes arguments into."""
    skills = sorted((root / ".claude" / "skills").glob("*/SKILL.md"))
    commands = sorted((root / ".claude" / "commands").rglob("*.md"))
    return skills + commands


def declared_arguments(text: str) -> list[str]:
    """Return the names in the frontmatter `arguments` list, inline or block form."""
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    if match is None:
        return []
    names: list[str] = []
    lines = match.group(1).splitlines()
    for index, line in enumerate(lines):
        if not line.startswith("arguments:"):
            continue
        value = line.removeprefix("arguments:").strip()
        if value.startswith("["):
            names += [n.strip().strip("'\"") for n in value.strip("[]").split(",")]
        else:
            for item in lines[index + 1 :]:
                if not item.lstrip().startswith("- "):
                    break
                names.append(item.lstrip().removeprefix("- ").strip().strip("'\""))
    return [n for n in names if n]


def placeholders(text: str) -> list[tuple[int, str]]:
    """Return (line number, line) for each placeholder Claude Code would replace.

    A token counts as escaped only with exactly one backslash before it, as
    the skills page says.
    """
    names = [re.escape(n) for n in declared_arguments(text)]
    alternatives = FIXED if not names else FIXED + "|" + "|".join(rf"{n}\b" for n in names)
    token = re.compile(rf"(\\*)\$(?:{alternatives})")
    found: list[tuple[int, str]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if any(len(m.group(1)) != 1 for m in token.finditer(line)):
            found.append((number, line.strip()))
    return found


@pytest.mark.parametrize(
    "line",
    [
        "awk '/^## /{p=($0==\"## Arguments\")} p'",
        "Resume the run named $1.",
        "Arguments: $ARGUMENTS",
        "The first one is $ARGUMENTS[0].",
        "A doubled backslash still expands: \\\\$1.",
    ],
)
def test_placeholder_is_found(line: str) -> None:
    assert placeholders(f"# Skill\n\n{line}\n") == [(3, line)]


@pytest.mark.parametrize(
    "line",
    [
        "awk '/^## /{p=/^## Arguments$/} p'",
        "It costs \\$1.00.",
        'echo "${ra:-no Run line}" and $(date) and $HOME',
        "The $ARG variable and the $name word.",
    ],
)
def test_other_dollars_pass(line: str) -> None:
    assert placeholders(f"# Skill\n\n{line}\n") == []


def test_declared_argument_is_found() -> None:
    inline = "---\nname: x\narguments: [issue, branch]\n---\n\nBuild $issue on $branchy.\n"
    block = "---\narguments:\n  - issue\n---\n\nBuild $issue.\n"
    assert declared_arguments(inline) == ["issue", "branch"]
    assert placeholders(inline) == [(6, "Build $issue on $branchy.")]
    assert placeholders(block) == [(6, "Build $issue.")]


def test_substituted_files_are_skills_and_commands(tmp_path: Path) -> None:
    for relative in (
        ".claude/skills/a/SKILL.md",
        ".claude/skills/a/notes.md",
        ".claude/commands/deploy.md",
        ".claude/agents/builder.md",
    ):
        (tmp_path / relative).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / relative).write_text("$0\n", encoding="utf-8")
    found = [p.relative_to(tmp_path).as_posix() for p in substituted_files(tmp_path)]
    assert found == [".claude/skills/a/SKILL.md", ".claude/commands/deploy.md"]


def test_repo_skills_hold_no_placeholders() -> None:
    files = substituted_files(ROOT)
    assert files, "no SKILL.md found under .claude/skills/"
    problems = [
        f"{path.relative_to(ROOT)}:{number}: {line}"
        for path in files
        for number, line in placeholders(path.read_text(encoding="utf-8"))
    ]
    assert not problems, (
        "Claude Code replaces these with the skill's arguments before the model "
        f"reads the skill ({DOCS}). Rewrite the text without the placeholder, "
        "such as an awk regex in place of $0, or put one backslash before the $:\n"
        + "\n".join(problems)
    )
