"""A toy model that answers one fixed question, run several times.

The model of the lesson "Same prompt, different answer": five candidate
answers with made-up scores, the same idea as the sampling widget in "How a
language model works". The scores never change between runs. The pick does.
The widget on the lesson page is a port of this program with fresh random
numbers on every press.

    sample.py --temperature 0 --runs 10 --quiet
    sample.py --temperature 1.0 --runs 10
    sample.py --temperature 0 --runs 10 --jitter
    sample.py --temperature 1.0 --runs 10 --check

The random numbers come from a fixed seed, so greedy.py, sampled.py,
jitter.py and checked.py print the same lines on every machine, and the page
shows those lines as recorded runs. --seed with another number gives other
runs.
"""

import argparse
import math
import random
import sys

QUESTION = "What is the capital of Australia?"

# Candidate answers and their scores. The numbers are invented, like the
# widget's, and only their order and distance matter.
CANDIDATES = [
    ("Canberra", 3.0),
    ("Canberra.", 2.4),
    ("The capital of Australia is Canberra.", 2.0),
    ("It's Canberra.", 1.2),
    ("Sydney", 0.4),
]

# How much --jitter shakes each score before the pick. Real serving adds a
# far smaller wobble from floating-point rounding. This one is large enough
# to see in ten runs.
JITTER = 0.4


def probabilities(scores, temperature):
    """Turn scores into probabilities. Temperature 0 puts all of it on the top score."""
    if temperature <= 0:
        top = max(scores)
        return [1.0 if s == top else 0.0 for s in scores]
    weights = [math.exp(s / temperature) for s in scores]
    total = sum(weights)
    return [w / total for w in weights]


def pick(rng, temperature, jitter):
    """One run: shake the scores if asked, then draw one answer."""
    scores = [score for _, score in CANDIDATES]
    if jitter:
        scores = [score + rng.gauss(0, JITTER) for score in scores]
    probs = probabilities(scores, temperature)
    draw = rng.random()
    running = 0.0
    for (answer, _), p in zip(CANDIDATES, probs):
        running += p
        if draw < running:
            return answer
    return CANDIDATES[-1][0]


def passes(answer):
    """The check a workflow can apply: the answer names Canberra, in any wording."""
    return "canberra" in answer.lower()


def main(argv):
    parser = argparse.ArgumentParser(description="Answer one fixed question several times.")
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--seed", type=int, default=51)
    parser.add_argument("--jitter", action="store_true", help="shake the scores before each pick")
    parser.add_argument(
        "--check", action="store_true", help="report whether each answer passes the check"
    )
    parser.add_argument("--quiet", action="store_true", help="print the summary lines only")
    args = parser.parse_args(argv[1:])

    rng = random.Random(args.seed)
    answers = [pick(rng, args.temperature, args.jitter) for _ in range(args.runs)]

    if not args.quiet:
        print(f"{QUESTION} (temperature {args.temperature:.1f}, {args.runs} runs)")
        for i, answer in enumerate(answers, start=1):
            if args.check:
                mark = "pass" if passes(answer) else "FAIL"
                print(f"{i:>2}  {mark}  {answer}")
            else:
                print(f"{i:>2}  {answer}")
    same = sum(1 for a in answers if a == answers[0])
    print(f"{same} of {len(answers)} runs give the same answer as run 1")
    if args.check:
        ok = sum(1 for a in answers if passes(a))
        print(f"{ok} of {len(answers)} runs pass the check: the answer names Canberra")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
