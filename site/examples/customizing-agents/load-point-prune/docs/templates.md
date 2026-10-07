# Changing a template

- Every change to a file in `templates/` needs a matching golden-file test
  in `tests/rendering/`.
- Regenerate the golden files with `uv run pytest --update-golden`, and read
  the diff of every PDF snapshot before you commit.
- Never put customer data in a template. Use the fields of `models.Invoice`.
