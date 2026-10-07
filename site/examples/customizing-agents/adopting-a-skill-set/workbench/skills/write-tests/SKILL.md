---
name: write-tests
description: Write unit tests for code that has none. Use when the user asks for tests or for better test coverage.
license: Apache-2.0
---

# Write tests

1. Run `python3 scripts/find_untested.py` from this skill's directory,
   with the project's source directory as its argument. It prints the
   functions that no test file names.
2. Pick the first three and write one test for each, next to the tests
   that already exist.
3. Run the tests and fix the tests, not the code, until they pass.
