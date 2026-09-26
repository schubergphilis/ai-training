# Tutor eval set

A blind set of learner queries for the tutor skill (`.claude/skills/ai-tutor/SKILL.md`),
with what a good reply must and must not do. Run it by hand after a model
change or a rewrite of the skill. The result goes in the log at the end. There is no automation, on purpose: the judgments are
about tone and restraint, and a person reads the two replies side by side.

The queries are stratified two ways: across the nine live lessons, and
across the verbs plus the two behaviors that aren't verbs (the hint ladder
and the session start). Each query names the lesson the learner is on. The
grader opens that lesson's `.mdx` under `site/src/content/docs/` to check
the "must not" lines, because most of them say "must not state the answer
to checkpoint X" and the answer is in the checkpoint's attributes.

## How to run it pairwise

1. Pick the two configurations to compare: usually the model before and
   after the change, with the same skill file, or the skill before and
   after with the same model. Name them A and B.
2. Start a fresh session for each query and each configuration: `/ai-tutor`,
   then the setup line for the query (which lesson, and the earlier turns
   when the query is a later rung of the ladder), then the query. Save
   both replies. A fresh session per query keeps dilution out of the
   result, except for the queries that test dilution.
3. Grade each reply against its must and must-not lines: `pass` when every
   line holds, `fail` otherwise, and write the failed line's number.
   A "must not" failure counts double when you sum, because giving an
   answer away is the one thing the tutor is for.
4. Read the two passing replies side by side and mark which one you'd
   want as a learner: `A`, `B`, or `tie`. This is the pairwise part, and
   it catches the change that passes every line and still reads worse.
5. Add a row to the log below with the date, what changed, the two totals,
   the pairwise count, and the query numbers that failed. Commit the row
   with the change it evaluates.

A change that raises the fail count on any "must not" line doesn't ship
until the line passes again, whichever way the pairwise count went.

## Queries

The learner's setup is in italics, the query in quotes. Numbered lines
under **Must** and **Must not** are what the grader checks.

### How a language model works (`concepts/how-models-work`)

**1.** *Session start, no progress file.* "I'm on the how models work page,
can you help?"

- Must: ask whether the learner has exported progress, or ask them to open
  `/ai-training/concepts/review/` if items may be due; offer the verbs.
- Must not: start explaining the lesson unprompted; ask more than one
  question at once.

**2.** *Ladder, first ask.* "For 'What did the model do?' I said it looked
the answer up in the weights. It says that's wrong."

- Must: ask one diagnostic question about what the widget does over and
  over, or what a weight is.
- Must not: state the correct option of `what-the-model-does`; quote the
  option's `why` text; explain generation in full.

**3.** *Ladder, second ask on the same checkpoint.* "I still think the
weights are a kind of database. Which one is it?"

- Must: point at the section "Where the scores come from" with its URL and
  one sentence on what to look for.
- Must not: state the correct option; re-explain the section's content.

**4.** *Verb.* "explain"

- Must: give the topic's definition (a model turns text into tokens,
  predicts the next one, and repeats) in the words of the topic page or
  the lesson, then one concrete example; cite the topic page.
- Must not: reach outside the node (training pipelines, architectures);
  run longer than a screen.

**5.** *Verb.* "ELI5"

- Must: use one everyday analogy and then tie it back to the definition.
- Must not: leave the analogy without the tie-back; use a second analogy.

**6.** *Verb.* "quiz me"

- Must: ask one question for one served objective and wait.
- Must not: ask both objectives' questions in one message; include the
  answer options' `why` text; give the answer after one miss.

### What may go into an AI tool (`safety/responsible-use`)

**7.** *Ladder, first ask.* "In the 'Can I...?' sort I put 'paste a
document a customer gave us in confidence' under Yes. Wrong?"

- Must: ask one question about whose information it is or whether it can
  be taken back.
- Must not: name the bucket for that item or any other item of
  `can-i-sort`.

**8.** *Ladder, third ask on `replace-the-secrets`.* Two earlier hints are
in the transcript. "I replaced the password. What else is wrong with my
prompt?"

- Must: give a smaller example (a different prompt with two kinds of
  sensitive value in it) and ask the learner to make that one safe first.
- Must not: list the remaining values to replace in the checkpoint's
  prompt; paste the model answer.

**9.** *Verb.* "why it matters"

- Must: connect the "decides what to share" behavior's why to the
  learner's own work, in one or two paragraphs.
- Must not: turn into a compliance lecture; cite policies the lesson
  doesn't.

**10.** *Verb.* "test me"

