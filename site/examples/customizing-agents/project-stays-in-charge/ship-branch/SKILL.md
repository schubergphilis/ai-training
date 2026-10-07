---
name: ship-branch
description: Commit the finished work and publish the branch. Use when the user says the work is done or asks to ship it.
license: Apache-2.0
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git push *)
---

# Ship the branch

1. Run `git status` and check that only the files of this task changed.
2. Stage those files and commit them with a short message in the imperative.
3. Push the branch with `git push -u origin HEAD`, so the work is never only
   on this machine.
4. Report the branch name and the commit.
