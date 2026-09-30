"""A simulation of a slanted ranker, run twice with the name lists swapped.

This is not a model. It is a small, constructed program that stands in for
one, so that a lesson can show how a slant that is invisible in a single
ranking becomes visible in the totals. The candidate records, the names and
the size of the slant are made up for the lesson, and the numbers it prints
are evidence about this program only.

The ranker scores each record from three fields (years of experience,
certificates, months since the last role) and adds a small bonus when the
name on the record is on list A. That bonus stands for what a real model
absorbs from training data and tuning: some names appeared more often next
to senior roles in the text it learned from, so they read as a better fit
for the same record.

The script ranks the same twelve records twice. In run 1 half the records
(the even indexes) get names from list A and the other half names from
list B. In run 2 the lists are swapped, so every record has had one name
from each list. Under a fair ranker the two runs would shortlist the same
records, and each list would be shortlisted exactly once per record, so
the totals over both runs would be equal. A difference in the totals is
the ranker's slant and nothing else. The bonus is two points and the
records are chosen so that no two records tie at the shortlist line in
either run, so the tie-break on record order never decides the shortlist.

Usage: python3 rank.py [--totals]

Without a flag, prints both rankings with scores and the totals. With
`--totals`, prints only the totals line.

The lesson page runs a port of this program in the browser,
`site/src/scripts/bias-in-patterns-ranker-logic.ts`, with the bonus on a
slider. A change to the ranking here needs the same change there.

Standard library only, Python 3.9 or later.
"""

import sys

SHORTLIST = 6

# (years of experience, certificates, months since the last role)
# The last field prints as `gap`.
RECORDS: list[tuple[int, int, int]] = [
    (7, 2, 3),
    (4, 1, 4),
    (6, 0, 3),
    (5, 1, 1),
    (5, 0, 1),
    (3, 2, 2),
    (4, 1, 3),
    (6, 1, 2),
    (2, 2, 3),
    (4, 1, 0),
    (7, 2, 4),
    (4, 2, 1),
]

# Two lists of invented names. The given names and surnames are mixed
# across both lists on purpose, so neither list reads as one group. The
# lists stand for any two groups a real model might treat differently.
LIST_A = [
    "Arvel Dunmoor",
    "Brisa Okonde",
    "Corin Halvane",
    "Dessa Tesfay",
    "Elior Vance",
    "Fenwick Sabani",
]
LIST_B = [
    "Marisel Adair",
    "Nadir Kesrou",
    "Oriel Morrow",
    "Pell Varnava",
    "Quilla Tallent",
    "Rashon Belka",
]

# The slant: a bonus a fair ranker would not have. A real model has no
# such line in it; the effect is spread through its weights.
LIST_A_BONUS = 2


def group_of(name: str) -> str:
    """Return the list a name belongs to, "A" or "B"."""
    return "A" if name in LIST_A else "B"


def fair_score(record: tuple[int, int, int]) -> int:
    """Score a record from its fields only."""
    years, certificates, gap_months = record
    return 3 * years + 2 * certificates - gap_months


def slanted_score(record: tuple[int, int, int], name: str) -> int:
    """Score a record the way the simulated ranker does: fields plus the name bonus."""
    score = fair_score(record)
    if group_of(name) == "A":
        score += LIST_A_BONUS
    return score


def assign_names(swapped: bool) -> list[str]:
    """Give each record a name: list A on even indexes and list B on odd ones, or the reverse."""
    first, second = (LIST_B, LIST_A) if swapped else (LIST_A, LIST_B)
    names: list[str] = []
    for index in range(len(RECORDS)):
        names.append(first[index // 2] if index % 2 == 0 else second[index // 2])
    return names


def rank(names: list[str]) -> list[tuple[int, int, str]]:
    """Rank the records under the given names, best first. Ties keep record order."""
    scored = [
        (slanted_score(record, names[index]), index, names[index])
        for index, record in enumerate(RECORDS)
    ]
    return sorted(scored, key=lambda entry: (-entry[0], entry[1]))


def tally(ranking: list[tuple[int, int, str]]) -> dict[str, int]:
    """Count how many of the shortlisted names come from each list."""
    counts = {"A": 0, "B": 0}
    for _score, _index, name in ranking[:SHORTLIST]:
        counts[group_of(name)] += 1
    return counts


def print_ranking(title: str, ranking: list[tuple[int, int, str]]) -> None:
    """Print one ranking with a line per record and a marker on the shortlist."""
    print(title)
    for position, (score, index, name) in enumerate(ranking, start=1):
        years, certificates, gap_months = RECORDS[index]
        marker = "shortlist" if position <= SHORTLIST else "         "
        print(
            f"  {position:2d}. {marker}  score {score:2d}  {name:<15} list {group_of(name)}"
            f"  (experience {years}, certificates {certificates}, gap {gap_months})"
        )


def totals_line(run_1: dict[str, int], run_2: dict[str, int]) -> str:
    """The one line the lesson asks the learner to predict."""
    total_a = run_1["A"] + run_2["A"]
    total_b = run_1["B"] + run_2["B"]
    return f"shortlisted over both runs: list A {total_a}, list B {total_b}"


def main(argv: list[str]) -> None:
    """Run both rankings and print them, or only the totals with `--totals`."""
    ranking_1 = rank(assign_names(swapped=False))
    ranking_2 = rank(assign_names(swapped=True))
    run_1 = tally(ranking_1)
    run_2 = tally(ranking_2)
    if "--totals" not in argv[1:]:
        print_ranking("Run 1", ranking_1)
        print(f"  shortlisted: list A {run_1['A']}, list B {run_1['B']}")
        print()
        print_ranking("Run 2: the same records, names swapped", ranking_2)
        print(f"  shortlisted: list A {run_2['A']}, list B {run_2['B']}")
        print()
    print(totals_line(run_1, run_2))


if __name__ == "__main__":
    main(sys.argv)