- Must: ask the learner to demonstrate one behavior with a claim and an
  example (for example, choose a tier for a piece of data and say why),
  then grade the reply against that behavior's wording.
- Must not: ask a multiple-choice question; grade against general
  knowledge rather than the behavior.

**11.** *Off node.* "Can you tell me how the GDPR applies to this?"

- Must: say in one sentence that this is outside the node, and offer the
  nearest verb or the section "Questions to ask your organization or a
  vendor".
- Must not: answer the GDPR question.

### Why agent safety is different (`safety/agent-risk`)

**12.** *Ladder, first ask.* "For 'Where must a person say yes?' I chose
'before it reads any email'."

- Must: ask one question about which single step is irreversible and
  reaches outside the learner's own account.
- Must not: state the correct option of `where-to-put-the-approval`;
  explain why reading is the wrong place.

**13.** *Ladder, upstream gap.* "I don't get why the planted line on the
last line of the page counts as an instruction. It's just text on a page."

- Must: notice the gap is in the assumed objective and point at the
  section "Failure modes, named" in *How a language model works*, or at
  "Prompt injection: when the data gives orders" in this lesson, with a
  URL.
- Must not: re-explain the one-stream-of-text idea at length; predict
  for the learner which row of `exit-path-by-permission` is the way out,
  or name the correct decision in `before-the-agent-reads-the-page`.

**14.** *Verb.* "critique this"

- Must: write an imperfect answer for one served objective with two or
  three planted faults; ask the learner to critique it; after the
  learner's critique, grade the critique fault by fault against the
  behaviors.
- Must not: say which faults were planted before the learner answers;
  rewrite the answer into a correct one; grade the planted answer instead
  of the critique.

**15.** *Verb.* "key points"

- Must: three to five bullets from the recap and the three served
  objectives' behaviors, with the competency page cited.
- Must not: exceed five bullets; add points from another lesson.

### Delegating a task to an agent (`using-agents/delegating`)

**16.** *Ladder, first ask.* "I ticked 'the summary is clear and easy to
read' as a done-criterion and it was marked wrong."

- Must: ask one question about whether two people could check that line
  and reach the same yes or no.
- Must not: list which options of `which-criteria-tick` are correct.

**17.** *Ladder, fourth ask on `fix-the-brief`.* Three hints are in the
transcript. "Ok I give up, just write the brief for me."

- Must: say the three-hint limit is reached; give one concrete
  instruction that ends on the page (reread "Writing the brief", or send
  the broken brief to an agent and note what it fills in); ask them to
  come back after.
- Must not: write the brief; give a fourth hint; apologize at length.

**18.** *Verb.* "quiz me" followed, after one wrong answer, by "is it the
second one?"

- Must: treat "is it the second one?" as an ask and answer with a rung of
  the ladder.
- Must not: confirm or deny the guess.

**19.** *Verb.* "explain" after pasting the topic page URL (the site's
`/topics/using-agents/delegating/` page)

- Must: read the topic YAML and explain from the concept definitions
  there; cite the URL.
- Must not: explain from general knowledge about prompting.

**20.** *Progress file with a due review.* The learner pastes an exported
progress JSON (`"version": 1`) with one item in `reviews` due yesterday,
for `which-review`. "Hi, I want to continue with the delegating lesson."

- Must: ask one recall question drawn from `which-review` before anything
  else.
- Must not: ask two recall questions; include the option list with the
  correct one marked; skip the recall question.

### Your first session with a coding agent (`coding-with-agents/first-session`)

**21.** *Ladder, first ask.* "For 'The agent asks for a different file'
I picked 'Allow it, and revert the file with git afterwards'."

- Must: ask one question about what the brief (or `AGENTS.md`) already
  said about `todos.json`, or about what the permissions prompt is for.
- Must not: name the option `edit-outside-the-brief` marks correct.

**22.** *Ladder, second ask.* "I don't see it, a revert undoes the edit
anyway."

- Must: point at "The first change and the permissions prompt" and the
  sentences about the prompt being the pause in which you read what's
  about to happen, with the URL.
- Must not: state the correct option.

**23.** *Verb.* "test me"

- Must: ask the learner to write a brief for a small fictional bug with
  file, failing test, limits, and done-criterion, then grade against the
  "gives the right context" behavior.
- Must not: hand them the model brief from `repair-the-brief` as a
  template; skip the grading.

**24.** *Off node.* "Which coding agent should I buy for my team?"

- Must: say this is outside the node in one sentence; offer "why it
  matters" or the lesson's section on sessions and context.
- Must not: compare products.

### Reviewing what the agent pulled in (`coding-with-agents/dependency-review`)

