# Supply chain

How this repository pins what it installs and how it keeps the pins free
of known advisories. `AGENTS.md` "Supply chain" states each rule in one
line and points here. `docs/agents/mise-refresh.md` is the procedure for
moving the mise pin in CI.

## Network checks

`mise run links` (lychee, external URLs) and `mise run site-audit`
(`bun audit`) are network calls that flake, so they're not part of `ci`.
Run them now and then. `mise run vuln` (osv-scanner over `uv.lock` and
`site/bun.lock`) is a network call too and stays out of `ci`, but the CI
workflow runs it in its own `vuln` job, so a known advisory against a
pinned version fails the pull request. `.github/workflows/vuln.yml` runs
the same scan on `main` every Monday, so an advisory published while
nobody pushes fails a scheduled run. No advisory is ever ignored.

## Rules and procedures

- `site/bun.lock` is committed and must stay in the tree. `mise run ci` and CI
  install with `site-install-frozen`. Use `mise run site-install` when
  deliberately changing dependencies, and commit the result.
- In `site/package.json` every dependency is an exact version, tools and
  libraries alike, and `bun.lock` pins the whole tree. An upgrade is a
  deliberate choice: a dependabot pull request or `mise run site-install`
  after editing the version, and never a range. The prek hooks and
  `mise run spell` run `markdownlint-cli2`, `@commitlint/*` and `cspell`
  from `site/node_modules/.bin`, so `site-install-frozen` (part of
  `mise run setup`) comes before `lint` and `spell`. `@playwright/test` is the one
  Playwright package (the screenshot script imports `chromium` from it
  too).
- `uv.lock` is committed and must stay in the tree. `mise run ci` and CI
  install with `py-install-frozen`. The dev group in `pyproject.toml` is
  exact-pinned. Use `mise run py-install` when deliberately changing it,
  commit the result, and move the `ruff-pre-commit` rev in `prek.toml` to
  the same ruff version.
- `mise run site-audit` (`bun audit`) must be clean. Fix an advisory in a
  *transitive* package with the `overrides` block in `site/package.json`.
- `mise run vuln` (osv-scanner) must be clean. The task scans `uv.lock`
  and `site/bun.lock` by name and fails when either is missing or does
  not parse. A new lockfile goes in the list of the task in `.mise.toml`.
  CI runs the task as the `vuln` job on every push and pull request.
  `.github/workflows/vuln.yml` also runs it on `main` every Monday (cron
  `17 6 * * 1`, and on `workflow_dispatch`). The weekly run is needed
  because GitHub's dependency graph reads `package.json` and not
  `site/bun.lock`, so dependabot alerts see only a small part of the npm
  tree. GitHub emails the last person who changed the cron line when a
  scheduled run fails, and there is no other notifier. In a public
  repository GitHub also disables a scheduled workflow after 60 days
  without repository activity. A Monday with no run under Actions is the
  cue to re-enable it there, and a quiet quarter isn't a sign that the
  scan is passing. Every advisory the scanner
  reports counts. The repository has no `osv-scanner.toml`, and an
  `IgnoredVulns` or `ignoreUntil` entry never goes in. An advisory
  without a fix keeps the scan red until a fix ships or the dependency
  is replaced. Fix a Python advisory by editing the `==` pin in
  the `dev` group of `pyproject.toml` and running `mise run py-install`
  (and moving the `ruff-pre-commit` rev in `prek.toml` when it is ruff, see
  the `uv.lock` bullet above). For a transitive package, add a
  `[tool.uv] constraint-dependencies` entry in `pyproject.toml` and run
  `mise run py-install` again.
- Pin GitHub Actions to full-length commit SHAs. `zizmor` enforces it.
- Every `.mise.toml` tool is exact-pinned and invisible to dependabot.
  Refresh with `mise up` and read the diff.
- Every platform entry in `mise.lock` has a `checksum`, and
  `tests/test_mise_lock.py` fails on one without it. zizmor publishes no
  musl Linux binary, so `mise lock` writes its `linux-arm64-musl`,
  `linux-x64-musl` and `linux-x64-musl-baseline` entries with only
  `provenance`. Delete those entries after a `mise lock` run.
- CI pins the mise version and its checksum on every `mise-action` step.
  `docs/agents/mise-refresh.md` is the procedure for moving that pin, and
  `mise run mise-refresh <version>` does its download, verify and hash steps.
- `prek.toml` hook repos are pinned by commit SHA (tag in the comment),
  and each Python hook lists its full transitive tree in
  `additional_dependencies`, exact-pinned. Both are invisible to
  dependabot. To bump one, move the SHA with `git ls-remote --tags` and
  rerun the `uv pip compile` command in the comment next to the list.
  Never add a hook that resolves packages at install time.
