"""Tests for scripts/next_wave.py, ported case by case from the Vitest tests
of the JavaScript tool it replaces (#492), plus tests of the command line
that runs `bun scripts/lesson-plan.mjs` and `gh`.

The one case about reading the course order from a course's `parts` moved
to site/tests/scripts/lesson-plan.test.ts, since lesson-plan computes the
course position now.
"""

import io
import json
import re
import subprocess
from collections.abc import Mapping, Sequence
from datetime import date
from typing import NotRequired, TypedDict, cast

import next_wave as nw
import pytest
from next_wave import (
    NITS_TITLE,
    NOT_IN_ONLY,
    IssueState,
    LessonsWave,
    PlannedLesson,
    ReadyIssue,
    WaveEntry,
    format_wave,
    parse_args,
    pick_wave,
)


class Lesson(TypedDict):
    id: str
    title: NotRequired[str]
    issue: NotRequired[int]
    serves: NotRequired[list[str]]
    assumes: NotRequired[list[str]]
    after: NotRequired[list[str]]


class Area(TypedDict):
    dir: str
    course: list[str]
    lessons: list[Lesson]


def plan(areas: Sequence[Area], live: Sequence[str] = ()) -> list[PlannedLesson]:
    """The lessons as lesson-plan prints them, with one course per area listing `course`."""
    out: list[PlannedLesson] = []
    for a in areas:
        for lesson in a["lessons"]:
            lesson_id = lesson["id"]
            position = a["course"].index(lesson_id) + 1 if lesson_id in a["course"] else None
            out.append(
                {
                    "id": lesson_id,
                    "area": a["dir"],
                    "title": lesson.get("title"),
                    "issue": lesson.get("issue"),
                    "position": position,
                    "after": lesson.get("after", []),
                    "assumes": lesson.get("assumes", []),
                    "serves": lesson.get("serves", []),
                    "live": lesson_id in live,
                }
            )
    return out


def issue(
    number: int,
    assignees: Sequence[str] = (),
    labels: Sequence[str] = (),
    body: str = "",
    blocked_by: Sequence[int] = (),
    foreign: Sequence[str] = (),
) -> ReadyIssue:
    return {
        "number": number,
        "title": f"Lesson #{number}",
        "assignees": list(assignees),
        "labels": list(labels),
        "body": body,
        "blockedBy": list(blocked_by),
        "foreignBlockedBy": list(foreign),
    }


def state(
    value: str = "OPEN", labels: Sequence[str] = (), pull_request: bool = False
) -> IssueState:
    return {
        "state": value,
        "labels": list(labels),
        "assignees": [],
        "pullRequest": pull_request,
        "blockedBy": [],
        "foreignBlockedBy": [],
    }


class Lookups:
    """A `Lookup` over planted states that records each number it was asked for."""

    def __init__(self, states: Mapping[int, IssueState]) -> None:
        self.states = states
        self.asked: list[int] = []

    def __call__(self, number: int) -> IssueState:
        self.asked.append(number)
        return self.states[number]


# The typed pickers behind `pick_wave`, for the tests that read one kind's fields.
lessons_wave = nw.pick_lessons_wave
content_wave = nw.pick_content_wave
code_wave = nw.pick_code_wave
harness_wave = nw.pick_harness_wave


def ids(entries: Sequence[object]) -> list[str]:
    return [cast("dict[str, str]", e)["id"] for e in entries]


# pickWave


def test_picks_planned_lessons_in_course_order_and_reports_the_course_position() -> None:
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/one", "a/two", "a/three"],
                "lessons": [
                    {"id": "a/three", "title": "Three", "issue": 3},
                    {"id": "a/one", "title": "One"},
                    {"id": "a/two", "title": "Two", "issue": 2},
                ],
            }
        ],
        live=["a/one"],
    )
    r = pick_wave(lessons, [issue(2), issue(3)], size=6)
    assert r == {
        "kind": "lessons",
        "size": 6,
        "only": None,
        "unblockersFirst": False,
        "wave": [
            {
                "issue": 2,
                "id": "a/two",
                "title": "Two",
                "area": "a",
                "position": 2,
                "afterPlanned": [],
                "unblocks": 0,
            },
            {
                "issue": 3,
                "id": "a/three",
                "title": "Three",
                "area": "a",
                "position": 3,
                "afterPlanned": [],
                "unblocks": 0,
            },
        ],
        "blocked": [],
        "skipped": [],
        "waiting": [],
        "notPicked": [],
    }


def test_leaves_out_a_lesson_that_already_has_a_page_even_when_its_issue_is_ready() -> None:
    lessons = plan(
        [{"dir": "a", "course": ["a/one"], "lessons": [{"id": "a/one", "issue": 1}]}],
        live=["a/one"],
    )
    r = pick_wave(lessons, [issue(1)], size=6)
    assert r == {
        "kind": "lessons",
        "size": 6,
        "only": None,
        "unblockersFirst": False,
        "wave": [],
        "blocked": [],
        "skipped": [],
        "waiting": [],
        "notPicked": [],
    }


def test_blocks_a_lesson_that_assumes_an_objective_only_a_planned_lesson_serves() -> None:
    # lesson-plan drops the `lesson` and `section` of an assumes entry and
    # keeps the objective, so the planted duplicate is a repeated objective.
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/one", "a/two", "a/three"],
                "lessons": [
                    {"id": "a/one", "serves": ["a/c/o1"]},
                    {"id": "a/two", "issue": 2, "serves": ["a/c/o2"]},
                    {"id": "a/three", "issue": 3, "assumes": ["a/c/o1", "a/c/o2", "a/c/o2"]},
                ],
            }
        ],
        live=["a/one"],
    )
    r = lessons_wave(lessons, [issue(2), issue(3)], size=6)
    assert ids(r["wave"]) == ["a/two"]
    assert r["blocked"] == [
        {"issue": 3, "id": "a/three", "blockedBy": [{"objective": "a/c/o2", "servedBy": ["a/two"]}]}
    ]


def test_does_not_block_a_lesson_whose_assumed_objective_a_live_lesson_serves_elsewhere() -> None:
    lessons = plan(
        [
            {"dir": "a", "course": ["a/one"], "lessons": [{"id": "a/one", "serves": ["a/c/o1"]}]},
            {
                "dir": "b",
                "course": ["b/one"],
                "lessons": [{"id": "b/one", "issue": 1, "assumes": ["a/c/o1"]}],
            },
        ],
        live=["a/one"],
    )
    r = lessons_wave(lessons, [issue(1)], size=6)
    assert ids(r["wave"]) == ["b/one"]
    assert r["blocked"] == []


def test_blocks_a_lesson_whose_assumed_objective_no_lesson_serves_and_says_so() -> None:
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/one"],
                "lessons": [{"id": "a/one", "issue": 1, "assumes": ["x/y/z"]}],
            }
        ]
    )
    r = lessons_wave(lessons, [issue(1)], size=6)
    assert r["wave"] == []
    assert r["blocked"] == [
        {"issue": 1, "id": "a/one", "blockedBy": [{"objective": "x/y/z", "servedBy": []}]}
    ]


def three_areas() -> list[PlannedLesson]:
    return plan(
        [
            {
                "dir": "a",
                "course": ["a/1", "a/2", "a/3"],
                "lessons": [
                    {"id": "a/1", "issue": 11},
                    {"id": "a/2", "issue": 12},
                    {"id": "a/3", "issue": 13},
                ],
            },
            {
                "dir": "b",
                "course": ["b/1", "b/2"],
                "lessons": [{"id": "b/1", "issue": 21}, {"id": "b/2", "issue": 22}],
            },
            {"dir": "c", "course": ["c/1"], "lessons": [{"id": "c/1", "issue": 31}]},
        ]
    )


def test_takes_lessons_round_robin_across_areas_in_area_order() -> None:
    ready = [issue(n) for n in [11, 12, 13, 21, 22, 31]]
    r = lessons_wave(three_areas(), ready, size=10)
    assert ids(r["wave"]) == ["a/1", "b/1", "c/1", "a/2", "b/2", "a/3"]
    assert r["waiting"] == []


def test_caps_the_wave_at_size_and_reports_the_rest_as_waiting_grouped_by_area() -> None:
    lessons = [lesson for lesson in three_areas() if lesson["area"] != "c"]
    ready = [issue(n) for n in [11, 12, 13, 21, 22]]
    r = lessons_wave(lessons, ready, size=3)
    assert ids(r["wave"]) == ["a/1", "b/1", "a/2"]
    assert r["skipped"] == []
    assert [(w["area"], ids(w["lessons"])) for w in r["waiting"]] == [
        ("a", ["a/3"]),
        ("b", ["b/2"]),
    ]


def test_defaults_the_size_to_six() -> None:
    planted: list[Lesson] = [{"id": f"a/{i}", "issue": i + 1} for i in range(8)]
    lessons = plan([{"dir": "a", "course": [x["id"] for x in planted], "lessons": planted}])
    r = lessons_wave(lessons, [issue(i + 1) for i in range(8)])
    assert r["size"] == 6
    assert len(r["wave"]) == 6
    assert [ids(w["lessons"]) for w in r["waiting"]] == [["a/6", "a/7"]]


def one_to_three() -> list[PlannedLesson]:
    return plan(
        [
            {
                "dir": "a",
                "course": ["a/1", "a/2", "a/3"],
                "lessons": [
                    {"id": "a/1", "issue": 1},
                    {"id": "a/2", "issue": 2},
                    {"id": "a/3", "issue": 3},
                ],
            }
        ]
    )


def test_skips_an_assigned_issue_and_an_issue_that_is_not_ready_and_says_why() -> None:
    r = lessons_wave(one_to_three(), [issue(1), issue(2, ["someone"])], size=6)
    assert ids(r["wave"]) == ["a/1"]
    assert r["skipped"] == [
        {"issue": 2, "id": "a/2", "reason": "issue is assigned to someone"},
        {"issue": 3, "id": "a/3", "reason": "issue is not ready-for-agent"},
    ]


def test_reports_planned_after_entries_and_picks_lessons_without_them_first() -> None:
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/live", "a/1", "a/2", "a/3"],
                "lessons": [
                    {"id": "a/live"},
                    {"id": "a/1", "issue": 1, "after": ["a/live", "a/3"]},
                    {"id": "a/2", "issue": 2, "after": ["a/live"]},
                    {"id": "a/3", "issue": 3},
                ],
            }
        ],
        live=["a/live"],
    )
    r = lessons_wave(lessons, [issue(1), issue(2), issue(3)], size=6)
    assert ids(r["wave"]) == ["a/2", "a/3", "a/1"]
    assert [w["afterPlanned"] for w in r["wave"]] == [[], [], ["a/3"]]


