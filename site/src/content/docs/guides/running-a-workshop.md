---
title: Running a workshop
description: Plan and run a one-day, face-to-face workshop on one area of this site, with three tables for three levels.
---

## Who this is for

This guide is for a trainer who runs one area's course as a face-to-face
workshop. The room holds 6 to 20 people with their own laptops, and one
trainer works with a few helpers. The site is the reference for everything
taught. The
worked example is the [Coding with agents](/coding-with-agents/) course, and
the same plan works for any other area.

## Three tables

The room has three tables, one per level. People sit at the table that fits
how they learn best on the day, and the placement quiz suggests which one.

- **(A) Clear-instruction.** For people who can't reasonably learn this
  material from the site on their own. The trainer gives them the most
  time: a demonstration first, then the same task done together, then
  alone. Who finishes early repeats the exercise without the worked example.
  This level is for the workshop only and has no site setting.
- **(B) Less comfortable.** The site's `less` comfort level. People here
  can work from the site with hints, so they try the exercise first and
  discuss it after. Who finishes early takes the stretch goal.
- **(C) More comfortable.** The site's `more` comfort level. People here
  work ahead and time their own work against a forecast. Who finishes early
  helps table B.

Learners set their comfort level on the [settings](/settings/) page, so ask
B and C to set theirs at the start of the day. Table C helps table B, and
never table A, because table A needs a slower pace and a fixed method.
Anyone may move to another table after the first block.

## Before the day

- Send the placement quiz and the setup instructions a week ahead.
- Offer a 30-minute drop-in setup call. By its end, each person has the
  agent installed and signed in, the fixture repository copied, and one
  command run in it.
- Have one helper for every eight participants, and put most of them at
  table A.
- Do every exercise yourself in the current version of the site.
- Bring two colors of sticky notes for each person.
- Set the date of the follow-up session.

