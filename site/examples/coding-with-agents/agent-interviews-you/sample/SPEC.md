# Spec: archive done items

## Goal

`todo.py archive` moves every done item from the list to `archive.json`.
The list then shows open work only, and the done items are kept.

## Behavior

1. `archive` appends each done item to `archive.json`, in list order, and
   takes it off the list. With two done items it prints
   `archived 2 done items`.
2. The items that are still open keep their order and are numbered again
   from 1.
3. `archive list` shows the archive, numbered from 1, with the text of each task.
4. `clear` deletes the completed items and empties `archive.json`.
5. With no done items, `archive` changes nothing and prints
   `nothing to archive`.

## Out of scope

- Moving an item from the archive back to the list.

## Open questions

- Whether `archive list` shows the date each item was archived. Not decided
  yet.
