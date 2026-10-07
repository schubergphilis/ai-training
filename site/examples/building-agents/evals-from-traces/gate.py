"""The gate of the lesson "Gating a deploy on the evaluation", copied with
only this docstring changed for the lesson "Growing the evaluation set from
traces".

Run the gate on a candidate prompt with:  python3 gate.py <prompt>
where <prompt> is the name of a file in prompts/ without `.txt`, for example
`python3 gate.py shorter`. Two more steps take a prompt name too:
  python3 gate.py declined <prompt>     the items the prompt answers with `not found`
  python3 gate.py transcripts <prompt>  the items that fail on the prompt and pass
                                        on the current one, with both answers

The gate runs every item of `golden-set.csv`, the golden set of the lesson "A
golden set is the agent's regression suite" with six items added since, and
checks one threshold per metric (THRESHOLDS below). A hard gate that fails
blocks the deploy. A soft gate that fails lets it through only after a person
signs off. The agent under test is in agent.py.
"""

import csv
import math
import os
import sys
from pathlib import Path

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import agent

HERE = Path(__file__).resolve().parent
CURRENT = "current"

# One threshold per metric: the metric, hard or soft, and the lowest share of
# its items, in percent, that passes. The metrics are defined in METRICS.
THRESHOLDS = [
    ("refused", "hard", 100),
    ("routine", "hard", 90),
    ("helpful", "soft", 70),
]


def load_set() -> list[dict[str, str]]:
    with (HERE / "golden-set.csv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_prompt(name: str) -> list[str]:
    text = (HERE / "prompts" / f"{name}.txt").read_text(encoding="utf-8")
    return [line for line in text.splitlines() if line.strip()]


def passes(item: dict[str, str], result: dict) -> bool:
    """The check of the golden set lesson: the qualities the item expects."""
    if result["answer"] == "not found":
        return item["group"] == "refuse" or item["may_decline"] == "yes"
    if item["group"] == "refuse":
        return False  # any answer to a question the handbook doesn't cover is a failure
    right_source = result["name"] == item["source"]
    return right_source and item["mentions"].lower() in result["answer"].lower()


def refused(item: dict[str, str], result: dict) -> bool:
    return result["answer"] == "not found"


def helpful(item: dict[str, str], result: dict) -> bool:
    """A good answer that is an answer: `not found` passes the item, but helps nobody."""
    return result["answer"] != "not found" and passes(item, result)


# Each metric: the groups it counts, and the check an item of those groups must pass.
METRICS = {
    "refused": (["refuse"], refused),
    "routine": (["routine"], passes),
    "helpful": (["routine", "ambiguous"], helpful),
}


def run_all(prompt_lines: list[str]) -> dict[str, dict]:
    return {item["id"]: agent.answer(item["question"], prompt_lines) for item in load_set()}


def new_failures(name: str) -> list[str]:
    """The items that fail on the candidate and pass on the current prompt."""
    candidate = run_all(load_prompt(name))
    current = run_all(load_prompt(CURRENT))
    return [
        item["id"]
        for item in load_set()
        if not passes(item, candidate[item["id"]]) and passes(item, current[item["id"]])
    ]


def less_helpful(name: str) -> list[str]:
    """The items that get a helpful answer on the current prompt and not on the candidate."""
    candidate = run_all(load_prompt(name))
    current = run_all(load_prompt(CURRENT))
    return [
        item["id"]
        for item in load_set()
        if item["group"] != "refuse"
        and helpful(item, current[item["id"]])
        and not helpful(item, candidate[item["id"]])
    ]


def gate(name: str) -> None:
    items = load_set()
    results = run_all(load_prompt(name))
    print(f"prompt: {name}")
    failed_kinds = []
    for metric, kind, lowest in THRESHOLDS:
        groups, check = METRICS[metric]
        counted = [item for item in items if item["group"] in groups]
        passed = sum(1 for item in counted if check(item, results[item["id"]]))
        ok = passed >= math.ceil(len(counted) * lowest / 100)
        if not ok:
            failed_kinds.append(kind)
        score = f"{passed} of {len(counted)}"
        needs = f"needs {lowest}%"
        print(f"  {metric:<8} {kind:<5} {score:<9} {needs:<11} {'pass' if ok else 'FAIL'}")
    if name != CURRENT:
        print(f"new failures: {' '.join(new_failures(name)) or 'none'}")
        print(f"less helpful: {' '.join(less_helpful(name)) or 'none'}")
    if "hard" in failed_kinds:
        print("deploy: blocked")
    elif "soft" in failed_kinds:
        print("deploy: waits for a person to sign off")
    else:
        print("deploy: allowed")


def declined(name: str) -> None:
    """For each item the prompt answers with `not found`: the page and the closest sentence."""
    results = run_all(load_prompt(name))
    print(f"{'id':<4} {'group':<10} {'search returned':<17} closest sentence shares")
    for item in load_set():
        result = results[item["id"]]
        if result["answer"] != "not found":
            continue
        page = result["name"] or "no page"
        shares = "-"
        if result["name"]:
            question = item["question"]
            best = max(
                agent.sentences(agent.CORPUS[result["name"]]),
                key=lambda s: agent.shared(question, s),
            )
            count = agent.shared(question, best)
            shares = f"{count} keyword{'' if count == 1 else 's'}"
        print(f"{item['id']:<4} {item['group']:<10} {page:<17} {shares}")


def transcripts(name: str) -> None:
    """For each new failure: the question, the page the search returned and both answers."""
    candidate = run_all(load_prompt(name))
    current = run_all(load_prompt(CURRENT))
    failed = new_failures(name)
    for item in load_set():
        if item["id"] not in failed:
            continue
        result = candidate[item["id"]]
        print(f"{item['id']} ({item['group']}): {item['question']}")
        print(f"  search returned: {result['name']}")
        print(f"  {name}: {result['answer']}")
        print(f"  {CURRENT}: {current[item['id']]['answer']}")


STEPS = {"declined": declined, "transcripts": transcripts}

if __name__ == "__main__":
    if sys.argv[1] in STEPS:
        STEPS[sys.argv[1]](sys.argv[2])
    else:
        gate(sys.argv[1])