def test_falls_back_to_the_issue_title_and_sorts_an_unlisted_lesson_last() -> None:
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/2"],
                "lessons": [{"id": "a/1", "issue": 1}, {"id": "a/2", "issue": 2}],
            }
        ]
    )
    r = lessons_wave(lessons, [issue(1), issue(2)], size=6)
    assert [(w["id"], w["title"], w["position"]) for w in r["wave"]] == [
        ("a/2", "Lesson #2", 1),
        ("a/1", "Lesson #1", None),
    ]


def test_keeps_an_empty_lesson_title_as_javascripts_nullish_fallback_did() -> None:
    lessons = plan([{"dir": "a", "course": ["a/1"], "lessons": [{"id": "a/1", "issue": 1}]}])
    lessons[0]["title"] = ""
    r = lessons_wave(lessons, [issue(1)])
    assert r["wave"][0]["title"] == ""


def test_rejects_an_unknown_kind() -> None:
    with pytest.raises(ValueError, match="unknown kind"):
        pick_wave([], [], kind="nope")


def test_with_only_skips_every_planned_lesson_outside_the_whitelist_before_the_ready_check() -> (
    None
):
    r = lessons_wave(one_to_three(), [issue(1), issue(2)], only=[2], size=6)
    assert ids(r["wave"]) == ["a/2"]
    assert r["only"] == [2]
    assert r["notPicked"] == []
    assert r["skipped"] == [
        {"issue": 1, "id": "a/1", "reason": NOT_IN_ONLY},
        {"issue": 3, "id": "a/3", "reason": NOT_IN_ONLY},
    ]


def test_with_only_reports_every_listed_number_that_is_not_in_the_wave_with_a_reason() -> None:
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/live", "a/1", "a/2", "a/3", "a/4", "a/5", "a/6"],
                "lessons": [
                    {"id": "a/live", "issue": 9, "serves": ["a/c/o1"]},
                    {"id": "a/1", "issue": 1},
                    {"id": "a/2", "issue": 2},
                    {"id": "a/3", "issue": 3},
                    {"id": "a/4", "issue": 4, "assumes": ["a/c/o2"]},
                    {"id": "a/5", "issue": 5, "serves": ["a/c/o2"]},
                    {"id": "a/6", "issue": 6, "assumes": ["x/y/z"]},
                ],
            }
        ],
        live=["a/live"],
    )
    ready = [issue(1), issue(3, ["someone"]), issue(4), issue(5), issue(6), issue(50)]
    lookup = Lookups(
        {51: state(labels=["ready-for-agent"]), 52: state(pull_request=True), 999: state("CLOSED")}
    )
    r = lessons_wave(lessons, ready, lookup, only=[1, 2, 3, 4, 5, 6, 9, 50, 51, 52, 999], size=1)
    assert ids(r["wave"]) == ["a/1"]
    assert r["notPicked"] == [
        {"issue": 2, "reason": "not ready-for-agent"},
        {"issue": 3, "reason": "assigned"},
        {"issue": 4, "reason": "blocked by a/5"},
        {"issue": 5, "reason": "waiting (wave full)"},
        {"issue": 6, "reason": "blocked by objective x/y/z (no lesson serves it)"},
        {"issue": 9, "reason": "lesson a/live is live"},
        {"issue": 50, "reason": "not a planned lesson (use --kind content)"},
        {"issue": 51, "reason": "not a planned lesson (use --kind content)"},
        {"issue": 52, "reason": "no such open issue"},
        {"issue": 999, "reason": "no such open issue"},
    ]
    # Only the numbers outside the fetched set that no plan file names are looked up.
    assert lookup.asked == [51, 52, 999]


# unblocks. Course order puts `a/first` before the two unblockers. `a/loop`
# serves the missing objective of three blocked lessons (one in another
# area), `a/memory` serves two. `b/blocked-three` also assumes an objective
# no lesson serves, and still counts once for `a/loop`.


def unblock_plan() -> list[PlannedLesson]:
    return plan(
        [
            {
                "dir": "a",
                "course": [
                    "a/first",
                    "a/loop",
                    "a/memory",
                    "a/blocked-one",
                    "a/blocked-two",
                    "a/both",
                ],
                "lessons": [
                    {"id": "a/first", "issue": 1},
                    {"id": "a/loop", "issue": 2, "serves": ["a/c/loop"]},
                    {"id": "a/memory", "issue": 3, "serves": ["a/c/memory"]},
                    {"id": "a/blocked-one", "issue": 4, "assumes": ["a/c/loop"]},
                    {"id": "a/blocked-two", "issue": 5, "assumes": ["a/c/loop", "a/c/memory"]},
                    {"id": "a/both", "issue": 6, "assumes": ["a/c/memory"]},
                ],
            },
            {
                "dir": "b",
                "course": ["b/blocked-three"],
                "lessons": [
                    {"id": "b/blocked-three", "issue": 7, "assumes": ["a/c/loop", "x/y/z"]}
                ],
            },
        ]
    )


UNBLOCK_READY = [issue(n) for n in range(1, 8)]

# Without `a/blocked-one`, `a/loop` unblocks `a/blocked-two` and
# `b/blocked-three`, and `a/memory` unblocks `a/blocked-two` and `a/both`.
# `a/blocked-two` assumes both objectives and counts once for each.
WITHOUT_BLOCKED_ONE = [("a/loop", 2), ("a/memory", 2), ("a/first", 0)]


def test_unblocks_counts_the_blocked_candidates_and_keeps_course_order_without_the_flag() -> None:
    r = lessons_wave(unblock_plan(), UNBLOCK_READY, size=6)
    assert r["unblockersFirst"] is False
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == [
        ("a/first", 0),
        ("a/loop", 3),
        ("a/memory", 2),
    ]
    assert [b["id"] for b in r["blocked"]] == [
        "a/blocked-one",
        "a/blocked-two",
        "a/both",
        "b/blocked-three",
    ]


def test_unblocks_with_the_flag_sorts_by_the_count_and_puts_the_top_unblocker_first() -> None:
    r = lessons_wave(unblock_plan(), UNBLOCK_READY, size=1, unblockers_first=True)
    assert r["unblockersFirst"] is True
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == [("a/loop", 3)]
    assert [(w["area"], ids(w["lessons"])) for w in r["waiting"]] == [
        ("a", ["a/memory", "a/first"])
    ]


def test_unblocks_does_not_count_an_assigned_blocked_lesson_or_a_lesson_twice() -> None:
    # #4 is assigned, so `a/blocked-one` is not a blocked candidate.
    with_skip = [issue(1), issue(2), issue(3), issue(4, ["someone"]), issue(5), issue(6), issue(7)]
    r = lessons_wave(unblock_plan(), with_skip, size=6, unblockers_first=True)
    assert [(s.get("id"), s["reason"]) for s in r["skipped"]] == [
        ("a/blocked-one", "issue is assigned to someone")
    ]
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == WITHOUT_BLOCKED_ONE


def test_unblocks_does_not_count_a_blocked_lesson_whose_issue_is_not_ready() -> None:
    # #4 is not in the ready list, so `a/blocked-one` is not a blocked candidate.
    without_four = [issue(n) for n in [1, 2, 3, 5, 6, 7]]
    r = lessons_wave(unblock_plan(), without_four, size=6, unblockers_first=True)
    assert [(s.get("id"), s["reason"]) for s in r["skipped"]] == [
        ("a/blocked-one", "issue is not ready-for-agent")
    ]
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == WITHOUT_BLOCKED_ONE


def test_unblocks_does_not_count_a_blocked_lesson_outside_only() -> None:
    # #4 is ready but not in `only`, so `a/blocked-one` is not a blocked candidate.
    r = lessons_wave(
        unblock_plan(), UNBLOCK_READY, size=6, only=[1, 2, 3, 5, 6, 7], unblockers_first=True
    )
    assert [(s.get("id"), s["reason"]) for s in r["skipped"]] == [("a/blocked-one", NOT_IN_ONLY)]
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == WITHOUT_BLOCKED_ONE


def test_unblocks_keeps_the_after_rule_ahead_of_the_count_and_breaks_a_tie_by_position() -> None:
    # `a/2` unblocks the most but its own planned `after` is not live, so it
    # waits behind the two with none. Those two tie at one and keep course order.
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/1", "a/2", "a/3", "a/4", "a/5"],
                "lessons": [
                    {"id": "a/1", "issue": 1, "serves": ["a/c/o1"]},
                    {"id": "a/2", "issue": 2, "serves": ["a/c/o1", "a/c/o2"], "after": ["a/3"]},
                    {"id": "a/3", "issue": 3, "serves": ["a/c/o1"]},
                    {"id": "a/4", "issue": 4, "assumes": ["a/c/o1"]},
                    {"id": "a/5", "issue": 5, "assumes": ["a/c/o2"]},
                ],
            }
        ]
    )
    r = lessons_wave(lessons, [issue(n) for n in range(1, 6)], unblockers_first=True)
    assert [(w["id"], w["unblocks"], w["afterPlanned"]) for w in r["wave"]] == [
        ("a/1", 1, []),
        ("a/3", 1, []),
        ("a/2", 2, ["a/3"]),
    ]


@pytest.mark.parametrize(
    "body", ["Blocked by #40", "Not before 2026-12-24", "Not before 2026-02-30"]
)
def test_unblocks_does_not_count_a_blocked_lesson_a_dependency_line_also_holds(body: str) -> None:
    # `a/blocked-one` assumes `a/c/loop`, but its own line keeps it blocked
    # after `a/loop` is written, so only `a/blocked-two` and `b/blocked-three` count.
    ready = [issue(n, body=body if n == 4 else "") for n in range(1, 8)]
    r = lessons_wave(
        unblock_plan(), ready, Lookups({40: state()}), size=6, unblockers_first=True, today=TODAY
    )
    assert "a/blocked-one" in [b["id"] for b in r["blocked"]]
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == WITHOUT_BLOCKED_ONE


def test_unblocks_with_the_flag_and_no_blocked_lesson_the_order_is_the_course_order() -> None:
    lessons = plan(
        [
            {
                "dir": "a",
                "course": ["a/1", "a/2"],
                "lessons": [
                    {"id": "a/1", "issue": 1},
                    {"id": "a/2", "issue": 2, "serves": ["a/c/o1"]},
                ],
            }
        ]
    )
    r = lessons_wave(lessons, [issue(1), issue(2)], unblockers_first=True)
    assert [(w["id"], w["unblocks"]) for w in r["wave"]] == [("a/1", 0), ("a/2", 0)]


