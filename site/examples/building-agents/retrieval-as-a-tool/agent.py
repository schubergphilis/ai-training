"""The complete program behind the lesson "Retrieval as a tool the agent calls".

Run any step with:  python3 agent.py <step>   where step is one of the
names in STEPS below. The lesson's Predict checkpoints run these in CI.

A keyword search over the twelve handbook texts in `docs/` is the one tool.
The basic version calls it once per question, before the model sees the
question. The loop version lets a fake agent call it, read the result,
and search again. The fake model is a stand-in that answers with the
sentence of the retrieved passage that shares the most keywords with the
question, so every run prints the same thing and needs no API key.
"""

import re
import sys
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
DOCS = HERE / "docs"

# Words too common to tell one document from another.
STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "at",
    "before",
    "can",
    "do",
    "does",
    "for",
    "from",
    "get",
    "how",
    "i",
    "in",
    "is",
    "many",
    "much",
    "my",
    "of",
    "per",
    "see",
    "that",
    "the",
    "this",
    "to",
    "what",
    "when",
    "who",
    "with",
    "your",
}

# The prompt frame around the retrieved passages. A real model reads this
# text; the fake model below obeys it through the `covers` check.
FRAME = (
    "The passages below were retrieved from the company handbook for this question. "
    "Answer from them. Quote the sentence you relied on. "
    "If the passages do not cover the question, answer exactly: not found."
)

# How many keywords a sentence must share with the question before the fake
# model treats the passage as covering it. The exercise raises this.
MIN_SHARED = 2


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def keywords(text: str) -> list[str]:
    return sorted(set(words(text)) - STOPWORDS)


def load_docs() -> dict[str, str]:
    """Every `.txt` under docs/, by file name. A glob, so a stray file is ignored."""
    return {p.name: p.read_text(encoding="utf-8").strip() for p in sorted(DOCS.glob("*.txt"))}


CORPUS = load_docs()


# The tool.


def search_docs(query: str, skip: Optional[list[str]] = None) -> dict:
    """The best-matching document for the query, or an empty result.

    Scores each document by how many query keywords it contains. `skip` names
    documents already read, so a second search looks elsewhere.
    """
    terms = keywords(query)
    scores = {
        name: sum(1 for term in terms if term in set(words(text)))
        for name, text in CORPUS.items()
        if name not in (skip or [])
    }
    if not scores:  # every document was skipped, or docs/ is empty
        return {"ok": True, "name": None, "passage": ""}
    best = max(scores, key=lambda name: scores[name])  # the first document wins a tie
    if scores[best] == 0:
        return {"ok": True, "name": None, "passage": ""}
    return {"ok": True, "name": best, "passage": CORPUS[best]}


TOOLS = {
    "search_docs": {
        "fn": search_docs,
        "description": (
            "Search the handbook. Returns the best-matching passage. "
            "Args: query (str), skip (list of str, optional): names of documents already read."
        ),
    },
}


def build_prompt(passage: str, question: str) -> str:
    return f"{FRAME}\n\nPassages:\n{passage}\n\nQuestion: {question}"


# The fake model.


def sentences(passage: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=\.)\s+", passage) if s.strip()]


def shared(question: str, sentence: str) -> int:
    return len(set(keywords(question)) & set(words(sentence)))


def best_sentence(question: str, passage: str) -> str:
    return max(sentences(passage), key=lambda s: shared(question, s))


def covers(question: str, sentence: str, min_shared: int = MIN_SHARED) -> bool:
    """The fake model obeying the frame: enough of the question is in the sentence."""
    return shared(question, sentence) >= min_shared


def is_pointer(sentence: str) -> bool:
    """A sentence that sends the reader to another page instead of answering."""
    return ", see " in sentence


