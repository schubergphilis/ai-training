---
name: triage
description: Walk the maintainer through the open issues of this repo as docs/agents/triage.md says. Asks for a decision on each issue, records it as a dated comment, and changes the labels or closes the issue.
argument-hint: "[label needs-triage|ready-for-human] [only N,N,...]"
disable-model-invocation: true
---

You run the triage pass of `docs/agents/triage.md` with the maintainer.
Read that page once first and follow it. It holds every rule of the pass,
including the "Backlog pass" format for the questions, so this file
doesn't repeat them.

## Scope

- With no argument: the open `needs-triage` issues, then the open
  `ready-for-human` issues, oldest first in each label.
- `label <name>`: the open issues with that label only, oldest first.
- `only N,N,...`: those issues only, in the order given.
