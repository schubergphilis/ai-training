"""Reading, writing and pruning the list."""

import json
import os

TODO_FILE = os.environ.get("TODO_FILE", "todos.json")


def load():
    if not os.path.exists(TODO_FILE):
        return []
    with open(TODO_FILE, encoding="utf-8") as handle:
        return json.load(handle)


def save(items):
    with open(TODO_FILE, "w", encoding="utf-8") as handle:
        json.dump(items, handle, indent=2)
        handle.write("\n")


def remove_done(items):
    """Drops every done item from the list in place. Returns how many went."""
    kept = [item for item in items if not item["done"]]
    removed = len(items) - len(kept)
    items[:] = kept
    return removed
