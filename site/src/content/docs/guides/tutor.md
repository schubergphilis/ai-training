---
title: How to study with the tutor
description: Install the ai-tutor skill in Claude Code or opencode, open a lesson with it, and know what it does and doesn't do.
---

The tutor is Claude acting as a study partner for one lesson of this site.
It runs inside your own coding agent and reads the lesson you name, and it
gives hints while keeping the answers back. This page gets you from
nothing installed to a first session, and reading it doesn't count toward
any course progress.

## Install

You need one of the two agents the tutor works in, [Claude
Code](https://code.claude.com/docs/en/overview) or
[opencode](https://opencode.ai/docs/), and Node.js, because the install
command runs with `npx`.

Install the skill into your user directory, so it is found from any folder
you start the agent in:

```sh
npx skills add schubergphilis/ai-training --skill ai-tutor -g
```

The `skills` command detects which agents you have and installs the skill
for each of them. Then check that it is listed:

```sh
npx skills list -g
```

The output includes a line for `ai-tutor`. When the site's instructions need a
newer skill, the tutor tells you to run the same install command again.

## First session

Open the lesson [Your first session with a coding
agent](/coding-with-agents/first-session/) in your browser and copy its
URL. Start your agent in any folder and give it the lesson.

In Claude Code, the skill has a slash command:

```text
/ai-tutor https://schubergphilis.github.io/ai-training/coding-with-agents/first-session/
```

opencode has no slash command per skill, so write a plain request that
names the skill:

```text
Use the ai-tutor skill on https://schubergphilis.github.io/ai-training/coding-with-agents/first-session/
```

The tutor first fetches its instructions and the lesson from the site, one
`curl` command each. Your agent may ask you to approve each command. Say
yes to both.

A correct first reply names the lesson by its title, says it has the page at
that URL, and offers the verbs listed below. If you pasted a progress
export and a review is due, it asks one recall question before that.

## What the tutor does

Every verb works on the lesson you named and on nothing else.

- **explain**: explains a concept in the lesson's own words, then gives one
  example.
- **key points**: lists the lesson's main points from its recap.
- **explain like I am five**: re-explains a concept with an everyday
  comparison, then ties it back to the definition.
- **why it matters**: connects what the lesson teaches to your own work.
- **quiz me**: asks one question at a time, with a hint when you miss.
- **test me**: asks you to show a behavior from the lesson and grades your
  attempt.
- **critique this**: writes an answer with planted faults for you to find,
  and grades your critique.

The tutor gives hints only. On a wrong checkpoint answer it asks one
question. On the next wrong answer it points at the section that teaches
the idea, and after that it gives a smaller example of the same idea.
After three tries it sends you back to the page. Asking it to "just tell
me" gets the same hint ladder.

## What the tutor doesn't do

- It can't read your progress from the browser. Export your progress on
  the [settings](/settings/) page and paste the file into the session if
  you want the recall question.
- It stays on the lesson you named. For another lesson, start again with
  that lesson's URL.
- It never gives the answer to a checkpoint or an exercise, before or
  after a hint.
- It never edits a file on your machine. Its only file read is a progress
  export you hand it.

## Recommended flags

The tutor runs one `curl` command per fetch and no other command. When your
agent has no shell tool, it uses the agent's built-in fetch tool instead
and tells you that the lesson text may be incomplete. These settings
make each fetch one approval you see, and stop anything else. The tutor
works without them too.

For Claude Code, start in the mode that asks before a command, unless your
settings already allow that command:

```sh
claude --permission-mode manual
```

The `manual` value needs Claude Code 2.1.200 or later. On an older
version use `--permission-mode default`, which is the same mode under its
config name. To also refuse file edits outright, add
`--disallowedTools Edit Write`.

For opencode, use the built-in plan agent, which asks before every edit
and every command:

```sh
opencode --agent plan
```

You can also press Tab inside a running opencode session until the
status line shows the plan agent.

## When it fails

When a fetch fails, the tutor says so in one sentence, names the URL that
failed, and offers to continue from the page you have open as a plain
conversation without the verbs. That's expected behavior and means the
tutor couldn't read the site, so its hints would be from memory rather
than from the page. Check two things:

1. Your network. Open the failed URL in your browser. If it doesn't load
   there either, the site or your connection is down.
2. The URL you pasted. Only lesson pages have a bundle for the tutor.
   Course pages, guides like this one, and reference pages don't, and the
   tutor asks you for a lesson URL instead.

If both are fine and it still fails, file an issue in the
[issue tracker](https://github.com/schubergphilis/ai-training/issues) with the
failed URL and the tutor's message.
