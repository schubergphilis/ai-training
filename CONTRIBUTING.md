# Contributing

Thank you for investing your time in contributing to our project.

Any contributions you make are governed by our licenses: content under
[CC BY-SA 4.0](LICENSE) and code under [Apache-2.0](LICENSE-CODE).

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

Don't report a security problem in a public issue. Use the "Report a
vulnerability" button under the repository's Security tab instead.

You could read the [open source contribution guide](https://opensource.guide/how-to-contribute/) for general advice on how to contribute.

AI agents: see [AGENTS.md](AGENTS.md).

## The site

This site is built with [Astro Starlight](https://starlight.astro.build/).

Tools are pinned in `.mise.toml`, so run `mise install` once. Then:

- `mise run setup` - Install the site and Python dependencies from their
  lockfiles and fetch the Vale packages when one is missing. Run it once
  per clone or worktree.
- `mise run site-install` - Install the site dependencies (bun). Updates
  `site/bun.lock` if `site/package.json` changed. Commit the result.
  `mise run ci` and CI use `site-install-frozen`, which fails instead of
  resolving the difference.
- `mise run site-dev` - Start the live-reloading docs server.
- `mise run site-build` - Build the documentation site into `site/dist`.
- `mise run site-check` - Run the Astro type/content check.
- `mise run lint` - Run the prek hooks over every file, plus `actionlint`.
- `mise run ci` - The full gate: install, lint, check, build. Must pass
  before you push.
- `mise run links` - `lychee` check of *external* URLs. Not part of `ci`,
  because it is a network check that flakes on rate limits. Internal links
  are validated by `starlight-links-validator` during `mise run site-build`.
- `mise run branch-cleanup` - For maintainers only, and never run by an
  agent. Lists the remote branches that are merged into `main` and older
  than 14 days (`-- --days 3` for a shorter window). With `-- --apply` it
  deletes them on GitHub and locally, and it stops at the first error.

Open a pull request against `main`. CI runs the same `mise run ci` gate plus a
[zizmor](https://docs.zizmor.sh/) audit of the GitHub Actions workflows; both
must be green.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`.

Git hooks (formatting, linting, link checking, secret scanning, commit-message linting) are managed with [prek](https://prek.j178.dev). The markdownlint and commitlint hooks run from the site's bun install, so install that first, then the hooks, once per clone:

```bash
mise run setup
prek install -t pre-commit -t commit-msg -t pre-push
```

`mise run lint` runs the same hooks over every file, so CI catches what an
uninstalled hook would have missed. The `pre-push` hook also runs the
`spell` and `prose` checks on the files a push changes.

Since this is a small hobby project, we may not notice your contribution for a while if we're busy elsewhere. Sorry.
