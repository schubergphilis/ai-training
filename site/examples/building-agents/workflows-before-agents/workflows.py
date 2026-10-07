"""The complete program behind the lesson "Workflows before agents".

Run any step with:  python3 workflows.py <step>   where step is one of the
names in STEPS below. The lesson's examples run these in CI.

A small shop answers customer emails. Each model call is a fake: a
function that reads its prompt name and its input and returns text, so
every run prints the same result. The code around the calls is the
workflow, and it decides which call runs next. No call decides that.
"""

import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

ORDERS = {
    "1042": {"item": "kettle", "days_since_delivery": 12},
    "1131": {"item": "toaster", "days_since_delivery": 41},
}

REFUND_DAYS = 30

SECONDS_PER_CALL = 2

calls: list[str] = []


def model(prompt: str, text: str) -> str:
    """One fake model call. Each prompt name has its own hand-written behavior."""
    calls.append(prompt)
    return FAKE_PROMPTS[prompt](text)


def order_id_in(text: str) -> str:
    for word in text.replace(".", " ").replace(",", " ").replace(":", " ").split():
        if word.isdigit() and len(word) == 4:
            return word
    return "none"


def fake_extract(email: str) -> str:
    wants = "refund" if "money back" in email else "replacement"
    return f"order={order_id_in(email)} wants={wants}"


def fake_write(facts: str) -> str:
    order_id, item, wants = facts.split()
    return f"Dear customer, a {wants} for the {item} of order {order_id} is on its way."


def fake_classify(email: str) -> str:
    if "money back" in email:
        return "refund"
    if "how" in email.lower() and "?" in email:
        return "question"
    if "broke" in email or "stopped working" in email:
        return "repair"
    return "other"


def fake_refund(email: str) -> str:
    order_id = order_id_in(email)
    if order_id not in ORDERS:
        return "(no known order, the email goes to a person)"
    days = ORDERS[order_id]["days_since_delivery"]
    if days <= REFUND_DAYS:
        return f"Your refund for order {order_id} is on its way."
    return f"Order {order_id} was delivered {days} days ago, past the {REFUND_DAYS}-day limit."


def fake_repair(email: str) -> str:
    return f"Please send the item of order {order_id_in(email)} back, and we repair it."


def fake_question(email: str) -> str:
    return "Descale the kettle with vinegar once a month."


def fake_reply(email: str) -> str:
    return f"Dear customer, a new kettle for order {order_id_in(email)} is on its way."


def fake_screen(email: str) -> str:
    return "flag: card number" if "card number" in email else "ok"


VOTES = ["refund", "replacement", "refund"]


def fake_vote(text: str) -> str:
    """Sample n of the same question. The answers differ, as samples of a real model can."""
    return VOTES[int(text.split("|")[0])]


FAKE_PROMPTS: dict[str, Callable[[str], str]] = {
    "extract": fake_extract,
    "write": fake_write,
    "classify": fake_classify,
    "refund": fake_refund,
    "repair": fake_repair,
    "question": fake_question,
    "reply": fake_reply,
    "screen": fake_screen,
    "vote": fake_vote,
}

EMAILS = {
    "a1": "Order 1042: the kettle stopped working after a week. Please send a replacement.",
    "a2": "My toaster stopped working. Please send a replacement.",
    "b1": "I want my money back for order 1042.",
    "b2": "I want my money back for order 1131.",
    "b3": "How do I clean the kettle from order 1042?",
    "b4": "Do you sell gift cards?",
    "c1": "Order 1042 broke. My card number is on the receipt photo I sent.",
    "c2": "Order 1042 broke again. I am done with this kettle.",
}


# Pattern one: a chain. Each call works on the output of the one before,
# and code between the calls checks the output before the next call.


def gate(extracted: str) -> str:
    """Code, not a model: the order must exist before the reply is written."""
    order_id = extracted.split()[0].replace("order=", "")
    if order_id not in ORDERS:
        return ""
    return f"{order_id} {ORDERS[order_id]['item']} {extracted.split()[1].replace('wants=', '')}"


def chain(email_id: str) -> None:
    calls.clear()
    print(f"chain, email {email_id}")
    extracted = model("extract", EMAILS[email_id])
    print(f"  call 1 extract: {extracted}")
    facts = gate(extracted)
    if not facts:
        print("  gate: no known order, the email goes to a person")
    else:
        print(f"  gate: order {facts.split()[0]} found")
        print(f"  call 2 write: {model('write', facts)}")
    print(f"  model calls: {len(calls)}")


def step_chain() -> None:
    chain("a1")
    chain("a2")


# Pattern two: a route. One call sorts the email into a class, and code
# sends it to the prompt for that class. A class with no prompt goes to a person.

ROUTES = {"refund": "refund", "repair": "repair", "question": "question"}


def step_route() -> None:
    calls.clear()
    print("route, four emails")
    for email_id in ["b1", "b2", "b3", "b4"]:
        label = model("classify", EMAILS[email_id])
        if label in ROUTES:
            answer = model(ROUTES[label], EMAILS[email_id])
        else:
            answer = "(no prompt for this class, the email goes to a person)"
        print(f"  {email_id} {label:<8} {answer}")
    print(f"  model calls: {len(calls)}")


# Pattern three: parallel calls. Sectioning runs different calls on the
# same input at once. Voting asks the same question several times.


def timing(n_calls: int) -> str:
    one_after_another = n_calls * SECONDS_PER_CALL
    return f"{one_after_another} s one after another, {SECONDS_PER_CALL} s at once"


def step_parallel() -> None:
    print(f"parallel, at {SECONDS_PER_CALL} s per model call")
    calls.clear()
    email = EMAILS["c1"]
    with ThreadPoolExecutor(max_workers=3) as pool:
        reply, screen = pool.map(lambda prompt: model(prompt, email), ["reply", "screen"])
    print("  sections, email c1")
    print(f"    reply:  {reply}")
    print(f"    screen: {screen}")
    if screen == "ok":
        print("    the reply is sent")
    else:
        print("    the reply waits until a person removes the card number from the email")
    print(f"    model calls: {len(calls)}, {timing(len(calls))}")
    calls.clear()
    email = EMAILS["c2"]
    with ThreadPoolExecutor(max_workers=3) as pool:
        votes = list(pool.map(lambda n: model("vote", f"{n}|{email}"), range(3)))
    winner, count = Counter(votes).most_common(1)[0]
    print("  votes, email c2, refund or replacement?")
    print(f"    votes: {' '.join(votes)}")
    print(f"    majority: {winner}, {count} of {len(votes)}")
    print(f"    model calls: {len(calls)}, {timing(len(calls))}")


STEPS: dict[str, Callable[[], None]] = {
    "chain": step_chain,
    "route": step_route,
    "parallel": step_parallel,
}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in STEPS:
        print(f"usage: python3 workflows.py {{{'|'.join(STEPS)}}}")
        sys.exit(2)
    STEPS[sys.argv[1]]()