def test_without_a_lookup_a_number_outside_the_fetched_set_is_an_error() -> None:
    lessons = plan([{"dir": "a", "course": ["a/1"], "lessons": [{"id": "a/1", "issue": 1}]}])
    r = lessons_wave(lessons, [issue(1), issue(2)], only=[1, 2])
    assert r["notPicked"] == [{"issue": 2, "reason": "not a planned lesson (use --kind content)"}]
    with pytest.raises(ValueError, match="#3 is not in the fetched set"):
        lessons_wave(lessons, [issue(1)], only=[3])


# The kind a lessons wave names for an --only number that is no planned lesson (#529)


def one_lesson() -> list[PlannedLesson]:
    return plan([{"dir": "a", "course": ["a/1"], "lessons": [{"id": "a/1", "issue": 1}]}])


@pytest.mark.parametrize("kind", ["content", "code", "harness"])
def test_a_fetched_issue_that_is_no_lesson_names_the_kind_of_its_label(kind: str) -> None:
    ready = [issue(1), issue(2, labels=["ready-for-agent", kind])]
    r = lessons_wave(one_lesson(), ready, only=[1, 2])
    assert r["notPicked"] == [{"issue": 2, "reason": f"not a planned lesson (use --kind {kind})"}]


@pytest.mark.parametrize("kind", ["content", "code", "harness"])
def test_a_looked_up_issue_that_is_no_lesson_names_the_kind_of_its_label(kind: str) -> None:
    lookup = Lookups({2: state(labels=["ready-for-agent", kind])})
    r = lessons_wave(one_lesson(), [issue(1)], lookup, only=[1, 2])
    assert r["notPicked"] == [{"issue": 2, "reason": f"not a planned lesson (use --kind {kind})"}]
    assert lookup.asked == [2]


def test_an_issue_without_a_kind_label_that_is_no_lesson_keeps_the_content_reason() -> None:
    lookup = Lookups({3: state(labels=["ready-for-agent", "bug"])})
    ready = [issue(1), issue(2, labels=["ready-for-agent"])]
    r = lessons_wave(one_lesson(), ready, lookup, only=[2, 3])
    assert r["notPicked"] == [
        {"issue": 2, "reason": "not a planned lesson (use --kind content)"},
        {"issue": 3, "reason": "not a planned lesson (use --kind content)"},
    ]


def test_an_issue_with_two_kind_labels_that_is_no_lesson_names_no_kind() -> None:
    ready = [issue(1), issue(2, labels=["code", "harness"])]
    r = lessons_wave(one_lesson(), ready, only=[2])
    assert r["notPicked"] == [
        {"issue": 2, "reason": "not a planned lesson (has more than one kind label)"}
    ]


def test_a_looked_up_issue_without_ready_for_agent_that_is_no_lesson_is_not_ready() -> None:
    lookup = Lookups({2: state(labels=["code"])})
    r = lessons_wave(one_lesson(), [issue(1)], lookup, only=[2])
    assert r["notPicked"] == [{"issue": 2, "reason": "not ready-for-agent"}]


def test_a_fetched_issue_is_not_looked_up_for_its_kind() -> None:
    lookup = Lookups({})
    r = lessons_wave(one_lesson(), [issue(1), issue(2, labels=["code"])], lookup, only=[2])
    assert r["notPicked"] == [{"issue": 2, "reason": "not a planned lesson (use --kind code)"}]
    assert lookup.asked == []


# pickWave with kind content


def plan_lessons() -> list[PlannedLesson]:
    return plan(
        [
            {
                "dir": "a",
                "course": ["a/1", "a/2", "a/live"],
                "lessons": [
                    {"id": "a/1", "issue": 10},
                    {"id": "a/2", "issue": 20},
                    {"id": "a/live"},
                ],
            }
        ]
    )


def titled(number: int, title: str, labels: Sequence[str] = ("content",)) -> ReadyIssue:
    return {
        "number": number,
        "title": title,
        "assignees": [],
        "labels": list(labels),
        "body": "",
        "blockedBy": [],
        "foreignBlockedBy": [],
    }


def test_content_picks_ready_content_issues_by_number_leaving_out_planned_lessons() -> None:
    ready = [
        issue(30, [], ["content", "ready-for-agent"]),
        issue(20, [], ["content", "ready-for-agent"]),
        issue(5, [], ["content"]),
        issue(7, [], ["code"]),
        issue(8),
    ]
    r = pick_wave(plan_lessons(), ready, kind="content", size=6)
    assert r == {
        "kind": "content",
        "size": 6,
        "only": None,
        "wave": [
            {"issue": 5, "title": "Lesson #5", "labels": ["content"]},
            {"issue": 30, "title": "Lesson #30", "labels": ["content", "ready-for-agent"]},
        ],
        "skipped": [],
        "waiting": [],
        "notPicked": [],
        "blocked": [],
    }


def test_content_caps_at_size_skips_assigned_issues_and_applies_only() -> None:
    ready = [issue(n, ["someone"] if n == 52 else [], ["content"]) for n in [50, 51, 52, 53]]
    r = content_wave(plan_lessons(), ready, size=1)
    assert [w["issue"] for w in r["wave"]] == [50]
    assert r["skipped"] == [{"issue": 52, "reason": "issue is assigned to someone"}]
    assert [w["issue"] for w in r["waiting"]] == [51, 53]

    o = content_wave(plan_lessons(), ready, only=[51, 53])
    assert [w["issue"] for w in o["wave"]] == [51, 53]
    assert o["notPicked"] == []
    assert o["skipped"] == [
        {"issue": 50, "reason": NOT_IN_ONLY},
        {"issue": 52, "reason": NOT_IN_ONLY},
    ]


def test_content_leaves_out_a_nits_issue_by_title() -> None:
    ready = [
        titled(60, "Cosmetic nits left open on wave 8 branches"),
        titled(61, "Nits: three typos"),
        titled(62, "Nitpicks are not nits"),
    ]
    r = content_wave(plan_lessons(), ready)
    assert [w["issue"] for w in r["wave"]] == [62]
    assert NITS_TITLE.match("nits in the safety course")


def test_nits_title_matches_at_the_start_with_an_ascii_word_boundary() -> None:
    assert NITS_TITLE.match("Also nits") is None
    # JavaScript's `\b` sees `é` as a non-word character, and `/i` without
    # the `u` flag does not fold the long s (U+017F) to `s`.
    assert NITS_TITLE.match("nitsé")
    assert NITS_TITLE.match("nit\u017f") is None


def test_content_with_only_reports_every_listed_number_that_is_not_in_the_wave() -> None:
    ready = [
        issue(70, [], ["content"]),
        issue(71, [], ["content"]),
        issue(72, ["someone"], ["content"]),
        issue(73, [], ["code"]),
        issue(20, [], ["content"]),
        issue(76),
        titled(74, "Nits: two typos"),
    ]
    lookup = Lookups(
        {
            75: state(),
            77: state(labels=["ready-for-agent", "code"]),
            78: state(labels=["ready-for-agent", "content"]),
            10: state(labels=["ready-for-agent", "content"]),
            79: state("OPEN", ["ready-for-agent", "content"], pull_request=True),
            999: state("CLOSED", ["ready-for-agent", "content"]),
        }
    )
    r = content_wave(
        plan_lessons(),
        ready,
        lookup,
        only=[70, 71, 72, 73, 74, 75, 76, 20, 77, 78, 10, 79, 999],
        size=1,
    )
    assert [w["issue"] for w in r["wave"]] == [70]
    assert r["notPicked"] == [
        {"issue": 71, "reason": "waiting (wave full)"},
        {"issue": 72, "reason": "assigned"},
        {"issue": 73, "reason": "not a content issue"},
        {"issue": 74, "reason": "a nits issue (the dispatcher adds it as the nits row)"},
        {"issue": 75, "reason": "not ready-for-agent"},
        {"issue": 76, "reason": "not a content issue"},
        {"issue": 20, "reason": "a planned lesson (use --kind lessons)"},
        {"issue": 77, "reason": "not a content issue"},
        {"issue": 78, "reason": "not in the fetched issues (run the picker again)"},
        {"issue": 10, "reason": "a planned lesson (use --kind lessons)"},
        {"issue": 79, "reason": "no such open issue"},
        {"issue": 999, "reason": "no such open issue"},
    ]
    assert lookup.asked == [75, 77, 78, 10, 79, 999]


# pickWave with kind code


def test_code_puts_bugs_first_then_ascending_numbers_and_leaves_out_other_kinds() -> None:
    ready = [
        issue(40, [], ["code", "ready-for-agent"]),
        issue(12, [], ["code"]),
        issue(35, [], ["code", "bug"]),
        issue(8, [], ["bug", "code"]),
        issue(5, [], ["content"]),
        issue(6, [], ["harness", "bug"]),
        issue(7),
        # A planned lesson's issue is left out, even with the code label (#526).
        issue(10, [], ["code"]),
    ]
    r = pick_wave(plan_lessons(), ready, kind="code", size=6)
    assert r == {
        "kind": "code",
        "size": 6,
        "only": None,
        "wave": [
            {"issue": 8, "title": "Lesson #8", "labels": ["bug", "code"]},
            {"issue": 35, "title": "Lesson #35", "labels": ["code", "bug"]},
            {"issue": 12, "title": "Lesson #12", "labels": ["code"]},
            {"issue": 40, "title": "Lesson #40", "labels": ["code", "ready-for-agent"]},
        ],
        "skipped": [],
        "waiting": [],
        "notPicked": [],
        "blocked": [],
    }


def test_code_leaves_out_a_nits_issue_and_caps_the_wave_in_the_bug_first_order() -> None:
    ready = [
        titled(1, "Cosmetic nits left open on wave 8 branches", ["code", "bug"]),
        titled(2, "Fix the picker", ["code"]),
        titled(3, "Crash in the hook", ["code", "bug"]),
    ]
    r = code_wave(plan_lessons(), ready, size=1)
    assert [w["issue"] for w in r["wave"]] == [3]
    assert [w["issue"] for w in r["waiting"]] == [2]


def test_code_blocks_on_the_dependency_lines_and_skips_assigned_issues() -> None:
    ready = [
        issue(30, labels=["code", "bug"], body="Blocked by #40"),
        issue(31, labels=["code"], body="Not before 2027-01-01"),
        issue(32, ["someone"], ["code"]),
        issue(33, labels=["code"], body="Blocked by #41"),
    ]
    lookup = Lookups({40: state(), 41: state("CLOSED")})
    r = code_wave(plan_lessons(), ready, lookup, today=TODAY)
    assert [w["issue"] for w in r["wave"]] == [33]
    assert r["blocked"] == [
        {"issue": 30, "title": "Lesson #30", "blockedByIssues": [40]},
        {"issue": 31, "title": "Lesson #31", "notBefore": "2027-01-01"},
    ]
    assert r["skipped"] == [{"issue": 32, "reason": "issue is assigned to someone"}]


