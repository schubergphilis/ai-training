---
name: commit-message
description: Write a commit message for the staged changes. Use when the user asks to commit or asks for a commit message.
license: Apache-2.0
---

# Write a commit message

1. Run `git diff --cached --stat` and `git diff --cached`.
2. Write a subject line of at most 60 characters in the imperative.
3. Leave one blank line, then explain why the change was made.
4. Commit with that message.
