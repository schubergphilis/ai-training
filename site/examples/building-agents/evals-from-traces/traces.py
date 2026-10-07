"""The trace viewer behind the lesson "Growing the evaluation set from traces".

The handbook assistant of the lesson "Gating a deploy on the evaluation" is
live for all staff, on the prompt in `prompts/current.txt`. It writes one trace
per run. A team reads a sample of those traces every week. The files
`week1.csv` and `week2.csv` hold the runs of two weekly samples: the run id,
the day, the employee number of the person who asked, and the question. This
script runs the agent on each question, so every trace is what the agent does
today, and prints the traces for a person to read and label.

  python3 traces.py week 1          every run of the week 1 sample, with its answer
  python3 traces.py show w1-04      the trace records of one run, one JSON object per line
  python3 traces.py ask current "How many days of sick leave do I get?"
                                    one question on one prompt, to check a case

Each trace record has the fields of the lesson "Recording and grading the path
the agent took", without the token counts, the latency and the cost, and with
`user` added. The questions, the people and their employee numbers are
invented. A real trace store holds what real people typed.
"""

import csv
import json
import os
import sys
from pathlib import Path

# Needed under PYTHONSAFEPATH=1, which keeps the script's directory off sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import agent
import gate

HERE = Path(__file__).resolve().parent
LIVE = "current"
USAGE = "steps: week <n>, show <run>, ask <prompt> <question>"


def load_week(week: str) -> list[dict[str, str]]:
    path = HERE / f"week{week}.csv"
    if not path.exists():
        raise SystemExit(f"no file week{week}.csv\n{USAGE}")
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def find_run(run_id: str) -> dict[str, str]:
    week = run_id.split("-")[0][1:]
    for run in load_week(week):
        if run["run"] == run_id:
            return run
    raise SystemExit(f"no run {run_id} in week{week}.csv")


def trace(run: dict[str, str]) -> list[dict]:
    """The records the live assistant writes for one run: the search, then the model call."""
    result = agent.answer(run["question"], gate.load_prompt(LIVE))
    return [
        {
            "run": run["run"],
            "span": 1,
            "kind": "tool",
            "name": "execute_tool search_docs",
            "tool": "search_docs",
            "args": {"query": run["question"]},
            "result": {"name": result["name"]},
            "user": run["user"],
        },
        {
            "run": run["run"],
            "span": 2,
            "kind": "model",
            "name": "chat fake-model",
            "asked": "answer",
            "answer": result["answer"],
            "user": run["user"],
        },
    ]


def week(number: str) -> None:
    runs = load_week(number)
    print(f"week {number} sample: {len(runs)} runs")
    for run in runs:
        answer = trace(run)[-1]["answer"]
        print(f"{run['run']} {run['day']}  {run['question']}")
        print(f"      answer: {answer}")


def show(run_id: str) -> None:
    for record in trace(find_run(run_id)):
        print(json.dumps(record))


def ask(prompt: str, question: str) -> None:
    result = agent.answer(question, gate.load_prompt(prompt))
    print(f"search returned: {result['name'] or 'no page'}")
    print(f"answer: {result['answer']}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "week":
        week(args[1])
    elif len(args) == 2 and args[0] == "show":
        show(args[1])
    elif len(args) == 3 and args[0] == "ask":
        ask(args[1], args[2])
    else:
        raise SystemExit(USAGE)
