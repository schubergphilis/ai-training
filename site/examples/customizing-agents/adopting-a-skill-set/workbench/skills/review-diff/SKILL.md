---
name: review-diff
description: Review the staged changes before a commit. Use when the user asks for a review of a diff or of staged changes.
license: Apache-2.0
---

# Review the staged changes

1. Run `git diff --cached` and read every changed file in full.
2. For each change, check that it does what the ticket asks and nothing
   else.
3. Check that each new function has a test and a docstring.
4. Report each finding with the file, the line and a suggested fix. Don't
   change any file yourself.
