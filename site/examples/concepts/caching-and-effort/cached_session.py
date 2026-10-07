"""Build the usage report for the lesson "Caching and effort".

A chat with an assistant: the instructions, then a long contract pasted with
the first question, then short questions about it. Every request sends the
instructions plus the whole history so far plus the new text, as in the
lesson "Reading the token counts".

The report prices each request twice. Without a cache, all input is billed
at the normal input price. With a cache, the part of the input that the
previous request already sent is read from the cache, and the rest is
written to it, as a tool does when it caches everything up to the newest
message. A request after a break longer than the cache lifetime finds no
cache and writes everything again.

The token counts are round illustrative numbers chosen for the lesson. The
input and output prices are the example prices for "a large model" from the
lesson "What every token costs". The cache prices apply the multipliers the
vendor's pricing page lists for most models: a write to the five-minute
cache costs 1.25 times the input price, and a read costs 0.1 times.
"""

# Example prices in dollars per million tokens.
INPUT_PRICE = 6.0
OUTPUT_PRICE = 30.0
CACHE_WRITE_PRICE = INPUT_PRICE * 1.25
CACHE_READ_PRICE = INPUT_PRICE * 0.1

INSTRUCTIONS = 1_000

# Each step is (what was new, tokens of the new text, tokens of the reply,
# whether the cache had expired before the request).
SESSION = [
    ("pastes a contract, asks what it covers", 20_000, 500, False),
    ("asks when the contract ends", 15, 120, False),
    ("asks about the penalties", 20, 300, False),
    ("asks for a summary for the manager", 25, 400, False),
    ("after lunch, asks who signed it", 15, 80, True),
]


def cost(tokens: int, price: float) -> float:
    """Return the price in dollars of `tokens` tokens at `price` per million."""
    return tokens * price / 1_000_000


def requests() -> "list[tuple[str, int, int, int, int]]":
    """Return (what was new, input, written, read, output) for every request."""
    rows = []
    history = 0
    previous_input = 0
    for label, new, reply, expired in SESSION:
        input_tokens = INSTRUCTIONS + history + new
        read = 0 if expired else previous_input
        written = input_tokens - read
        rows.append((label, input_tokens, written, read, reply))
        history += new + reply
        previous_input = input_tokens
    return rows


def money(value: float) -> str:
    """Return a dollar amount with four decimals."""
    return f"${value:.4f}"


def money2(value: float) -> str:
    """Return a price per million tokens with two decimals."""
    return f"${value:.2f}"


def line(name: str, input_tokens: int, written: int, read: int, output: int) -> str:
    """Return one row: the counts, then the cost without and with the cache."""
    plain = cost(input_tokens, INPUT_PRICE) + cost(output, OUTPUT_PRICE)
    cached = (
        cost(written, CACHE_WRITE_PRICE) + cost(read, CACHE_READ_PRICE) + cost(output, OUTPUT_PRICE)
    )
    return (
        f"{name:42}{input_tokens:>8,}{written:>8,}{read:>8,}{output:>7,}"
        f"{money(plain):>10}{money(cached):>10}"
    )


def main() -> None:
    lines = [
        "one chat, priced without and with a prompt cache",
        f"prices per million tokens: input {money2(INPUT_PRICE)}, output {money2(OUTPUT_PRICE)},"
        f" cache write {money2(CACHE_WRITE_PRICE)}, cache read {money2(CACHE_READ_PRICE)}",
        f"{'request':42}{'input':>8}{'written':>8}{'read':>8}{'output':>7}"
        f"{'no cache':>10}{'cached':>10}",
    ]
    rows = requests()
    for number, (label, input_tokens, written, read, output) in enumerate(rows, start=1):
        lines.append(line(f"{number}. {label}", input_tokens, written, read, output))
    totals = [sum(row[i] for row in rows) for i in range(1, 5)]
    lines.append(line("total", totals[0], totals[1], totals[2], totals[3]))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
