# invoice-mailer

Welcome! invoice-mailer renders customer invoices to PDF and sends them over
SMTP. It is written in Python 3.13 and uses uv.

## Commands

- Test: `uv run pytest`
- Lint and format: `uv run ruff check . && uv run ruff format .`
- Run locally: `uv run invoice-mailer --dry-run` (never sends mail)

## Code style

- Write clean, readable, well-documented code.
- Use double quotes for strings.
- Keep lines under 100 characters.
- Use type hints on every public function.

## Layout

The package is in `src/invoice_mailer/`. It has four modules: `rendering/`
turns an invoice into a PDF, `mail/` sends it, `models/` holds the data
classes, and `cli/` is the command line. Tests are in `tests/` and mirror
the package layout.

## Dependencies

We use jinja2 for templates, a PDF library for rendering, pydantic for the
models and click for the command line. See `pyproject.toml` for versions.

## Rules

- Never commit to `main`. Branch as `feat/...` or `fix/...`.
- Do not edit `uv.lock` by hand. Use `uv add` and `uv remove`.
- Do not add retries around SMTP calls. The queue already retries.
- Run the tests with `python -m pytest` before you finish.
- Keep the PDF library below version 52, which crashes on right-to-left text.

## Templates

- Every change to a file in `templates/` needs a matching golden-file test
  in `tests/rendering/`.
- Regenerate the golden files with `uv run pytest --update-golden`, and read
  the diff of every PDF snapshot before you commit.
- Never put customer data in a template. Use the fields of `models.Invoice`.

## Releasing

1. Create the branch `release/vX.Y.Z` from an up-to-date `main`.
2. Run the full test suite.
3. Bump the version in `pyproject.toml`.
4. Add a section for the new version to `CHANGELOG.md`.
5. Commit with the message `release: vX.Y.Z` and open a pull request.
6. After the merge, tag the merge commit `vX.Y.Z` and push the tag.
7. Wait for the release job to publish the package.
8. Send a test invoice from staging to the team inbox.
9. Post the changelog section in the team channel.
