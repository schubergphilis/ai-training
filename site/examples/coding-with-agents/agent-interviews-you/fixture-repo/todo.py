"""todo: a small to-do list kept in a JSON file.

Usage:
    python3 todo.py add "Buy milk"
    python3 todo.py list
    python3 todo.py done 1
    python3 todo.py clear
"""

import sys

import render
import store


def add(items, text):
    items.append({"text": text, "done": False})
    return f"added #{len(items)}: {text}"


def done(items, number):
    index = number - 1
    if index < 0 or index >= len(items):
        return f"no item #{number}"
    items[index]["done"] = True
    return f"done #{number}: {items[index]['text']}"


def clear(items):
    removed = store.remove_done(items)
    noun = "item" if removed == 1 else "items"
    return f"removed {removed} done {noun}"


def main(argv):
    items = store.load()
    command = argv[1] if len(argv) > 1 else "list"
    if command == "add" and len(argv) > 2:
        message = add(items, " ".join(argv[2:]))
    elif command == "list":
        message = render.list_items(items)
    elif command == "done" and len(argv) == 3 and argv[2].isdigit():
        message = done(items, int(argv[2]))
    elif command == "clear":
        message = clear(items)
    else:
        print((__doc__ or "").strip(), file=sys.stderr)
        return 2
    store.save(items)
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