def test_code_with_only_names_the_kind_in_every_reason() -> None:
    ready = [
        issue(70, [], ["code"]),
        issue(71, [], ["content"]),
        titled(72, "Nits: two typos", ["code"]),
    ]
    lookup = Lookups(
        {
            75: state(labels=["ready-for-agent", "harness"]),
            76: state(labels=["ready-for-agent", "code"]),
            999: state("CLOSED", ["ready-for-agent", "code"]),
        }
    )
    r = code_wave(plan_lessons(), ready, lookup, only=[70, 71, 72, 75, 76, 999])
    assert [w["issue"] for w in r["wave"]] == [70]
    assert r["notPicked"] == [
        {"issue": 71, "reason": "not a code issue"},
        {"issue": 72, "reason": "a nits issue (the dispatcher adds it as the nits row)"},
        {"issue": 75, "reason": "not a code issue"},
        {"issue": 76, "reason": "not in the fetched issues (run the picker again)"},
        {"issue": 999, "reason": "no such open issue"},
    ]
    assert format_wave(r).startswith("## Wave (1 of 6, code)\n\n| Issue | Title | Labels |\n")


# pickWave with kind harness


def test_harness_picks_ready_harness_issues_by_number_and_leaves_out_other_kinds() -> None:
    ready = [
        issue(40, [], ["harness", "ready-for-agent"]),
        issue(12, [], ["harness"]),
        # No bug-first rule: a harness wave goes by number alone.
        issue(35, [], ["harness", "bug"]),
        issue(5, [], ["content"]),
        issue(6, [], ["code", "bug"]),
        issue(7),
        titled(8, "Cosmetic nits in the agent files", ["harness"]),
    ]
    r = pick_wave(plan_lessons(), ready, kind="harness")
    assert r == {
        "kind": "harness",
        "size": 4,
        "only": None,
        "wave": [
            {"issue": 12, "title": "Lesson #12", "labels": ["harness"]},
            {"issue": 35, "title": "Lesson #35", "labels": ["harness", "bug"]},
            {"issue": 40, "title": "Lesson #40", "labels": ["harness", "ready-for-agent"]},
        ],
        "skipped": [],
        "waiting": [],
        "notPicked": [],
        "blocked": [],
    }


def test_harness_defaults_the_size_to_four_and_the_other_kinds_to_six() -> None:
    ready = [issue(n, [], ["harness"]) for n in range(1, 8)]
    r = harness_wave(plan_lessons(), ready)
    assert [w["issue"] for w in r["wave"]] == [1, 2, 3, 4]
    assert [w["issue"] for w in r["waiting"]] == [5, 6, 7]
    assert pick_wave(plan_lessons(), ready, kind="harness", size=2)["size"] == 2
    assert pick_wave(plan_lessons(), [], kind="code")["size"] == 6
    assert pick_wave(plan_lessons(), [], kind="content")["size"] == 6
    assert pick_wave(plan_lessons(), [])["size"] == 6


def test_harness_blocks_on_the_dependency_lines_and_names_the_kind_under_only() -> None:
    ready = [
        issue(30, labels=["harness"], body="Blocked by #40"),
        issue(31, labels=["harness"], body="Not before 2026-10-01 UTC"),
        issue(32, ["someone"], ["harness"]),
        issue(33, labels=["harness"], body="Blocked by #41"),
        issue(34, labels=["code"]),
    ]
    lookup = Lookups({40: state(), 41: state("CLOSED"), 999: state("CLOSED", ["harness"])})
    r = harness_wave(plan_lessons(), ready, lookup, only=[30, 31, 32, 33, 34, 999], today=TODAY)
    assert [w["issue"] for w in r["wave"]] == [33]
    assert r["blocked"] == [
        {"issue": 30, "title": "Lesson #30", "blockedByIssues": [40]},
        {"issue": 31, "title": "Lesson #31", "unreadable": ["Not before 2026-10-01 UTC"]},
    ]
    assert r["notPicked"] == [
        {"issue": 30, "reason": "blocked by #40"},
        {"issue": 31, "reason": "unreadable dependency line `Not before 2026-10-01 UTC`"},
        {"issue": 32, "reason": "assigned"},
        {"issue": 34, "reason": "not a harness issue"},
        {"issue": 999, "reason": "no such open issue"},
    ]
    assert format_wave(r).startswith("## Wave (1 of 4, harness)\n")


# A planned lesson's issue in a code or harness wave (#526)


@pytest.mark.parametrize("kind", ["code", "harness"])
def test_a_code_or_harness_wave_leaves_out_a_planned_lessons_issue(kind: nw.IssueKind) -> None:
    # Issues 10 and 20 are planned as lessons a/1 and a/2.
    ready = [issue(10, [], [kind, "bug"]), issue(20, [], [kind]), issue(90, [], [kind])]
    lookup = Lookups({20: state(labels=["ready-for-agent", kind])})
    r = nw.pick_issue_wave(kind, plan_lessons(), ready)
    assert [w["issue"] for w in r["wave"]] == [90]
    assert r["skipped"] == []
    # Issue 20 is outside the fetched set here, so the picker looks it up.
    o = nw.pick_issue_wave(kind, plan_lessons(), [ready[0], ready[2]], lookup, only=[10, 20, 90])
    assert [w["issue"] for w in o["wave"]] == [90]
    assert o["notPicked"] == [
        {"issue": 10, "reason": "a planned lesson (use --kind lessons)"},
        {"issue": 20, "reason": "a planned lesson (use --kind lessons)"},
    ]


# An issue with more than one kind label (#522)

MANY_KINDS = "has more than one kind label"


def test_a_content_and_code_issue_is_skipped_in_a_content_wave_and_in_a_code_wave() -> None:
    ready = [
        issue(80, [], ["content", "code"]),
        issue(81, [], ["content"]),
        issue(82, [], ["code"]),
    ]
    c = content_wave(plan_lessons(), ready)
    assert [w["issue"] for w in c["wave"]] == [81]
    assert c["skipped"] == [{"issue": 80, "reason": MANY_KINDS}]
    k = code_wave(plan_lessons(), ready)
    assert [w["issue"] for w in k["wave"]] == [82]
    assert k["skipped"] == [{"issue": 80, "reason": MANY_KINDS}]


def test_a_harness_issue_with_a_second_kind_label_is_skipped_in_a_harness_wave() -> None:
    ready = [
        issue(83, [], ["harness", "code", "bug"]),
        issue(84, [], ["harness", "content", "code"]),
        issue(85, [], ["harness", "bug"]),
    ]
    r = harness_wave(plan_lessons(), ready)
    assert [w["issue"] for w in r["wave"]] == [85]
    assert r["skipped"] == [
        {"issue": 83, "reason": MANY_KINDS},
        {"issue": 84, "reason": MANY_KINDS},
    ]
    assert f"- #83: {MANY_KINDS}" in format_wave(r)


def test_the_kind_label_skip_wins_over_the_planned_lesson_and_nits_rules() -> None:
    # Issue 10 is planned as lesson a/1. A planned lesson or a nits issue is
    # left out silently, but a label error is reported so that it gets fixed.
    ready = [
        issue(10, [], ["content", "code"]),
        titled(86, "Nits: two typos", ["content", "harness"]),
    ]
    c = content_wave(plan_lessons(), ready)
    assert c["wave"] == []
    assert c["skipped"] == [
        {"issue": 10, "reason": MANY_KINDS},
        {"issue": 86, "reason": MANY_KINDS},
    ]
    assert code_wave(plan_lessons(), ready)["skipped"] == [{"issue": 10, "reason": MANY_KINDS}]


def test_the_kind_label_skip_comes_after_only_and_names_the_reason_under_not_picked() -> None:
    ready = [issue(80, [], ["content", "code"]), issue(81, [], ["code"])]
    lookup = Lookups({87: state(labels=["ready-for-agent", "code", "harness"])})
    r = code_wave(plan_lessons(), ready, lookup, only=[81, 80, 87])
    assert [w["issue"] for w in r["wave"]] == [81]
    assert r["skipped"] == [{"issue": 80, "reason": MANY_KINDS}]
    assert r["notPicked"] == [
        {"issue": 80, "reason": MANY_KINDS},
        {"issue": 87, "reason": MANY_KINDS},
    ]
    o = code_wave(plan_lessons(), ready, only=[81])
    assert o["skipped"] == [{"issue": 80, "reason": NOT_IN_ONLY}]


def test_a_looked_up_planned_issue_with_two_kind_labels_names_the_kind_label_reason() -> None:
    # Issue 10 is planned as lesson a/1 and is outside the fetched set, so the
    # picker looks it up. The label error wins over the planned-lesson reason.
    lookup = Lookups({10: state(labels=["ready-for-agent", "content", "code"])})
    r = code_wave(plan_lessons(), [], lookup, only=[10])
    assert r["notPicked"] == [{"issue": 10, "reason": MANY_KINDS}]


# formatWave


def empty_lessons_wave(**fields: object) -> LessonsWave:
    wave: dict[str, object] = {
        "kind": "lessons",
        "size": 2,
        "only": None,
        "unblockersFirst": False,
        "wave": [],
        "blocked": [],
        "skipped": [],
        "waiting": [],
        "notPicked": [],
    }
    wave.update(fields)
    return cast("LessonsWave", wave)


def test_format_renders_the_wave_table_and_the_three_lists_as_markdown() -> None:
    out = format_wave(
        {
            "kind": "lessons",
            "size": 6,
            "only": None,
            "unblockersFirst": False,
            "notPicked": [],
            "wave": [
                {
                    "issue": 1,
                    "id": "a/1",
                    "title": "One",
                    "area": "a",
                    "position": 1,
                    "afterPlanned": [],
                    "unblocks": 0,
                },
                {
                    "issue": 2,
                    "id": "a/2",
                    "title": "Two",
                    "area": "a",
                    "position": None,
                    "afterPlanned": ["a/3", "a/4"],
                    "unblocks": 0,
                },
            ],
            "blocked": [
                {
                    "issue": 3,
                    "id": "b/3",
                    "blockedBy": [
                        {"objective": "a/c/o1", "servedBy": ["a/5", "a/6"]},
                        {"objective": "a/c/o2", "servedBy": []},
                    ],
                }
            ],
            "skipped": [{"issue": 4, "id": "b/4", "reason": "issue is assigned to someone"}],
            "waiting": [
                {
                    "area": "a",
                    "lessons": [
                        {
                            "issue": 5,
                            "id": "a/5",
                            "title": "Five",
                            "area": "a",
                            "position": 5,
                            "afterPlanned": [],
                            "unblocks": 0,
                        }
                    ],
                },
                {
                    "area": "b",
                    "lessons": [
                        {
                            "issue": 6,
                            "id": "b/6",
                            "title": "Six",
                            "area": "b",
                            "position": 1,
                            "afterPlanned": [],
                            "unblocks": 0,
                        },
                        {
                            "issue": 7,
                            "id": "b/7",
                            "title": "Seven",
                            "area": "b",
                            "position": 2,
                            "afterPlanned": [],
                            "unblocks": 0,
                        },
                    ],
                },
            ],
        }
    )
    assert out == "\n".join(
        [
            "## Wave (2 of 6)",
            "",
            "| Issue | Lesson | Course position | Planned `after` |",
            "| ----- | ------ | --------------- | --------------- |",
            "| #1 | `a/1` | a 1 | - |",
            "| #2 | `a/2` | a (unlisted) | `a/3`, `a/4` |",
            "",
            "## Blocked (1)",
            "",
            "- #3 `b/3`: assumes `a/c/o1` (served by `a/5`, `a/6`); `a/c/o2` (no lesson serves it)",
            "",
            "## Skipped (1)",
            "",
            "- #4 `b/4`: issue is assigned to someone",
            "",
            "## Waiting for a later wave (3)",
            "",
            "- a: #5",
            "- b: #6 #7",
            "",
        ]
    )


