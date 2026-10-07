# todo

A small command-line to-do list kept in a JSON file, split into three
modules. It exists as a practice repository for the lesson *Let the agent
interview you*.

```sh
python3 todo.py add "Buy milk"
python3 todo.py list
python3 todo.py done 1
python3 todo.py clear
python3 -m unittest -q
```

`todo.py` holds the commands, `store.py` reads and writes the list, and
`render.py` formats it. Items live in `todos.json` next to the scripts. Set
`TODO_FILE` to use a different file.

The tests pass. In the lesson an agent interviews you about a new feature
before anything is planned, and writes `TERMS.md` and `SPEC.md` here. Work
in a copy of the lesson directory, and reset it by deleting the copy and
copying again.
