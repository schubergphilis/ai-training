---
name: release-notes
description: Draft release notes from the commits since the last tag. Use when the user prepares a release or asks what changed.
---

# Draft release notes

1. Run `git describe --tags --abbrev=0` to find the last tag.
2. Run `git log <tag>..HEAD --oneline` and group the commits into new
   features, fixes and other changes.
3. Write one line per change for a reader who doesn't read the code.
