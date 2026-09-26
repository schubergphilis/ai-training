"""Check action items against what a tracker import accepts.

The tracker in the lesson imports one item at a time, and each item needs
exactly four fields: owner, task, due (a date written as YYYY-MM-DD) and
priority (one of high, medium, low). This script reads a file of items
that a chat assistant produced and prints one line per item, `ok` or
`FAIL`, then a summary. Two input formats are accepted, and the file
decides which one is read:

- A JSON array (the file starts with `[`), one object per item.
- One line per item, fields separated by `|`, each written as `name: value`.

Lines that start with three backticks are skipped, because chat tools often
wrap their answer in a code fence. A file that starts with `{` is read as
JSON too, so a JSON object instead of an array gets a clear message.

Usage: python3 check_items.py FILE

Exit status 0 when every item passes, 1 otherwise, so a script can test it.

Standard library only, Python 3.9 or later.

The lesson's format checker widget ports these rules to the browser
(site/src/scripts/format-checker-logic.ts). Change both together.
"""

import datetime
import json
import sys

FIELDS = ["owner", "task", "due", "priority"]
PRIORITIES = {"high", "medium", "low"}


def strip_fences(text):
    """Drop the code fence lines a chat tool may wrap its answer in."""
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("```"))


def parse_lines(text):
    """One item per non-empty line, fields as `name: value` separated by `|`.

    A part without a `name:` is kept under the key None, so the report can
    say that the line split in the wrong place.
    """
    items = []
    for line in text.splitlines():
        if not line.strip():
            continue
        item = {}
        for part in line.split("|"):
            name, sep, value = part.partition(":")
            if sep:
                item[name.strip()] = value.strip()
            else:
                item.setdefault(None, []).append(part.strip())
        items.append(item)
    return items


def parse(text):
    """Return the items as a list of dicts, or an error message."""
    text = strip_fences(text).strip()
    if not text:
        return [], "the answer is empty"
    if not text.startswith(("[", "{")):
        starts_json = any(line.lstrip().startswith(("[", "{")) for line in text.splitlines())
        if starts_json:
            return [], "the answer does not start with [ (is there text before the JSON?)"
        return parse_lines(text), None
    try:
        data = json.loads(text)
    except ValueError as exc:
        return [], f"not valid JSON: {exc}"
    if isinstance(data, dict):
        keys = ", ".join(str(k) for k in data)
        return [], f"expected a JSON array of objects, got a JSON object with keys: {keys}"
    if not all(isinstance(item, dict) for item in data):
        return [], "expected a JSON array of objects, one per item"
    return data, None


def is_date(value):
    """True when `value` is written as YYYY-MM-DD and is a real date."""
    if len(value) != 10:
        return False
    try:
        datetime.datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def problems(item):
    """Every reason this one item would be rejected by the import."""
    found = []
    for part in item.get(None, []):
        found.append(f'unnamed part "{part}" (every part needs a name: before its value)')
    missing = [f for f in FIELDS if f not in item]
    extra = [str(k) for k in item if k not in FIELDS and k is not None]
    if missing:
        text = "missing " + ", ".join(missing)
        if extra:
            text += " (found " + ", ".join(extra) + ")"
        found.append(text)
    elif extra:
        found.append("unexpected " + ", ".join(extra))
    for name in ("owner", "task"):
        if name in item and not str(item[name]).strip():
            found.append(f"{name} is empty")
    if "due" in item and not is_date(str(item["due"])):
        found.append(f'due "{item["due"]}" is not a date written as YYYY-MM-DD')
    if "priority" in item and str(item["priority"]) not in PRIORITIES:
        allowed = ", ".join(sorted(PRIORITIES))
        found.append(f'priority "{item["priority"]}" is not one of {allowed}')
    return found


def report(items):
    """Print one line per item and problem, then the summary. Returns the pass count."""
    passed = 0
    for number, item in enumerate(items, start=1):
        found = problems(item)
        if found:
            for text in found:
                print(f"FAIL {number}: {text}")
        else:
            passed += 1
            print(f"ok {number}: " + ", ".join(str(item[f]) for f in FIELDS))
    print(f"{passed} of {len(items)} items pass")
    return passed


def main(argv):
    if len(argv) != 2:
        print("usage: python3 check_items.py FILE")
        return 2
    try:
        with open(argv[1], encoding="utf-8") as f:
            text = f.read()
    except OSError as exc:
        print(f"FAIL: cannot read {argv[1]}: {exc.strerror}")
        return 1
    items, error = parse(text)
    if error is None and not items:
        error = "no items found"
    if error:
        print(f"FAIL: {error}")
        return 1
    passed = report(items)
    return 0 if passed == len(items) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
