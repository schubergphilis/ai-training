# Spec: import an old list

## Goal

`todo.py import <file>` reads a text file with one task per line and adds
the tasks to the list, so nobody has to type forty `add` commands.

## Behavior

1. Spaces before and after a line are dropped, and blank lines are skipped.
2. A line that starts with `x` and a space is a done item, and the mark
   isn't part of its text.
3. A task already in the list isn't added again.
4. The command prints `imported N items, skipped M`.
5. `add`, `list`, `done` and `clear` keep working.

## Out of scope

- Any file format other than plain text with one task per line.

## Open questions

- Which done marks the old file uses. The colleague thinks it is `x` and a
  space, but nobody has looked. `old-list.txt` is a copy of the file.