def test_format_adds_the_unblocks_column_when_unblockers_first_is_set() -> None:
    wave: list[WaveEntry] = [
        {
            "issue": 1,
            "id": "a/1",
            "title": "One",
            "area": "a",
            "position": 2,
            "afterPlanned": [],
            "unblocks": 3,
        },
        {
            "issue": 2,
            "id": "a/2",
            "title": "Two",
            "area": "a",
            "position": 1,
            "afterPlanned": ["a/3"],
            "unblocks": 0,
        },
    ]
    out = format_wave(empty_lessons_wave(size=6, unblockersFirst=True, wave=wave))
    assert (
        "\n".join(
            [
                "| Issue | Lesson | Course position | Planned `after` | Unblocks |",
                "| ----- | ------ | --------------- | --------------- | -------- |",
                "| #1 | `a/1` | a 2 | - | 3 |",
                "| #2 | `a/2` | a 1 | `a/3` | 0 |",
            ]
        )
        in out
    )


def test_format_renders_an_empty_result_with_the_headings_and_counts_only() -> None:
    out = format_wave(empty_lessons_wave())
    assert "## Wave (0 of 2)" in out
    assert "## Blocked (0)" in out
    assert "## Skipped (0)" in out
    assert "## Waiting for a later wave (0)" in out
    assert "Not picked" not in out


def test_format_adds_the_not_picked_section_whenever_only_was_given_even_when_empty() -> None:
    assert "## Not picked from --only (0)" in format_wave(empty_lessons_wave(only=[1]))
    out = format_wave(
        empty_lessons_wave(
            only=[1, 999], notPicked=[{"issue": 999, "reason": "no such open issue"}]
        )
    )
    assert "\n".join(["## Not picked from --only (1)", "", "- #999: no such open issue", ""]) in out


def test_format_groups_the_not_in_only_skips_on_one_line() -> None:
    out = format_wave(
        empty_lessons_wave(
            size=6,
            only=[2],
            notPicked=[{"issue": 2, "reason": "assigned"}],
            skipped=[
                {"issue": 1, "id": "a/1", "reason": NOT_IN_ONLY},
                {"issue": 2, "id": "a/2", "reason": "issue is assigned to someone"},
                {"issue": 3, "id": "a/3", "reason": NOT_IN_ONLY},
            ],
        )
    )
    assert (
        "\n".join(
            [
                "## Skipped (3)",
                "",
                "- not in --only: #1 #3",
                "- #2 `a/2`: issue is assigned to someone",
            ]
        )
        in out
    )


def test_format_renders_a_content_wave_as_an_issue_table_then_the_lists() -> None:
    out = format_wave(
        {
            "kind": "content",
            "size": 2,
            "only": [5, 6, 7, 8],
            "notPicked": [{"issue": 7, "reason": "assigned"}],
            "wave": [
                {"issue": 5, "title": "Fix the | table", "labels": ["content"]},
                {"issue": 6, "title": "Widget", "labels": ["content", "ready-for-agent"]},
            ],
            "skipped": [{"issue": 7, "reason": "issue is assigned to someone"}],
            "waiting": [
                {"issue": 8, "title": "Later", "labels": ["content"]},
                {"issue": 9, "title": "Later too", "labels": ["content"]},
            ],
            "blocked": [],
        }
    )
    assert out == "\n".join(
        [
            "## Wave (2 of 2, content)",
            "",
            "| Issue | Title | Labels |",
            "| ----- | ----- | ------ |",
            "| #5 | Fix the \\| table | `content` |",
            "| #6 | Widget | `content`, `ready-for-agent` |",
            "",
            "## Skipped (1)",
            "",
            "- #7: issue is assigned to someone",
            "",
            "## Waiting for a later wave (2)",
            "",
            "- #8 Later",
            "- #9 Later too",
            "",
            "## Not picked from --only (1)",
            "",
            "- #7: assigned",
            "",
        ]
    )


# The command line, which the JavaScript tool had in scripts/next-wave.mjs
# without tests.


def test_parse_args_defaults() -> None:
    assert parse_args([]) == {
        "size": 6,
        "kind": "lessons",
        "only": None,
        "unblockersFirst": False,
        "json": False,
    }


@pytest.mark.parametrize(
    ("argv", "size"),
    [
        (["--kind", "harness"], 4),
        (["--kind", "code"], 6),
        (["--kind", "harness", "--size", "6"], 6),
        (["--size", "2", "--kind", "harness"], 2),
    ],
)
def test_parse_args_defaults_the_size_by_kind_unless_size_is_given(
    argv: list[str], size: int
) -> None:
    args = parse_args(argv)
    assert not isinstance(args, str)
    assert args["size"] == size


def test_parse_args_reads_every_flag() -> None:
    argv = ["--size", "3", "--kind", "content", "--only", "1,22", "--unblockers-first", "--json"]
    assert parse_args(argv) == {
        "size": 3,
        "kind": "content",
        "only": [1, 22],
        "unblockersFirst": True,
        "json": True,
    }


@pytest.mark.parametrize(
    ("argv", "message"),
    [
        (["--size", "0"], 'next-wave: --size needs a positive integer, got "0"'),
        (["--size", "01"], 'next-wave: --size needs a positive integer, got "01"'),
        # Python's `$` would also match before a trailing newline.
        (["--size", "3\n"], 'next-wave: --size needs a positive integer, got "3\\n"'),
        # Python's `[0-9]` is ASCII here, and `int()` would take Arabic-Indic digits.
        (["--size", "٣"], 'next-wave: --size needs a positive integer, got "٣"'),
        (["--size"], 'next-wave: --size needs a positive integer, got ""'),
        (["--kind", "nope"], 'next-wave: --kind is lessons, content, code or harness, got "nope"'),
        (["--kind"], 'next-wave: --kind is lessons, content, code or harness, got ""'),
        (["--kind", "Code"], 'next-wave: --kind is lessons, content, code or harness, got "Code"'),
        (
            ["--only", "1,,2"],
            'next-wave: --only needs issue numbers separated by commas, got "1,,2"',
        ),
        (
            ["--only", "1,2\n"],
            'next-wave: --only needs issue numbers separated by commas, got "1,2\\n"',
        ),
        (["--only"], 'next-wave: --only needs issue numbers separated by commas, got ""'),
        (["--bogus"], "next-wave: unknown argument --bogus"),
    ],
)
def test_parse_args_names_what_is_wrong(argv: list[str], message: str) -> None:
    assert parse_args(argv) == message


class FakeCommands:
    """Stands in for subprocess.run with canned output per command."""

    def __init__(self, outputs: dict[str, str | int | OSError]) -> None:
        self.outputs = outputs
        self.calls: list[tuple[list[str], object]] = []

    def __call__(
        self, command: list[str], cwd: object = None, **_: object
    ) -> subprocess.CompletedProcess[bytes]:
        self.calls.append((command, cwd))
        out = self.outputs[" ".join(command)]
        if isinstance(out, OSError):
            raise out
        if isinstance(out, int):
            return subprocess.CompletedProcess(command, out, b"")
        return subprocess.CompletedProcess(command, 0, out.encode())


BUN = "bun scripts/lesson-plan.mjs"
# The `blockedBy` field of an issue with no `blocked by` relationship, as gh gives it.
NO_BLOCKERS: dict[str, object] = {"nodes": [], "totalCount": 0}
GH = (
    "gh issue list -R schubergphilis/ai-training -s open -l ready-for-agent -L 1000"
    " --json number,title,assignees,labels,body,blockedBy"
)
GH_CONTENT = (
    "gh issue list -R schubergphilis/ai-training -s open -l ready-for-agent -l content -L 1000"
    " --json number,title,assignees,labels,body,blockedBy"
)


def view(number: int) -> str:
    return (
        f"gh issue view {number} -R schubergphilis/ai-training"
        " --json state,labels,assignees,url,blockedBy"
    )


def view_json(value: str = "OPEN", labels: Sequence[str] = (), kind: str = "issues") -> str:
    return json.dumps(
        {
            "assignees": [],
            "labels": [{"name": label} for label in labels],
            "state": value,
            "url": f"https://github.com/schubergphilis/ai-training/{kind}/1",
            "blockedBy": NO_BLOCKERS,
        }
    )


PLAN_JSON = json.dumps(
    {
        "lessons": [
            {
                "id": "a/1",
                "area": "a",
                "title": "Café",
                "issue": 11,
                "position": 1,
                "after": [],
                "assumes": [],
                "serves": [],
                "live": False,
            },
            {
                "id": "a/2",
                "area": "a",
                "title": None,
                "issue": 12,
                "position": None,
                "after": ["a/1"],
                "assumes": [],
                "serves": [],
                "live": False,
            },
        ]
    }
)
GH_JSON = json.dumps(
    [
        {
            "number": 11,
            "title": "Lesson 11",
            "assignees": [],
            "labels": [{"name": "ready-for-agent"}],
            "body": "",
            "blockedBy": NO_BLOCKERS,
        },
        {
            "number": 12,
            "title": "Lesson é 12",
            "assignees": [{"login": "someone"}],
            "labels": [{"name": "ready-for-agent"}],
            "body": "Blocked by #99",
            "blockedBy": NO_BLOCKERS,
        },
    ]
)


class Captured:
    def __init__(self, stdout: str, stderr: str) -> None:
        self.stdout = stdout
        self.stderr = stderr


