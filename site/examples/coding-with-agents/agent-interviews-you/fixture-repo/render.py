"""Formatting the list for the terminal."""


def list_items(items):
    if not items:
        return "nothing to do"
    lines = []
    for number, item in enumerate(items, start=1):
        mark = "x" if item["done"] else " "
        lines.append(f"{number}. [{mark}] {item['text']}")
    done = sum(1 for item in items if item["done"])
    lines.append(f"{len(items) - done} open, {done} done")
    return "\n".join(lines)
