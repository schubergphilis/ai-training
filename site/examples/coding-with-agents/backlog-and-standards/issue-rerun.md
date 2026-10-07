## What

Add `--rerun <date>` to `importer.py`. It imports every export under
`nights/<date>/` again, with the rates of that night, and prints the total.

## Why

When a store sends a corrected export, the team needs the night's new
total, computed with the rates the night had.

## Done when

- `python3 importer.py --rerun 2026-09-14` prints the total for that night.
- The rerun reads `rates/2026-09-14.json`, never `rates.json`.
