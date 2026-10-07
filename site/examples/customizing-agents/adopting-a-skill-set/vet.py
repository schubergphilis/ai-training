"""List what a published skill set holds, skill by skill.

For the lesson "Adopting a published skill set".

Run it on the directory of a skill set:   python3 vet.py workbench
Add skill names to look at those only:    python3 vet.py workbench plan-ticket review-diff

The script only reads files. It never runs a script of the set, and it
installs nothing. It reads the skills at `skills/<name>/SKILL.md`, which
is where most published sets keep them. For the set it prints:

- the first line of a license file at the top of the set, or `none`
- each plugin that `.claude-plugin/marketplace.json` lists, with its
  version and the number of skills it brings
- one line per skill: the license, the number of scripts, who may invoke
  it, and an estimate of the tokens its name and description add to
  every session. A skill whose front matter has `allowed-tools` also
  shows that value: the tools Claude may use without asking while the
  skill runs
- the total of those estimates for the whole set, and for the skills you
  named

The license of a skill is the first line of a license file in its
directory. Without a file, it is the `license` field of the front matter,
and without either it is `none stated`. A script is a file with a
`.py`, `.sh`, `.js`, `.mjs`, `.cjs` or `.ts` suffix, or a file that may be
executed. When you name skills, the script also lists their script files,
so you know which ones to open.

A skill with `disable-model-invocation: true` in its front matter adds
nothing to the context until you invoke it, so it counts as 0 tokens.

The token count uses the same rule as `measure.py` in the lesson "Loading
only what the skill needs": about four characters per token. A word of up
to six characters is one token, a longer word is one token per four
characters (rounded up), and every punctuation mark is a token of its own.
Only the vendor's tokenizer gives the exact count.
"""

import json
import math
import os
import re
import sys
from pathlib import Path

CHARS_PER_TOKEN = 4
ONE_TOKEN_WORD = 6
SCRIPT_SUFFIXES = (".py", ".sh", ".js", ".mjs", ".cjs", ".ts")
LICENSE_FILES = ("LICENSE", "LICENSE.txt", "LICENSE.md")

# A piece is a run of letters and digits, or a single mark of punctuation.
PIECE = re.compile(r"\w+|[^\w\s]")


def estimate_tokens(text: str) -> int:
    """Return the estimated number of tokens in `text`."""
    total = 0
    for piece in PIECE.findall(text):
        if not piece[0].isalnum() or len(piece) <= ONE_TOKEN_WORD:
            total += 1
        else:
            total += math.ceil(len(piece) / CHARS_PER_TOKEN)
    return total


def front_matter(path: Path) -> "dict[str, str]":
    """Return the top-level fields of a Markdown file's front matter.

    A line indented under a field (a folded value) is added to that field.
    A file without front matter gives an empty dictionary.
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    fields: dict[str, str] = {}
    if not lines or lines[0] != "---":
        return fields
    current = ""
    for line in lines[1:]:
        if line == "---":
            break
        if line[:1] in (" ", "\t") and current:
            fields[current] = (fields[current] + " " + line.strip()).strip()
            continue
        key, _, value = line.partition(":")
        current = key.strip()
        fields[current] = value.strip().strip("'\"")
    return fields


def license_line(directory: Path) -> str:
    """Return the first non-blank line of a license file in `directory`, or ''."""
    for name in LICENSE_FILES:
        path = directory / name
        if path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    return line.strip()
    return ""


def scripts(skill: Path) -> "list[str]":
    """Return the script files in a skill directory, as sorted relative paths."""
    found = []
    for path in skill.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix in SCRIPT_SUFFIXES or os.access(path, os.X_OK):
            found.append(path.relative_to(skill).as_posix())
    return sorted(found)


def model_can_invoke(fields: "dict[str, str]") -> bool:
    """A skill with disable-model-invocation: true is left out of the context."""
    return fields.get("disable-model-invocation", "").lower() != "true"


def describe(skill: Path) -> "tuple[str, int]":
    """Return the report line of one skill and its always-loaded tokens."""
    fields = front_matter(skill / "SKILL.md")
    name = fields.get("name", skill.name)
    terms = license_line(skill) or fields.get("license", "") or "none stated"
    count = len(scripts(skill))
    script_text = "no scripts" if count == 0 else f"{count} script" + ("" if count == 1 else "s")
    if model_can_invoke(fields):
        tokens = estimate_tokens(name + " " + fields.get("description", ""))
        who = "Claude or you"
    else:
        tokens = 0
        who = "you only"
    line = f"  {name}: {terms}; {script_text}; {who}; always loaded {tokens}"
    granted = fields.get("allowed-tools", "")
    if granted:
        line += f"; pre-approves {granted}"
    return line, tokens


def plugin_lines(skill_set: Path) -> "list[str]":
    """Return one line per plugin in the set's marketplace file."""
    path = skill_set / ".claude-plugin" / "marketplace.json"
    if not path.is_file():
        return ["marketplace: none"]
    market = json.loads(path.read_text(encoding="utf-8"))
    lines = [f"marketplace {market.get('name', skill_set.name)}:"]
    for plugin in market.get("plugins", []):
        version = plugin.get("version", "no version")
        listed = plugin.get("skills")
        if isinstance(listed, list):
            size = f"{len(listed)} skill" + ("" if len(listed) == 1 else "s")
        else:
            size = "skills not listed"
        lines.append(f"  plugin {plugin.get('name', '?')} {version}: {size}")
    return lines


def report(skill_set: Path, picked: "list[str]") -> "list[str]":
    """Return the lines of the report for a skill set and the skills picked from it."""
    skills = sorted(p.parent for p in (skill_set / "skills").glob("*/SKILL.md"))
    known = {p.name for p in skills}
    missing = [name for name in picked if name not in known]
    if missing:
        raise SystemExit("no such skill: " + ", ".join(missing))
    out = [f"set license: {license_line(skill_set) or 'none'}"]
    out.extend(plugin_lines(skill_set))
    out.append(f"skills: {len(skills)}")
    whole = 0
    chosen = 0
    for skill in skills:
        line, tokens = describe(skill)
        whole += tokens
        if picked and skill.name not in picked:
            continue
        chosen += tokens
        out.append(line)
        if picked:
            out.extend(f"    {path}" for path in scripts(skill))
    if picked:
        out.append(f"always loaded, the {len(picked)} you named: {chosen}")
    out.append(f"always loaded, whole set: {whole}")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python3 vet.py <skill set directory> [skill name ...]")
    print("\n".join(report(Path(sys.argv[1]), sys.argv[2:])))
