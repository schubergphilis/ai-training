"""Build the usage reports for the lesson "Reading the token counts".

Each session below is a list of steps. A step adds new text to the
conversation (a question, a pasted document, a tool result) and gets a reply
of a given length. Every request sends the instructions (and, for an agent,
the tool descriptions) plus the whole history so far plus the new text, so
its input count is everything before it. Its output count is the reply.

All token counts are round illustrative numbers chosen for the lesson, and
the prices are the example prices for "a large model" from the lesson "What
every token costs". Neither is a vendor quote.
"""

# Example prices in dollars per million tokens, as in "What every token costs".
INPUT_PRICE = 6.0
OUTPUT_PRICE = 30.0

# A chat: the assistant's instructions, then five questions. Requests 2 and 4
# paste a document along with the question. Each step is
# (what was new, tokens of the new text, tokens of the reply).
CHAT_INSTRUCTIONS = 500
CHAT = [
    ("asks what a kickoff email holds", 15, 400),
    ("pastes meeting notes, asks for a draft", 1_520, 350),
    ("asks to make it shorter", 10, 200),
    ("pastes a budget sheet, asks to add it", 2_020, 250),
    ("asks for a subject line", 12, 15),
]

# One prompt to an agent with two tools, as in "One prompt, many requests":
# list the notes folder, read one note, answer. Its fixed part is the
# instructions plus the tool descriptions.
AGENT_FIXED = 800 + 600
AGENT = [
    ("the prompt", 30, 40),
    ("result: 3 file names", 60, 40),
    ("result: the text of one note", 2_400, 120),
]

# The exercise: a chat about planning a team day.
EXERCISE_INSTRUCTIONS = 500
EXERCISE = [
    ("asks for team day ideas", 20, 600),
    ("pastes a price list, asks which fits", 3_000, 300),
    ("asks for the invitation", 15, 250),
    ("asks if Friday is better", 8, 60),
]


def cost(tokens: int, price: float) -> float:
    """Return the price in dollars of `tokens` tokens at `price` per million."""
    return tokens * price / 1_000_000


def requests(fixed: int, steps: "list[tuple[str, int, int]]") -> "list[tuple[str, int, int]]":
    """Return (what was new, input tokens, output tokens) for every request."""
    rows = []
    history = 0
    for label, new, reply in steps:
        input_tokens = fixed + history + new
        rows.append((label, input_tokens, reply))
        history += new + reply
    return rows


def line(name: str, input_tokens: int, output_tokens: int) -> str:
    """Return one row of a report: counts, then the cost of each and the total."""
    cost_in = cost(input_tokens, INPUT_PRICE)
    cost_out = cost(output_tokens, OUTPUT_PRICE)
    return (
        f"{name:44}{input_tokens:>7,}{output_tokens:>8,}"
        f"{f'${cost_in:.4f}':>10}{f'${cost_out:.4f}':>10}{f'${cost_in + cost_out:.4f}':>10}"
    )


def report(title: str, fixed: int, steps: "list[tuple[str, int, int]]") -> "list[str]":
    """Return the lines of one usage report, with a total row."""
    lines = [
        title,
        f"{'request':44}{'input':>7}{'output':>8}{'input $':>10}{'output $':>10}{'total $':>10}",
    ]
    rows = requests(fixed, steps)
    for number, (label, input_tokens, output_tokens) in enumerate(rows, start=1):
        lines.append(line(f"{number}. {label}", input_tokens, output_tokens))
    total_in = sum(row[1] for row in rows)
    total_out = sum(row[2] for row in rows)
    lines.append(line("total", total_in, total_out))
    return lines


def main() -> None:
    blocks = [
        report("chat session", CHAT_INSTRUCTIONS, CHAT),
        report("one prompt to an agent", AGENT_FIXED, AGENT),
        report("exercise: chat about a team day", EXERCISE_INSTRUCTIONS, EXERCISE),
    ]
    _, new, reply = CHAT[-1]
    blocks.append([line("question 5 alone, in a new chat", CHAT_INSTRUCTIONS + new, reply)])
    print("\n\n".join("\n".join(block) for block in blocks))


if __name__ == "__main__":
    main()
