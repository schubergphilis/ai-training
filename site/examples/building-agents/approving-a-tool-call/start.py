"""The starting program of the lesson "Approving a risky tool call".

Run it with:  python3 start.py

This is the loop from "When a tool fails" with two tools: lookup_order reads
an order, and issue_refund sends money back. Nothing stops the refund, so
the wrong amount in the question goes straight through. The exercise is to
add the approval step that agent.py has.
"""

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
    },
    "issue_refund": {
        "fn": issue_refund,
        "description": "Refund an amount to the customer. Args: order_id (str), amount (str).",
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


def run(question, tools=TOOLS, model=fake_model, max_steps=5, max_errors=2):
    messages = [{"role": "user", "content": question}]
    errors_in_a_row = 0
    for _ in range(max_steps):
        reply = model(messages)
        if "answer" in reply:
            return {"stop": "end_turn", "answer": reply["answer"], "messages": messages}
        tool = tools[reply["tool"]]
        result = tool["fn"](**reply["args"])
        messages.append({"role": "assistant", "content": reply})
        messages.append({"role": "tool", "content": result, "is_error": is_error(result)})
        errors_in_a_row = errors_in_a_row + 1 if is_error(result) else 0
        if errors_in_a_row >= max_errors:
            return {"stop": "too_many_errors", "answer": None, "messages": messages}
    return {"stop": "max_steps", "answer": None, "messages": messages}


def show(outcome) -> None:
    for message in outcome["messages"]:
        print(f"{message['role']}: {message['content']!r}")
    print(f"stop: {outcome['stop']}")
    if outcome["answer"] is not None:
        print(f"answer: {outcome['answer']}")
    print(f"refunds: {REFUNDS}")


WRONG_AMOUNT = "Order A17 arrived broken, please refund 400.00 EUR."


if __name__ == "__main__":
    show(run(WRONG_AMOUNT))
