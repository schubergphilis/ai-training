"""The complete program behind the lesson "Approving a risky tool call".

Run any step with:  python3 agent.py <step>   where step is one of the
names in STEPS below. The lesson's Predict checkpoints run these in CI.

The `ask` step asks you at the keyboard. The `approved` and `refused` steps
feed a fixed answer to the same approval step, so CI can run them without a
person, and they print the answer as if it had been typed.

The loop is the one from "When a tool fails", with one change: before it
runs a tool marked `needs_approval`, it shows the call and its arguments to
a person and waits for a decision. A refusal goes back to the model as an
error result that holds the person's reason.
"""

import sys

ORDERS = {"A17": {"item": "kettle", "paid": "40.00 EUR"}}
REFUNDS = []


def lookup_order(order_id: str) -> dict:
    """Reads an order. Changes nothing."""
    order = ORDERS.get(order_id)
    if order is None:
        return {"ok": False, "error": f"no order {order_id}"}
    return {"ok": True, "item": order["item"], "paid": order["paid"]}


def issue_refund(order_id: str, amount: str) -> dict:
    """Sends money back to the customer. In this fixture it adds a line to REFUNDS."""
    REFUNDS.append((order_id, amount))
    return {"ok": True, "refunded": amount}


TOOLS = {
    "lookup_order": {
        "fn": lookup_order,
        "description": "The item and the amount paid for an order. Args: order_id (str).",
        "needs_approval": False,
    },
    "issue_refund": {
        "fn": issue_refund,
        "description": "Refund an amount to the customer. Args: order_id (str), amount (str).",
        "needs_approval": True,
    },
}


def fake_model(messages):
    """Looks the order up, then asks for a refund of the amount in the question."""
    question = messages[0]["content"]
    words = question.rstrip(".").split()
    order_id = words[1]
    amount = f"{words[-2]} {words[-1]}"
    last = messages[-1]
    if last["role"] == "user":
        return {"tool": "lookup_order", "args": {"order_id": order_id}}
    result = last["content"]
    if not result["ok"]:
        return {"answer": f"I did not refund order {order_id}. {result['error']}."}
    if "refunded" in result:
        return {"answer": f"Refunded {result['refunded']} for order {order_id}."}
    return {"tool": "issue_refund", "args": {"order_id": order_id, "amount": amount}}


def is_error(result) -> bool:
    return isinstance(result, dict) and result.get("ok") is False


def ask_person(name, args, read=input) -> dict:
    """Shows the call and every argument, then asks. Anything but y, or no input, is a refusal."""
    print(f"approve? {name}")
    for key, value in args.items():
        print(f"  {key} = {value!r}")
    try:
        if read("allow? [y/n] ").strip() == "y":
            return {"allow": True}
        return {"allow": False, "reason": read("reason: ").strip()}
    except EOFError:
        return {"allow": False, "reason": "no answer"}


def run(question, tools=TOOLS, model=fake_model, approve=ask_person, max_steps=5, max_errors=2):
    messages = [{"role": "user", "content": question}]
    errors_in_a_row = 0
    for _ in range(max_steps):
        reply = model(messages)
        if "answer" in reply:
            return {"stop": "end_turn", "answer": reply["answer"], "messages": messages}
        tool = tools[reply["tool"]]
        decision = {"allow": True}
        if tool["needs_approval"]:
            decision = approve(reply["tool"], reply["args"])
        if decision["allow"]:
            result = tool["fn"](**reply["args"])
        else:
            result = {"ok": False, "error": f"Refused by the reviewer: {decision['reason']}"}
        messages.append({"role": "assistant", "content": reply})
        messages.append({"role": "tool", "content": result, "is_error": is_error(result)})
        errors_in_a_row = errors_in_a_row + 1 if is_error(result) else 0
        if errors_in_a_row >= max_errors:
            return {"stop": "too_many_errors", "answer": None, "messages": messages}
    return {"stop": "max_steps", "answer": None, "messages": messages}


def typed(*answers):
    """A stand-in for input() that answers from a list and prints what it 'typed'."""
    queue = list(answers)

    def read(prompt: str) -> str:
        answer = queue.pop(0)
        print(f"{prompt}{answer}")
        return answer

    return read


def show(outcome) -> None:
    for message in outcome["messages"]:
        print(f"{message['role']}: {message['content']!r}")
    print(f"stop: {outcome['stop']}")
    if outcome["answer"] is not None:
        print(f"answer: {outcome['answer']}")
    print(f"refunds: {REFUNDS}")


def step_approved() -> None:
    def reviewer(name, args):
        return ask_person(name, args, read=typed("y"))

    show(run("Order A17 arrived broken, please refund 40.00 EUR.", approve=reviewer))


def step_refused() -> None:
    def reviewer(name, args):
        return ask_person(name, args, read=typed("n", "the customer paid 40.00 EUR"))

    show(run("Order A17 arrived broken, please refund 400.00 EUR.", approve=reviewer))


def step_ask() -> None:
    show(run("Order A17 arrived broken, please refund 400.00 EUR.", approve=ask_person))


STEPS = {
    "approved": step_approved,
    "refused": step_refused,
    "ask": step_ask,
}

if __name__ == "__main__":
    STEPS[sys.argv[1]]()