def fake_model(prompt: str, min_shared: int = MIN_SHARED) -> str:
    """Answers with the best sentence of the passage, or `not found` when the frame says so.

    `min_shared` at 1 stands for a prompt without the frame: any overlap is answered.
    """
    passage = prompt.split("Passages:\n", 1)[1].split("\n\nQuestion: ", 1)[0]
    question = prompt.rsplit("Question: ", 1)[1]
    if not passage.strip():
        return "not found"
    sentence = best_sentence(question, passage)
    if not covers(question, sentence, min_shared):
        return "not found"
    return sentence


# Basic retrieval: search once, then ask.


def answer_basic(question: str, min_shared: int = MIN_SHARED) -> dict:
    result = TOOLS["search_docs"]["fn"](question)
    reply = fake_model(build_prompt(result["passage"], question), min_shared)
    return {"name": result["name"], "answer": reply, "rounds": 1}


# The loop: the agent reads the result, judges it, and searches again.


def answer_with_loop(question: str, max_rounds: int = 3) -> dict:
    query = question
    read: list[str] = []
    for round_number in range(1, max_rounds + 1):
        result = TOOLS["search_docs"]["fn"](query, skip=read)
        if result["name"] is None:
            return {"name": None, "answer": "not found", "rounds": round_number}
        read.append(result["name"])
        sentence = best_sentence(query, result["passage"])
        print(f"round {round_number}: search_docs(query={query!r}) -> {result['name']}")
        if is_pointer(sentence):
            # Follow the pointer: keep the question's words and add the sentence's.
            query = " ".join(keywords(question + " " + sentence))
            continue
        if covers(query, sentence):
            return {"name": result["name"], "answer": sentence, "rounds": round_number}
        query = question
    return {"name": None, "answer": "not found", "rounds": max_rounds}


# The test set and the printing.

TEST_SET = [
    "How many days of annual leave do I get?",
    "How much holiday can I take?",
    "What is the training budget per year?",
    "How many days per week can I work from home?",
    "How many days ahead are flights booked?",
    "Who do I report a lost laptop to?",
]

MULTI_HOP = "Who approves a replacement laptop for the payments team?"
NO_ANSWER = "Can I bring my dog to the office?"


def show(number: int, question: str, result: dict) -> None:
    print(f"{number}. {question}")
    source = result["name"] if result["name"] is not None else "nothing retrieved"
    print(f"   {source}: {result['answer']}")


def list_sources(questions: list[str]) -> None:
    """One line per question: the document the answer came from, or `not found`."""
    answered = 0
    for number, question in enumerate(questions, 1):
        result = answer_basic(question)
        if result["answer"] == "not found":
            print(f"{number}. not found")
        else:
            print(f"{number}. {result['name']}")
            answered += 1
    print(f"answered: {answered} of {len(questions)}")


def run_test_set(questions: list[str]) -> None:
    answered = 0
    for number, question in enumerate(questions, 1):
        result = answer_basic(question)
        show(number, question, result)
        if result["answer"] != "not found":
            answered += 1
    print(f"answered: {answered} of {len(questions)}")


def step_prompt() -> None:
    result = TOOLS["search_docs"]["fn"](TEST_SET[0])
    print(build_prompt(result["passage"], TEST_SET[0]))


def step_basic() -> None:
    list_sources(TEST_SET)


def step_basic_answers() -> None:
    run_test_set(TEST_SET)


def step_multi_hop_basic() -> None:
    show(7, MULTI_HOP, answer_basic(MULTI_HOP))


def step_multi_hop_loop() -> None:
    result = answer_with_loop(MULTI_HOP)
    show(7, MULTI_HOP, result)
    print(f"rounds: {result['rounds']}")


def step_no_answer() -> None:
    print("without the frame:")
    show(8, NO_ANSWER, answer_basic(NO_ANSWER, min_shared=1))
    print("with the frame:")
    show(8, NO_ANSWER, answer_basic(NO_ANSWER))


STEPS = {
    "prompt": step_prompt,
    "basic": step_basic,
    "basic_answers": step_basic_answers,
    "multi_hop_basic": step_multi_hop_basic,
    "multi_hop_loop": step_multi_hop_loop,
    "no_answer": step_no_answer,
}

if __name__ == "__main__":
    STEPS[sys.argv[1]]()