def run_main(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    argv: list[str],
    outputs: dict[str, str | int | OSError],
) -> tuple[int | None, Captured, FakeCommands]:
    fake = FakeCommands(outputs)
    monkeypatch.setattr(subprocess, "run", fake)
    buffer = io.BytesIO()

    class Stdout:
        def __init__(self) -> None:
            self.buffer = buffer

    monkeypatch.setattr("sys.stdout", Stdout())
    try:
        code: int | None = nw.main(argv)
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else None
    err = capsys.readouterr().err
    return code, Captured(buffer.getvalue().decode(), err), fake


def test_main_runs_lesson_plan_in_site_and_prints_the_wave_as_markdown(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, fake = run_main(
        monkeypatch,
        capsys,
        ["--only", "11,12,13"],
        {BUN: PLAN_JSON, GH: GH_JSON, view(13): view_json(labels=["ready-for-agent"])},
    )
    assert code == 0
    assert out.stderr == ""
    # #12 is assigned, so its `Blocked by #99` line is never looked up. #13
    # is outside the fetched set, so `--only` looks it up.
    assert [(" ".join(c), cwd) for c, cwd in fake.calls] == [
        (BUN, nw.SITE),
        (GH, None),
        (view(13), None),
    ]
    assert (nw.SITE / "scripts" / "lesson-plan.mjs").is_file()
    assert out.stdout == "\n".join(
        [
            "## Wave (1 of 6)",
            "",
            "| Issue | Lesson | Course position | Planned `after` |",
            "| ----- | ------ | --------------- | --------------- |",
            "| #11 | `a/1` | a 1 | - |",
            "",
            "## Blocked (0)",
            "",
            "",
            "## Skipped (1)",
            "",
            "- #12 `a/2`: issue is assigned to someone",
            "",
            "## Waiting for a later wave (0)",
            "",
            "",
            "## Not picked from --only (2)",
            "",
            "- #12: assigned",
            "- #13: not a planned lesson (use --kind content)",
            "",
        ]
    )


def test_main_prints_json_as_json_stringify_with_two_spaces_did(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, _ = run_main(
        monkeypatch, capsys, ["--json", "--size", "1"], {BUN: PLAN_JSON, GH: GH_JSON}
    )
    assert code == 0
    assert out.stdout.endswith("}\n")
    assert '"title": "Café"' in out.stdout
    assert '  "kind": "lessons",\n  "size": 1,\n  "only": null,\n' in out.stdout
    assert '"waiting": [],\n' in out.stdout
    assert json.loads(out.stdout)["wave"][0]["id"] == "a/1"


def test_to_json_escapes_a_lone_surrogate_as_javascript_does() -> None:
    assert nw.to_json({"t": "a\ud800b"}) == '{\n  "t": "a\\ud800b"\n}\n'


def test_main_exits_2_on_a_bad_argument_before_running_anything(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, fake = run_main(monkeypatch, capsys, ["--kind", "nope"], {})
    assert code == 2
    assert out.stdout == ""
    assert out.stderr == 'next-wave: --kind is lessons, content, code or harness, got "nope"\n'
    assert fake.calls == []


def test_main_exits_1_and_names_gh_as_the_javascript_tool_did(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, _ = run_main(monkeypatch, capsys, [], {BUN: PLAN_JSON, GH: 1})
    assert code == 1
    assert out.stdout == ""
    assert out.stderr == f"next-wave: gh issue list failed: Command failed: {GH}\n"
    code, out, _ = run_main(
        monkeypatch, capsys, [], {BUN: PLAN_JSON, GH: FileNotFoundError(2, "x")}
    )
    assert code == 1
    assert out.stderr == 'next-wave: gh issue list failed: Executable not found in $PATH: "gh"\n'


def test_main_exits_1_when_lesson_plan_fails_or_cannot_start(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, _ = run_main(monkeypatch, capsys, [], {BUN: 1})
    assert code == 1
    assert out.stderr == f"next-wave: {BUN} failed: Command failed: {BUN}\n"
    code, out, _ = run_main(monkeypatch, capsys, [], {BUN: FileNotFoundError(2, "x")})
    assert code == 1
    assert out.stderr == f'next-wave: {BUN} failed: Executable not found in $PATH: "bun"\n'
    code, out, _ = run_main(monkeypatch, capsys, [], {BUN: PermissionError(13, "denied")})
    assert code == 1
    assert out.stderr == f"next-wave: {BUN} failed: [Errno 13] denied\n"


@pytest.mark.parametrize(
    ("outputs", "name"),
    [
        ({BUN: "not json"}, BUN),
        ({BUN: "{}"}, BUN),
        ({BUN: PLAN_JSON, GH: '[{"number": 1}]'}, "gh issue list"),
        # A body of null is unreadable, and never read as an empty body.
        ({BUN: PLAN_JSON, GH: '[{"number": 1, "title": "t", "body": null}]'}, "gh issue list"),
    ],
)
def test_main_exits_1_on_output_it_cannot_read(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    outputs: dict[str, str | int | OSError],
    name: str,
) -> None:
    code, out, _ = run_main(monkeypatch, capsys, [], outputs)
    assert code == 1
    assert out.stdout == ""
    assert out.stderr.startswith(f"next-wave: {name} failed: unreadable output: ")


def test_main_writes_a_lone_surrogate_in_the_markdown_as_u_fffd_as_javascript_did(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh = json.dumps(
        [
            {
                "number": 30,
                "title": "Odd \ud800 title",
                "assignees": [],
                "labels": [{"name": "ready-for-agent"}, {"name": "content"}],
                "body": "",
                "blockedBy": NO_BLOCKERS,
            }
        ]
    )
    code, out, _ = run_main(
        monkeypatch, capsys, ["--kind", "content"], {BUN: PLAN_JSON, GH_CONTENT: gh}
    )
    assert code == 0
    assert "| #30 | Odd \ufffd title | `ready-for-agent`, `content` |" in out.stdout


def test_parse_lesson_plan_keeps_only_string_after_entries() -> None:
    plan_json = json.loads(PLAN_JSON)
    plan_json["lessons"][1]["after"] = ["a/1", 7, None]
    lessons = nw.parse_lesson_plan(json.dumps(plan_json))
    assert lessons[1]["after"] == ["a/1"]


# Dependency lines (#493): `Blocked by #N` and `Not before YYYY-MM-DD`.

TODAY = date(2026, 9, 26)


def test_dependency_lines_reads_whole_trimmed_lines_in_the_case_as_written() -> None:
    body = "\r\n".join(
        [
            "Blocked by #12",
            "  Blocked by #13  ",
            "Not before 2026-10-01",
            "blocked by #14",
            "Blocked By #15",
            "Split from #1. Blocked by #19.",
            "not before 2026-10-02",
            "Blocked by the spec",
        ]
    )
    assert nw.dependency_lines(body) == ([12, 13], ["2026-10-01"], [])


def test_dependency_lines_reports_a_near_miss_of_either_form_as_unreadable() -> None:
    near_misses = [
        "Not before 2026-10-01 UTC",
        "Not before: 2026-10-01",
        "Not before the next release",
        "Not before 2026-9-27",
        "Blocked by #5 and #6",
        "Blocked by #16, #17",
        "Blocked by #18 (the spec)",
        "Blocked by #019",
    ]
    body = "\n".join(["Blocked by #4", *(f"  {x}" for x in near_misses)])
    assert nw.dependency_lines(body) == ([4], [], near_misses)
    d = nw.dependencies(body, lambda n: False, TODAY)
    assert d["unreadable"] == near_misses
    assert nw.held(d)


def test_dependency_lines_skips_code_fences_and_quotes() -> None:
    body = "\n".join(
        [
            "```text",
            "Blocked by #1",
            "```",
            "~~~~",
            "Not before 2030-01-01",
            "~~~",
            "Blocked by #2",
            "~~~~",
            "> Blocked by #3",
            "  > Not before 2030-01-01",
            "Blocked by #4",
        ]
    )
    # The `~~~` inside the `~~~~` fence is too short to close it.
    assert nw.dependency_lines(body) == ([4], [], [])


def test_dependency_lines_opens_a_fence_only_as_commonmark_does() -> None:
    body = "\n".join(
        [
            # Four spaces of indent, or a tab, is no fence (an indented code block).
            "    ```",
            "Blocked by #1",
            "\t~~~",
            "Blocked by #2",
            # A backtick fence's info string holds no backtick, so this is inline code.
            "```Blocked by #5```",
            "Blocked by #3",
            # Up to three spaces open a fence, and a tilde line doesn't close a backtick one.
            "   ```sh",
            "~~~",
            "Blocked by #6",
            "```",
            "Blocked by #7",
        ]
    )
    assert nw.dependency_lines(body) == ([1, 2, 3, 7], [], [])


def test_dependencies_holds_an_issue_while_a_blocker_is_open_and_lists_two_blockers() -> None:
    body = "Blocked by #5\nBlocked by #6\nBlocked by #7\nBlocked by #5"
    d = nw.dependencies(body, lambda n: n in (5, 7), TODAY)
    assert d == {"blockedByIssues": [5, 7], "notBefore": None, "unreadable": []}
    assert nw.held(d)
    closed = nw.dependencies("Blocked by #6", lambda n: False, TODAY)
    assert not nw.held(closed)


def test_dependencies_waits_for_a_future_date_and_frees_the_issue_on_that_date() -> None:
    def not_before(body: str) -> str | None:
        return nw.dependencies(body, lambda n: True, TODAY)["notBefore"]

    assert not_before("Not before 2026-09-27") == "2026-09-27"
    assert not_before("Not before 2026-09-26") is None
    assert not_before("Not before 2026-09-01") is None
    # With two lines the later date counts.
    assert not_before("Not before 2026-09-01\nNot before 2026-12-24") == "2026-12-24"


@pytest.mark.parametrize("value", ["2026-13-01", "2026-02-30", "0000-01-01"])
def test_dependencies_reports_an_unreadable_date_and_holds_the_issue(value: str) -> None:
    d = nw.dependencies(f"Not before {value}", lambda n: True, TODAY)
    assert d == {"blockedByIssues": [], "notBefore": None, "unreadable": [f"Not before {value}"]}
    assert nw.held(d)


# The `blocked by` relationship (#579): its open issues and the `Blocked by`
# lines together, each number once.


def blocker_node(
    number: int, value: str = "OPEN", repo: str = "schubergphilis/ai-training"
) -> dict[str, object]:
    return {
        "id": f"I_{number}",
        "number": number,
        "state": value,
        "title": f"Issue {number}",
        "url": f"https://github.com/{repo}/issues/{number}",
    }


def blocked_by_field(*nodes: dict[str, object]) -> dict[str, object]:
    return {"nodes": list(nodes), "totalCount": len(nodes)}


def harness_issue(
    number: int, body: str = "", blocked_by: Sequence[int] = (), foreign: Sequence[str] = ()
) -> ReadyIssue:
    return issue(number, labels=["harness"], body=body, blocked_by=blocked_by, foreign=foreign)


def test_native_only_blocks_the_issue_without_a_lookup() -> None:
    lookup = Lookups({})
    r = harness_wave([], [harness_issue(30, blocked_by=[40])], lookup, today=TODAY)
    assert r["wave"] == []
    assert r["blocked"] == [{"issue": 30, "title": "Lesson #30", "blockedByIssues": [40]}]
    assert lookup.asked == []


def test_a_line_only_still_blocks_the_issue_through_a_lookup() -> None:
    lookup = Lookups({40: state()})
    r = harness_wave([], [harness_issue(30, body="Blocked by #40")], lookup, today=TODAY)
    assert r["blocked"] == [{"issue": 30, "title": "Lesson #30", "blockedByIssues": [40]}]
    assert lookup.asked == [40]


def test_native_and_a_line_naming_the_same_issue_count_it_once() -> None:
    lookup = Lookups({})
    ready = [harness_issue(30, body="Blocked by #40", blocked_by=[40])]
    r = harness_wave([], ready, lookup, only=[30], today=TODAY)
    assert r["blocked"] == [{"issue": 30, "title": "Lesson #30", "blockedByIssues": [40]}]
    assert r["notPicked"] == [{"issue": 30, "reason": "blocked by #40"}]
    # The relationship already says #40 is open, so the line needs no lookup.
    assert lookup.asked == []


def test_native_and_a_line_naming_different_issues_list_both_native_first() -> None:
    lookup = Lookups({41: state()})
    ready = [harness_issue(30, body="Blocked by #41", blocked_by=[40])]
    r = harness_wave([], ready, lookup, only=[30], today=TODAY)
    assert r["blocked"] == [{"issue": 30, "title": "Lesson #30", "blockedByIssues": [40, 41]}]
    assert r["notPicked"] == [{"issue": 30, "reason": "blocked by #40, #41"}]
    assert "- #30 Lesson #30: blocked by #40, #41\n" in format_wave(r)


def test_a_closed_native_blocker_and_a_line_for_it_still_look_the_line_up() -> None:
    # gh gives #40 CLOSED, so `native_blockers` leaves it out, and the line
    # is checked by a lookup, never trusted from the relationship.
    raw: dict[str, object] = {"blockedBy": blocked_by_field(blocker_node(40, "CLOSED"))}
    local, foreign = nw.native_blockers(raw)
    assert (local, foreign) == ([], [])
    lookup = Lookups({40: state("CLOSED")})
    ready = [harness_issue(30, body="Blocked by #40", blocked_by=local)]
    r = harness_wave([], ready, lookup, today=TODAY)
    assert lookup.asked == [40]
    assert [w["issue"] for w in r["wave"]] == [30]
    assert r["blocked"] == []


def test_parse_splits_an_open_blocker_in_another_repository_by_its_url() -> None:
    raw: dict[str, object] = {
        "blockedBy": blocked_by_field(
            blocker_node(40),
            blocker_node(42, repo="other/repo"),
            blocker_node(43, "CLOSED", repo="other/repo"),
            blocker_node(44, repo="SchubergPhilis/AI-Training"),
        )
    }
    assert nw.native_blockers(raw) == ([40, 44], ["other/repo#42"])


def test_an_open_blocker_in_another_repository_alone_holds_the_issue_as_unreadable() -> None:
    lookup = Lookups({})
    ready = [harness_issue(30, foreign=["other/repo#42"])]
    r = harness_wave([], ready, lookup, only=[30], today=TODAY)
    assert r["wave"] == []
    unreadable = "Blocked by other/repo#42 (another repository)"
    assert r["blocked"] == [{"issue": 30, "title": "Lesson #30", "unreadable": [unreadable]}]
    assert r["notPicked"] == [{"issue": 30, "reason": f"unreadable dependency line `{unreadable}`"}]
    assert lookup.asked == []


def test_a_blocker_in_another_repository_does_not_answer_for_a_local_line() -> None:
    # Open other/repo#42 and a `Blocked by #42` line for a closed #42 here:
    # the line is looked up, and only the foreign blocker holds the issue.
    lookup = Lookups({42: state("CLOSED")})
    ready = [harness_issue(30, body="Blocked by #42", foreign=["other/repo#42"])]
    r = harness_wave([], ready, lookup, today=TODAY)
    assert lookup.asked == [42]
    unreadable = "Blocked by other/repo#42 (another repository)"
    assert r["blocked"] == [{"issue": 30, "title": "Lesson #30", "unreadable": [unreadable]}]


def test_native_blocks_a_lesson_too() -> None:
    lessons = plan([{"dir": "a", "course": ["a/1"], "lessons": [{"id": "a/1", "issue": 30}]}])
    r = lessons_wave(lessons, [issue(30, blocked_by=[40])], Lookups({}), today=TODAY)
    assert r["wave"] == []
    assert r["blocked"] == [{"issue": 30, "id": "a/1", "blockedBy": [], "blockedByIssues": [40]}]


def test_parse_issues_keeps_only_the_open_native_blockers() -> None:
    raw: list[dict[str, object]] = [
        {
            "number": 30,
            "title": "t",
            "assignees": [],
            "labels": [],
            "body": "",
            "blockedBy": blocked_by_field(
                blocker_node(40, "CLOSED"), blocker_node(41), blocker_node(42, "CLOSED")
            ),
        }
    ]
    parsed = nw.parse_issues(json.dumps(raw))[0]
    assert (parsed["blockedBy"], parsed["foreignBlockedBy"]) == ([41], [])


def test_parse_issue_state_reads_the_open_native_blockers() -> None:
    raw = json.loads(view_json())
    raw["blockedBy"] = blocked_by_field(blocker_node(40), blocker_node(41, "CLOSED"))
    raw["blockedBy"]["nodes"].append(blocker_node(42, repo="other/repo"))
    parsed = nw.parse_issue_state(json.dumps(raw))
    assert (parsed["blockedBy"], parsed["foreignBlockedBy"]) == ([40], ["other/repo#42"])


@pytest.mark.parametrize(
    ("field", "message"),
    [
        (None, "needs gh 2.94.0 or later"),
        ([], "blockedBy []"),
        ({"nodes": []}, "blockedBy {'nodes': []}"),
        ({"nodes": [], "totalCount": 1}, "blockedBy lists 0 of 1 blockers"),
        ({"nodes": [7], "totalCount": 1}, "blockedBy node 7"),
        ({"nodes": [{"number": 7}], "totalCount": 1}, "blockedBy node {'number': 7}"),
        (
            {"nodes": [{"number": 7, "state": "OPEN", "url": "x"}], "totalCount": 1},
            "'url': 'x'",
        ),
    ],
)
def test_native_blockers_rejects_a_field_it_cannot_read(field: object, message: str) -> None:
    raw: dict[str, object] = {} if field is None else {"blockedBy": field}
    with pytest.raises((KeyError, TypeError, ValueError), match=re.escape(message)):
        nw.native_blockers(raw)


def native_list(state_of_40: str) -> str:
    return json.dumps(
        [
            {
                "number": 30,
                "title": "Issue 30",
                "assignees": [],
                "labels": [{"name": "ready-for-agent"}, {"name": "harness"}],
                "body": "",
                "blockedBy": blocked_by_field(blocker_node(40, state_of_40)),
            }
        ]
    )


GH_HARNESS = GH_CONTENT.replace("-l content", "-l harness")


def test_main_lists_an_issue_only_the_relationship_blocks_as_blocked(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    outputs: dict[str, str | int | OSError] = {BUN: PLAN_JSON, GH_HARNESS: native_list("OPEN")}
    code, out, fake = run_main(monkeypatch, capsys, ["--kind", "harness", "--json"], outputs)
    assert code == 0
    assert [" ".join(c) for c, _ in fake.calls] == [BUN, GH_HARNESS]
    result = json.loads(out.stdout)
    assert result["wave"] == []
    assert result["blocked"] == [{"issue": 30, "title": "Issue 30", "blockedByIssues": [40]}]


def test_main_does_not_block_on_a_closed_native_blocker(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    outputs: dict[str, str | int | OSError] = {BUN: PLAN_JSON, GH_HARNESS: native_list("CLOSED")}
    code, out, fake = run_main(monkeypatch, capsys, ["--kind", "harness", "--json"], outputs)
    assert code == 0
    assert [" ".join(c) for c, _ in fake.calls] == [BUN, GH_HARNESS]
    result = json.loads(out.stdout)
    assert [w["issue"] for w in result["wave"]] == [30]
    assert result["blocked"] == []


def test_main_exits_1_and_names_the_gh_version_when_the_list_lacks_blocked_by(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh = '[{"number": 1, "title": "t", "assignees": [], "labels": [], "body": ""}]'
    code, out, _ = run_main(monkeypatch, capsys, [], {BUN: PLAN_JSON, GH: gh})
    assert code == 1
    assert out.stdout == ""
    assert out.stderr.startswith("next-wave: gh issue list failed: unreadable output: KeyError(")
    assert "needs gh 2.94.0 or later" in out.stderr


@pytest.mark.parametrize("command", [GH, view(5)])
def test_main_exits_1_and_names_the_gh_version_when_gh_has_no_blocked_by_field(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], command: str
) -> None:
    # What a gh before 2.94.0 prints for the field, and its exit code.
    unknown = b'Unknown JSON field: "blockedBy"\nAvailable fields:\n  assignees\n'
    # Every command but `command` works, so `--only 5` reaches the lookup.
    working = {BUN: PLAN_JSON.encode(), GH: b"[]"}

    def fake(argv: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
        joined = " ".join(argv)
        if joined == command:
            return subprocess.CompletedProcess(argv, 1, b"", unknown)
        return subprocess.CompletedProcess(argv, 0, working[joined], b"")

    monkeypatch.setattr(subprocess, "run", fake)
    with pytest.raises(SystemExit) as e:
        nw.main(["--only", "5"])
    assert e.value.code == 1
    err = capsys.readouterr().err
    name = " ".join(command.split()[:3])
    assert err == (
        unknown.decode()
        + f"next-wave: {name} failed: this gh has no blockedBy field,"
        + " which needs gh 2.94.0 or later\n"
    )


def test_run_passes_the_stderr_of_a_command_on_and_keeps_the_plain_failure_line(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fake(command: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
        return subprocess.CompletedProcess(command, 1, b"", b"HTTP 502\n")

    monkeypatch.setattr(subprocess, "run", fake)
    with pytest.raises(SystemExit):
        nw.run(["gh", "issue", "list"])
    assert capsys.readouterr().err == (
        "HTTP 502\nnext-wave: gh issue list failed: Command failed: gh issue list\n"
    )


def dependency_plan() -> list[PlannedLesson]:
    return plan(
        [
            {
                "dir": "a",
                "course": ["a/1", "a/2", "a/3", "a/4", "a/5"],
                "lessons": [
                    {"id": "a/1", "issue": 1},
                    {"id": "a/2", "issue": 2},
                    {"id": "a/3", "issue": 3, "assumes": ["a/c/o1"]},
                    {"id": "a/4", "issue": 4},
                    {"id": "a/5", "issue": 5, "serves": ["a/c/o1"]},
                ],
            }
        ]
    )


def test_lessons_blocks_on_an_open_blocker_a_future_date_and_an_unreadable_date() -> None:
    ready = [
        # #2 is fetched, so it is open without a lookup. #40 is looked up and open.
        issue(1, body="Blocked by #2\nBlocked by #40\nBlocked by #41"),
        issue(2, body="Not before 2026-10-01"),
        issue(3, body="Blocked by #40\nNot before 2026-02-30"),
        issue(4, body="Blocked by #41\nNot before 2026-09-26"),
        issue(5),
    ]
    lookup = Lookups({40: state(), 41: state("CLOSED")})
    r = lessons_wave(dependency_plan(), ready, lookup, only=[1, 2, 3, 4, 5], today=TODAY)
    assert ids(r["wave"]) == ["a/4", "a/5"]
    assert r["blocked"] == [
        {"issue": 1, "id": "a/1", "blockedBy": [], "blockedByIssues": [2, 40]},
        {"issue": 2, "id": "a/2", "blockedBy": [], "notBefore": "2026-10-01"},
        {
            "issue": 3,
            "id": "a/3",
            "blockedBy": [{"objective": "a/c/o1", "servedBy": ["a/5"]}],
            "blockedByIssues": [40],
            "unreadable": ["Not before 2026-02-30"],
        },
    ]
    # Each number outside the fetched set is looked up once per mention.
    assert sorted(set(lookup.asked)) == [40, 41]
    # A dependency-only block counts for no candidate's `unblocks`, and
    # neither does `a/3`: `a/5` serves its objective, but its `Blocked by`
    # line still holds it.
    assert [w["unblocks"] for w in r["wave"]] == [0, 0]
    assert r["notPicked"] == [
        {"issue": 1, "reason": "blocked by #2, #40"},
        {"issue": 2, "reason": "not before 2026-10-01"},
        {
            "issue": 3,
            "reason": (
                "blocked by a/5; blocked by #40; unreadable dependency line `Not before 2026-02-30`"
            ),
        },
    ]
    out = format_wave(r)
    assert "- #1 `a/1`: blocked by #2, #40\n" in out
    assert "- #2 `a/2`: not before 2026-10-01\n" in out
    assert (
        "- #3 `a/3`: assumes `a/c/o1` (served by `a/5`); blocked by #40;"
        " unreadable dependency line `Not before 2026-02-30`\n"
    ) in out


def test_lessons_does_not_read_the_lines_of_a_skipped_issue() -> None:
    ready = [issue(1, ["someone"], body="Blocked by #40"), issue(2, body="Blocked by #40")]
    lookup = Lookups({40: state()})
    r = lessons_wave(dependency_plan(), ready, lookup, only=[2], today=TODAY)
    assert r["blocked"] == [{"issue": 2, "id": "a/2", "blockedBy": [], "blockedByIssues": [40]}]
    assert lookup.asked == [40]


def test_the_default_today_is_the_utc_date(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nw, "today_utc", lambda: date(2026, 9, 30))
    ready = [issue(2, body="Not before 2026-09-30"), issue(4, body="Not before 2026-10-01")]
    r = lessons_wave(dependency_plan(), ready)
    assert [b["issue"] for b in r["blocked"]] == [4]
    assert nw.pick_wave(dependency_plan(), ready)["wave"][0]["issue"] == 2


def test_today_utc_reads_the_clock_in_utc(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import UTC, datetime, tzinfo

    class Clock(datetime):
        @classmethod
        def now(cls, tz: tzinfo | None = None) -> Clock:
            assert tz is UTC
            return cls(2026, 9, 26, 23, 30, tzinfo=UTC)

    monkeypatch.setattr(nw, "datetime", Clock)
    assert nw.today_utc() == date(2026, 9, 26)


def test_content_blocks_on_the_lines_and_prints_the_blocked_section_only_then() -> None:
    ready = [
        issue(30, labels=["content"], body="Blocked by #40"),
        issue(31, labels=["content"], body="Blocked by #41\nNot before 2026-09-20"),
        issue(32, labels=["content"], body="Not before 2027-01-01"),
        issue(33, ["someone"], ["content"], body="Blocked by #40"),
    ]
    lookup = Lookups({40: state(), 41: state("CLOSED")})
    r = content_wave(plan_lessons(), ready, lookup, only=[30, 31, 32, 33], today=TODAY)
    assert [w["issue"] for w in r["wave"]] == [31]
    assert r["blocked"] == [
        {"issue": 30, "title": "Lesson #30", "blockedByIssues": [40]},
        {"issue": 32, "title": "Lesson #32", "notBefore": "2027-01-01"},
    ]
    assert r["notPicked"] == [
        {"issue": 30, "reason": "blocked by #40"},
        {"issue": 32, "reason": "not before 2027-01-01"},
        {"issue": 33, "reason": "assigned"},
    ]
    out = format_wave(r)
    assert (
        "| #31 | Lesson #31 | `content` |\n\n## Blocked (2)\n\n"
        "- #30 Lesson #30: blocked by #40\n"
        "- #32 Lesson #32: not before 2027-01-01\n\n## Skipped (1)\n"
    ) in out
    # The JSON keeps the keys it had and adds `blocked` last.
    assert list(r) == ["kind", "size", "only", "wave", "skipped", "waiting", "notPicked", "blocked"]
    free = content_wave(plan_lessons(), [issue(31, labels=["content"])], lookup, today=TODAY)
    assert "## Blocked" not in format_wave(free)


def test_parse_issue_state_tells_a_pull_request_from_an_issue() -> None:
    assert nw.parse_issue_state(view_json("MERGED", kind="pull")) == state(
        "MERGED", pull_request=True
    )
    assert nw.parse_issue_state(view_json(labels=["content"])) == state(labels=["content"])


def test_main_fetches_a_content_wave_with_both_labels_and_looks_up_a_blocker_once(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh = json.dumps(
        [
            {
                "number": n,
                "title": f"Issue {n}",
                "assignees": [],
                "labels": [{"name": "ready-for-agent"}, {"name": "content"}],
                "body": "Blocked by #90",
                "blockedBy": NO_BLOCKERS,
            }
            for n in (30, 31)
        ]
    )
    monkeypatch.setattr(nw, "today_utc", lambda: TODAY)
    outputs: dict[str, str | int | OSError] = {
        BUN: PLAN_JSON,
        GH_CONTENT: gh,
        view(90): view_json("CLOSED"),
    }
    code, out, fake = run_main(monkeypatch, capsys, ["--kind", "content"], outputs)
    assert code == 0
    assert [" ".join(c) for c, _ in fake.calls] == [BUN, GH_CONTENT, view(90)]
    assert "| #30 | Issue 30 |" in out.stdout
    assert "| #31 | Issue 31 |" in out.stdout


def test_main_fetches_a_code_wave_with_the_code_label(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh = json.dumps(
        [
            {
                "number": n,
                "title": f"Issue {n}",
                "assignees": [],
                "labels": [{"name": "ready-for-agent"}, {"name": "code"}, *extra],
                "body": "",
                "blockedBy": NO_BLOCKERS,
            }
            for n, extra in ((30, []), (31, [{"name": "bug"}]))
        ]
    )
    command = GH_CONTENT.replace("-l content", "-l code")
    code, out, fake = run_main(
        monkeypatch, capsys, ["--kind", "code"], {BUN: PLAN_JSON, command: gh}
    )
    assert code == 0
    assert [" ".join(c) for c, _ in fake.calls] == [BUN, command]
    assert out.stdout.startswith(
        "## Wave (2 of 6, code)\n\n| Issue | Title | Labels |\n| ----- | ----- | ------ |\n"
        "| #31 | Issue 31 | `ready-for-agent`, `code`, `bug` |\n"
        "| #30 | Issue 30 | `ready-for-agent`, `code` |\n"
    )


def test_main_fetches_a_harness_wave_with_the_harness_label_and_a_size_of_four(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gh = json.dumps(
        [
            {
                "number": n,
                "title": f"Issue {n}",
                "assignees": [],
                "labels": [{"name": "ready-for-agent"}, {"name": "harness"}],
                "body": "",
                "blockedBy": NO_BLOCKERS,
            }
            for n in range(30, 36)
        ]
    )
    command = GH_CONTENT.replace("-l content", "-l harness")
    code, out, fake = run_main(
        monkeypatch, capsys, ["--kind", "harness", "--json"], {BUN: PLAN_JSON, command: gh}
    )
    assert code == 0
    assert [" ".join(c) for c, _ in fake.calls] == [BUN, command]
    result = json.loads(out.stdout)
    assert (result["kind"], result["size"]) == ("harness", 4)
    assert [w["issue"] for w in result["wave"]] == [30, 31, 32, 33]
    assert [w["issue"] for w in result["waiting"]] == [34, 35]


def test_main_exits_1_when_a_lookup_fails_or_is_unreadable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # `gh issue view` exits 1 for a number that doesn't exist.
    outputs: dict[str, str | int | OSError] = {BUN: PLAN_JSON, GH: "[]", view(5): 1}
    code, out, _ = run_main(monkeypatch, capsys, ["--only", "5"], outputs)
    assert code == 1
    assert out.stdout == ""
    assert out.stderr == f"next-wave: gh issue view failed: Command failed: {view(5)}\n"
    for unreadable in ('{"state": "OPEN"}', '{"state": null, "url": "u"}'):
        outputs[view(5)] = unreadable
        code, out, _ = run_main(monkeypatch, capsys, ["--only", "5"], outputs)
        assert code == 1
        assert out.stderr.startswith("next-wave: gh issue view failed: unreadable output: ")


def test_main_exits_1_when_the_list_reaches_the_limit(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(nw, "ISSUE_LIMIT", 2)
    gh = json.dumps(
        [
            {
                "number": n,
                "title": "t",
                "assignees": [],
                "labels": [],
                "body": "",
                "blockedBy": NO_BLOCKERS,
            }
            for n in (1, 2)
        ]
    )
    limited = GH.replace("-L 1000", "-L 2")
    code, out, _ = run_main(monkeypatch, capsys, [], {BUN: PLAN_JSON, limited: gh})
    assert code == 1
    assert out.stdout == ""
    assert out.stderr == (
        "next-wave: gh issue list failed: 2 issues reach the -L limit,"
        " so the list may be cut short\n"
    )
