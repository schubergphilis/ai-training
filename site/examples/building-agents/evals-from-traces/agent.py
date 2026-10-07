"""The handbook assistant of the lesson "Gating a deploy on the evaluation",
copied with only this docstring changed for the lesson "Growing the
evaluation set from traces".

One keyword search over the twelve handbook texts in `docs/`, then a fake
model that answers from the passage it was given. The prompt frame is a text
file in `prompts/`, one instruction per line. `prompts/current.txt` is the
prompt the rollout of that lesson took to all staff, and `prompts/stricter.txt`
is the stricter candidate of that lesson. The fake model reads the prompt it
gets, so a change to the prompt changes what it does, the way a change to a
real prompt would. Every run prints the same thing and needs no API key.
"""

import re
from pathlib import Path

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


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def keywords(text: str) -> list[str]:
    return sorted(set(words(text)) - STOPWORDS)


CORPUS = {p.name: p.read_text(encoding="utf-8").strip() for p in sorted(DOCS.glob("*.txt"))}


def search_docs(query: str) -> dict:
    """The document that contains the most query keywords, or an empty result."""
    terms = keywords(query)
    scores = {name: sum(1 for t in terms if t in set(words(text))) for name, text in CORPUS.items()}
    best = max(scores, key=lambda name: scores[name])  # the first document wins a tie
    if scores[best] == 0:
        return {"name": None, "passage": ""}
    return {"name": best, "passage": CORPUS[best]}


def build_prompt(prompt_lines: list[str], passage: str, question: str) -> str:
    frame = "\n".join(prompt_lines)
    return f"{frame}\n\nPassages:\n{passage}\n\nQuestion: {question}"


def sentences(passage: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=\.)\s+", passage) if s.strip()]


def shared(question: str, sentence: str) -> int:
    return len(set(keywords(question)) & set(words(sentence)))


def fake_model(prompt: str) -> str:
    """Answers with the passage sentence closest to the question.

    With the `not found` instruction in the prompt, it answers only when the
    sentence shares two or more keywords with the question. Without it, any
    shared keyword is enough, the way a model without that instruction tries
    to answer every question. With the instruction to answer only when one
    sentence covers the whole question, the sentence must contain every
    keyword of the question, the way a stricter model declines more.
    """
    frame, rest = prompt.split("\n\nPassages:\n", 1)
    passage, question = rest.split("\n\nQuestion: ", 1)
    if not passage.strip():
        return "not found"
    sentence = max(sentences(passage), key=lambda s: shared(question, s))
    needed = 2 if "answer exactly: not found" in frame else 1
    if "covers the whole question" in frame:
        needed = max(needed, len(keywords(question)))
    if shared(question, sentence) < needed:
        return "not found"
    return sentence


def answer(question: str, prompt_lines: list[str]) -> dict:
    result = search_docs(question)
    reply = fake_model(build_prompt(prompt_lines, result["passage"], question))
    return {"name": result["name"], "answer": reply}
