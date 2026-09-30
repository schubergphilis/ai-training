---
title: Contributing
description: Building the site and contributing to it.
---

This site is built with [Astro Starlight](https://starlight.astro.build/) and
published to GitHub Pages. Contributions are welcome - see
[CONTRIBUTING.md](https://github.com/schubergphilis/ai-training/blob/main/CONTRIBUTING.md)
in the repository root.

## The site

Tools are pinned in `.mise.toml`. Run `mise install` once. Then:

- `mise run site-install` - install the site dependencies (bun).
- `mise run site-dev` - start the live-reloading dev server.
- `mise run site-build` - build the static site into `site/dist`.
- `mise run site-check` - run the Astro type/content check.
- `mise run lint` - run the prek hooks over every file, plus `actionlint`.
- `mise run ci` - the full gate: install, lint, check, build. CI runs the same.

Content is in `site/src/content/docs/`, and static assets are in `site/public/`.

## Conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
Git hooks (formatting, linting, link checking, secret scanning, commit-message
linting) are managed with [prek](https://prek.j178.dev); install them once per
clone with `prek install -t pre-commit -t commit-msg -t pre-push`.
