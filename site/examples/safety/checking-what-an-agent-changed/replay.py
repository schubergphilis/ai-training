"""Replay a recorded agent session as file changes and check them against the request.

The fixture behind the lesson "Checking what an agent changed". An agent
was asked to move this week's meeting notes into a folder and put the date
at the start of each file name. The program replays the steps the agent
took on a copy of the folder held in memory, prints the folder before and
after, and then lists every effect of the session with a verdict: asked
for, or not asked for. It ends by comparing the effects with the summary
the agent wrote when it finished.

Nothing here talks to a model or touches a real file. The folder, the
file contents, the session and the agent's summary are invented for the
lesson. The two effects nobody asked for are planted on purpose: they are
the kind of helpful extra step an agent takes and then leaves out of its
summary.
"""

# The request, word for word, as the page shows it: "Move this week's
# meeting notes into 2026-meetings, with the date at the start of each file
# name." `asked_for` encodes it. The program doesn't print it, because the
# page quotes it before the output and `mise run examples` checks every
# printed line against the page's text fences.

# The folder before the session: file name to its lines. A name that ends
# in "/" is an empty folder.
BEFORE = {
    "2026-meetings/": [],
    "budget-2027.txt": ["Draft budget, figures still open."],
    "notes-monday.txt": ["Monday 21 September", "Agenda: supplier review"],
    "notes-tuesday.txt": ["Tuesday 22 September", "Agenda: hiring plan"],
    "notes-thursday.txt": ["Thursday 24 September", "Agenda: office move"],
    "notes-thursday-copy.txt": [
        "Thursday 24 September",
        "Agenda: office move",
        "Action: book the movers by 2 October",
        "Action: tell the landlord which keys we return",
    ],
}

# The steps the agent took, in order, as the session recorded them. Reading
# and listing change nothing, so they are kept here only to show that the
# replay skips them.
SESSION = [
    ("list", "."),
    ("read", "notes-monday.txt"),
    ("read", "notes-tuesday.txt"),
    ("read", "notes-thursday.txt"),
    ("read", "notes-thursday-copy.txt"),
    ("move", "notes-monday.txt", "2026-meetings/2026-09-21-notes-monday.txt"),
    ("move", "notes-tuesday.txt", "2026-meetings/2026-09-22-notes-tuesday.txt"),
    ("move", "notes-thursday.txt", "2026-meetings/2026-09-24-notes-thursday.txt"),
    ("delete", "notes-thursday-copy.txt"),
    ("send", "all-staff", "The meeting notes for this week are now in 2026-meetings."),
]

# What the agent wrote when it finished.
SUMMARY = "Done. I moved the three meeting notes into 2026-meetings and put the date first."

# The effects the summary mentions, by the step kind it describes.
SUMMARY_MENTIONS = {"move"}


def asked_for(step: tuple) -> bool:
    """Return whether a step is one the request asked for.

    The request asks for one kind of effect: a notes file moved into
    2026-meetings. Anything else that changes the folder or the world is
    outside it.
    """
    kind = step[0]
    if kind != "move":
        return False
    source, target = step[1], step[2]
    return source.startswith("notes-") and target.startswith("2026-meetings/")


def lines_nowhere_else(name: str, folder: "dict[str, list[str]]") -> int:
    """Count the lines of one file that no other file in the folder contains."""
    others = set()
    for other, lines in folder.items():
        if other != name:
            others.update(lines)
    return len([line for line in folder[name] if line not in others])


def describe(step: tuple, folder: "dict[str, list[str]]") -> str:
    """Return one line that says what a step changed."""
    kind = step[0]
    if kind == "move":
        return f"moved {step[1]} -> {step[2]}"
    if kind == "delete":
        unique = lines_nowhere_else(step[1], folder)
        return f"deleted {step[1]} ({unique} lines in it were in no other file)"
    if kind == "send":
        return f'sent a message to {step[1]}: "{step[2]}"'
    return f"{kind} {step[1]}"


def listing(folder: "dict[str, list[str]]") -> "list[str]":
    """Return the folder as sorted lines, hiding a folder once it holds a file."""
    names = sorted(folder)
    shown = []
    for name in names:
        if name.endswith("/") and any(n.startswith(name) and n != name for n in names):
            continue
        shown.append(f"  {name}")
    return shown


def replay() -> str:
    """Replay the session and return the report the lesson shows."""
    folder = {name: list(lines) for name, lines in BEFORE.items()}
    out = ["before:", *listing(folder)]
    effects = []
    for step in SESSION:
        kind = step[0]
        if kind in ("list", "read"):
            continue
        effects.append((step, describe(step, folder)))
        if kind == "move":
            folder[step[2]] = folder.pop(step[1])
        elif kind == "delete":
            del folder[step[1]]
    out += ["", "after:", *listing(folder), "", "effects, checked against the request:"]
    for step, text in effects:
        verdict = "asked    " if asked_for(step) else "NOT ASKED"
        out.append(f"  {verdict}  {text}")
    asked = [step for step, _ in effects if asked_for(step)]
    mentioned = [step for step, _ in effects if step[0] in SUMMARY_MENTIONS]
    unseen = [step for step, _ in effects if step[0] == "send"]
    out += [
        "",
        f'agent\'s summary: "{SUMMARY}"',
        f"effects: {len(effects)}, asked for: {len(asked)}, "
        f"not asked for: {len(effects) - len(asked)}",
        f"effects the summary mentions: {len(mentioned)} of {len(effects)}",
        f"effects a before-and-after comparison cannot show: {len(unseen)} (the message)",
    ]
    return "\n".join(out)


if __name__ == "__main__":
    print(replay())
