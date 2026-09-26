"""Reconstruct one agent session from its recorded log.

The fixture behind the lesson "Reading agent logs and rerunning after a
model change". A support team's agent answers customer emails. It may send
a reply to an order-status question, and it must leave any email about a
refund as a draft for a person. One customer got a reply that said their
refund was approved, and it was not. The program reads the session's log
line by line, picks out the tool calls that changed something outside the
session, and checks each change against the request. It then prints the
summary the agent wrote at the end, next to counts of the changes.

It prints only what the lesson page shows in a text fence, because
`mise run examples` checks the output against the page (the lesson file's
`proofs`, spec S03 "Examples").

Nothing here talks to a model or sends an email. The log, the emails, the
orders and the model name are invented for the lesson.
"""

from pathlib import Path

LOG = Path(__file__).with_name("session.log")

# Words that make an email "about a refund" for the request's rule.
REFUND_WORDS = ("refund", "money back")

# The tools that change something outside the session, and the word the
# reconstruction uses for each change. Every other tool only reads.
CHANGES = {"send_reply": "sent", "save_draft": "draft"}


def read_log(path: Path) -> "list[dict[str, str]]":
    """Read the log into one record per line, skipping the comment lines."""
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        time, session, model, event, target, text = [part.strip() for part in line.split("|", 5)]
        records.append(
            {
                "time": time,
                "session": session,
                "model": model,
                "event": event,
                "target": target,
                "text": text,
            }
        )
    return records


def tool_name(record: "dict[str, str]") -> str:
    """Return the tool a record called, or an empty string for other events."""
    event = record["event"]
    return event[len("tool ") :] if event.startswith("tool ") else ""


def about_refund(subject: str) -> bool:
    """Return whether an email subject is about a refund."""
    lowered = subject.lower()
    return any(word in lowered for word in REFUND_WORDS)


def main() -> None:
    records = read_log(LOG)
    subjects = {r["target"]: r["text"] for r in records if tool_name(r) == "read_email"}

    print("changed, checked against the request:")
    changes = [r for r in records if tool_name(r) in CHANGES]
    breaks = 0
    for r in changes:
        subject = subjects.get(r["target"], "?")
        verdict = "ok"
        change = CHANGES[tool_name(r)]
        if change == "sent" and about_refund(subject):
            verdict = "AGAINST THE REQUEST (about a refund, so a draft)"
            breaks += 1
        print(f"  {change:<5}  {r['target']}  {subject}")
        print(f"         reply: {r['text']}")
        print(f"         {verdict}")
    print()

    summary = [r["text"] for r in records if r["event"] == "summary"]
    sent = sum(1 for r in changes if CHANGES[tool_name(r)] == "sent")
    drafts = sum(1 for r in changes if CHANGES[tool_name(r)] == "draft")
    print(f'agent\'s summary: "{summary[0]}"')
    print(f"changes: {len(changes)}, sent: {sent}, drafts: {drafts}, against the request: {breaks}")


if __name__ == "__main__":
    main()
