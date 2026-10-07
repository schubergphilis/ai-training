## What

Keep the exchange rates of each night in `rates/<date>.json`, and have
`importer.py` read the file for the night it imports. `rates.json` stays
as the rates for today.

## Why

The rates change every day. A night imported again next month must give
the same total as on the night itself.

## Done when

- `python3 importer.py nights/2026-09-14/*.csv` reads `rates/2026-09-14.json`.
- A night without a rates file is rejected with an error that names the
  missing file, and no total is printed.
