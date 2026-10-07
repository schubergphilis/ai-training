---
name: spreadsheet
description: Read, edit and recalculate spreadsheet files. Use when the user names a spreadsheet file or asks for a table of numbers as a spreadsheet.
license: Proprietary. LICENSE.txt has complete terms
---

# Work with a spreadsheet

1. Run `python3 scripts/unpack.py <file>` to read the sheets as text.
2. Make the change the user asked for in the unpacked copy.
3. Run `python3 scripts/recalc.py <file>` to write the file back with
   every formula recalculated.