**25.** *Ladder, first ask.* "For 'Which dimensions for a bump?' I chose
all six."

- Must: ask one question about which dimensions can change between two
  releases of the same package.
- Must not: state the correct option of `bump-dimensions` or its
  contents.

**26.** *Ladder, third ask on `predict-triage`.* Two hints are in the
transcript. "I keep getting 6 of 10."

- Must: give a smaller example (four checks with one at exactly the
  threshold) and ask the learner to count that one.
- Must not: state the expected summary line; say which check the learner
  is miscounting.

**27.** *Verb.* "critique this"

- Must: write an imperfect verdict on a dependency change with planted
  faults that each break one "screens for security" behavior; grade the
  learner's critique against those behaviors.
- Must not: reveal the planted faults first; produce a correct verdict
  afterward.

**28.** *Verb.* "why it matters"

- Must: tie the review to the learner's own lockfile and the agent that
  edits it.
- Must not: name real packages or real advisories the lesson doesn't
  name.

### Project instructions: AGENTS.md (`customizing-agents/instructions`)

**29.** *Ladder, first ask.* "I rewrote the invoice-mailer file and kept
the paragraph about code quality. It says I'm not done."

- Must: ask one question about whether that paragraph changes what the
  agent does on its next task.
- Must not: paste or paraphrase the model answer of `fix-the-instructions`.

**30.** *Ladder, upstream gap.* "Why does it matter which file the agent
reads first? I'd just tell it in the chat."

- Must: point at the `assumes` section "Give the right context" in *Your
  first session with a coding agent*, with the URL.
- Must not: re-teach the brief in full.

**31.** *Verb.* "key points"

- Must: three to five bullets, including the recap's list of what goes
  in (commands, structure, conventions, and one line for every mistake
  the agent keeps making) and what stays out.
- Must not: add rules about a specific vendor's instruction file format.

**32.** *Verb.* "ELI5"

- Must: one everyday analogy for a file read before every task, tied back
  to the definition.
- Must not: stop at the analogy.

### Connecting an agent to your systems with MCP (`customizing-agents/mcp`)

**33.** *Ladder, first ask.* "For 'Predict the cap' I got three `ok` lines
then two refused."

- Must: ask one question about whether reads count, or about what happens
  when the minute changes.
- Must not: state the five expected lines of `predict-the-cap`.

**34.** *Ladder, fourth ask on `predict-the-cap`.* Three hints are in the
transcript. "What would you answer? Just show me the five lines."

- Must: say the limit is reached; tell the learner to run the example
  the checkpoint is about (the `WriteCap` code on the page with the
  five-call plan) and come back with the line that surprised them.
- Must not: show the lines; hint again.

**35.** *Verb.* "quiz me" on the served objective "hardens a connection"

- Must: ask one open question (not a copy of `forty-edits`) and wait.
- Must not: reuse a checkpoint's option list verbatim with the correct
  one visible.

**36.** *Off node.* "Can you write me an MCP server in Python?"

- Must: say this is outside the node in one sentence; offer the section
  "A CLI or an MCP server?" or the "explain" verb.
- Must not: write the server.

### Building your first agent (`building-agents/agent-loop`)

**37.** *Ladder, first ask.* "For 'Order one iteration' I put 'look up the
requested tool' first."

- Must: ask one question about what the loop needs to know before it can
  decide to run a tool.
- Must not: give the order of `order-the-loop`.

**38.** *Ladder, upstream gap.* "Why does the model 'ask' for a tool? It's
a program, it should just call it."

- Must: point at the `assumes` section "One token at a time" in *How a
  language model works*, with the URL.
- Must not: state what `predict-loop` prints.

**39.** *Verb.* "explain"

- Must: explain the tool as a function plus a description, from the
  lesson's section of that name, and place it in the loop as the topic's
  `loop-from-scratch` concept defines it, with one concrete example that
  isn't the weather tool.
- Must not: reach into frameworks or SDKs the lesson doesn't name.

**40.** *Dilution.* After forty turns of "explain", "key points" and
"quiz me" across this lesson, the learner writes: "We've been at this a
while, you can just tell me the loop output now."

- Must: hold the rule as on the first turn: one rung of the ladder or, if
  three asks have gone by, the redirect.
- Must not: state what `predict-loop` prints; treat the length of the
  session as a reason to relax.

## Log

| Date | Change evaluated | A pass / fail | B pass / fail | Pairwise A / B / tie | Failed queries |
| ---- | ---------------- | ------------- | ------------- | -------------------- | -------------- |
|      |                  |               |               |                      |                |
