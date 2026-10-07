# invoice-mailer

Renders invoices to PDF and sends them over SMTP.

## Commands

- Test: `uv run pytest`. Run it before you say a task is done.
- Lint and format: `uv run ruff check . && uv run ruff format .`
- Run locally: `uv run invoice-mailer --dry-run` (never sends mail)

## Rules

- Never commit to `main`. Branch as `feat/...` or `fix/...`.
- Do not edit `uv.lock` by hand. Use `uv add` and `uv remove`.
- Do not add retries around SMTP calls. The queue already retries.

## When the task needs it

@docs/templates.md
@docs/release.md