For Coding with agents, the setup instructions are the steps in [The
fixture](/coding-with-agents/first-session/#the-fixture) section of the first
lesson. They clone the course repository and copy one lesson's fixture into
the home directory as a new git repository.

## The placement quiz

The quiz takes ten minutes. Present it as the first exercise of the day.
You grade no answers, and nobody sees a score. Take every item from the area's
own lessons. The example items below come from Coding with agents.

- **Self-placement, two items.** Each item gives one sentence per level, and
  the person picks the one that describes them best. Example: "I want to
  watch someone do it before I try" (A), "I can follow written steps and ask
  when I get stuck" (B), "I would rather start on my own and compare after"
  (C).
- **What do you do next, two items.** Each item shows a task and part of an
  agent's output, with four options. Each option marks a level. Example: the
  agent says it fixed the off-by-one error in `done()` and shows a diff
  without test output. The options are "commit it" (A), "read the diff" (B),
  "run the tests yourself" (C), and "ask it to explain the diff" (B).
- **Ordering, one item.** The steps of a change, shuffled, to put back in
  order. Example: "let the agent make the change", "run the tests", "ask the
  agent for a plan and read it". The order is plan, then change, then tests.
- **What does this print, one item.** A short piece of real code, as in the
  site's predict checkpoints. Example: in the first lesson's fixture, after
  `python3 todo.py add "Buy milk"` and `python3 todo.py add "Call Sam"`,
  what does `python3 todo.py done 1` print? It prints `done #1: Call Sam`.
- **Usage, one item.** "The last time you used an assistant, at what point
  did you first ask it for code?"

To score, count the answers marked A, B, and C for each person. The person
starts at the table with the highest count, and a tie goes to the lower
table. This quiz is
untested, so record each person's answers next to the table where they
ended the day.

## The day

These timings are a guideline and untested. Correct them after your first
workshop and note what changed.

| When | What                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Shared opening, 30 min: a short non-coding puzzle, why three tables, the placement result, permission to move, a 1-to-5 confidence number |
| 0:30 | Block 1, 60 min                                                                                                                           |
| 1:30 | Break, 15 min, minute cards, re-seat                                                                                                      |
| 1:45 | Block 2, 60 min                                                                                                                           |
| 2:45 | Plenary, 15 min: one question to the whole room, answer alone, discuss in pairs, answer again                                             |
| 3:00 | Lunch, 45 min, minute cards, re-seat                                                                                                      |
| 3:45 | Block 3, 60 min                                                                                                                           |
| 4:45 | Break, 15 min, minute cards                                                                                                               |
| 5:00 | Block 4, 60 min                                                                                                                           |
| 6:00 | Shared closing, 30 min                                                                                                                    |

A two-day workshop repeats blocks 1 to 4 on day two. Day one then ends
with minute cards and a re-seat. The trainer chooses which lessons fill
which block for each area. For Coding with agents, blocks 1 and 2 can look
like this:

| Block | Table A                                                                                            | Table B                                                                                                  | Table C                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1     | [Your first session with a coding agent](/coding-with-agents/first-session/), with a demonstration | The same lesson                                                                                          | The same lesson, then [Keeping API keys out of the agent's reach](/coding-with-agents/keys-and-secrets/)          |
| 2     | [Keeping API keys out of the agent's reach](/coding-with-agents/keys-and-secrets/)                 | The same lesson, then [Deciding whether to build it at all](/coding-with-agents/deciding-what-to-build/) | [Splitting the work into components the agent can build one at a time](/coding-with-agents/decomposing-the-work/) |

**Shared opening.** Everyone sits together for the puzzle and the reasons
for three tables. Then each person writes down a confidence number from 1
to 5 and goes to the table the quiz suggested.

**A 60-minute block.** Each block has four parts. Connect (5 min) links
the block to what people already did. Concepts (0 to 10 min) is longest at
table A and can be zero at table C. Practice (35 to 45 min) is the
exercise, in pairs. Conclusions (10 min) is a short debrief at each table.

**Break.** Collect the minute cards, read them during the break, and use
them to suggest table moves before the next block.

**Plenary question.** Ask the whole room one question with a few possible
answers. People answer alone, discuss in pairs, and answer again, and the
change between the two answers tells you what to explain.

**Closing.** Pairs present their work, and everyone picks one habit and
writes down a second confidence number. The section "Closing and follow-up"
below has the details.

## Exercise rules

- Give each exercise a start state, a finished state, and a diff between
  them. In your copy of the fixture, commit the finished state of each
  exercise, so a pair can reset to the start or jump ahead.
- Leave one thing for the pair to figure out, and build the rest for them in
  advance.
- Always give the agent a check it can run, such as a test, or a command with
  a known output.
- Table A starts from a worked example of the same exercise, with the brief
  and the check given and only the prompt to write. Tables B and C start from
  the exercise as the lesson states it, and the stretch goal is for whoever
  finishes.
- Ask each pair for three options before they commit to one.
- Write "review every line of the diff" into table A's instructions.

## Room rules

- People work in pairs within their own table. They swap roles three or four
  times an hour, and the less experienced person types.
- Check understanding every 10 to 15 minutes with something cheap. Use a
  sticky note on the laptop, a number from 1 to 5, or a one-line recall
  question.
- Hand out minute cards at every break. Each card has one thing learned and
  one open question, and you use them to re-seat people.
- Never teach alone. A second person keeps the room moving while you help
  one pair.
- Let advanced participants help others, and keep them off the microphone.
- Start and end breaks on time, and keep a workshop to two days at most.

## Per table

**Table A.** Demonstrate the exercise with a deliberate mistake, run it,
and let the room see it fail. Then do the exercise together, and then let
pairs do it alone. Use the [tutor](/guides/tutor/) as the assistant here.
It gives hints and keeps the answers back. After a wrong answer it asks a
question, and after the next one it points to the section that teaches the
idea.

**Table B.** People try the exercise first and debrief after. Teach them to
write the check before the prompt. Before they let the agent run a command,
ask what the worst result of that command could be.

**Table C.** People forecast the time an exercise takes and compare it with
the actual time. Give them harness work, such as project instructions,
hooks, and parallel worktrees. Ask them to decide what they would not hand
to the agent, and why.

## Closing and follow-up

- Each pair explains one change they made and how they checked it, in two
  minutes.
- Each person picks one habit from a lesson they finished. The site offers
  habits after a finished lesson and brings them back on a fixed schedule.
- Hold a one-hour follow-up two to four weeks later.
- Ask for a confidence number from 1 to 5 at the start and at the end of the
  day, on the same scale.

## What to record

- Each person's quiz answers, next to the table where they ended the day.
- A feedback form per exercise. It has one line per exercise (too easy,
  right, or too hard) and one comment.
- The minute cards.
- Table C's time forecasts next to the actual times.
- Both confidence numbers for each person.

The timings above and the quiz cut-offs get corrected from these records,
so keep them for every workshop.

## Further reading

- [Teaching Tech Together](https://teachtogether.tech/en/): Greg Wilson's
  book on the approach this guide follows, in particular the chapters [In the
  Classroom](https://teachtogether.tech/en/index.html#s:classroom) and
  [Teaching Online](https://teachtogether.tech/en/index.html#s:online) and
  the section [Plan for Mixed
  Abilities](https://teachtogether.tech/en/index.html#s:classroom-mixed).
- [The Carpentries instructor training](https://carpentries.github.io/instructor-training/):
  the course material behind sticky notes, minute cards and working with
  helpers.
- [CS50 Educator Workshop](https://cs50.harvard.edu/workshop/): links to the
  yearly workshop recordings on YouTube, on teaching less comfortable
  students and on teaching with AI.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices):
  Anthropic's list of five common failure patterns, which works as a
  checklist in debriefs.
- [How I Teach](https://kentcdodds.com/blog/how-i-teach): Kent C. Dodds on
  doing the exercise before the explanation, and on a feedback form after
  each exercise.
