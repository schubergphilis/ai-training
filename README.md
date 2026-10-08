# SBP Open Content AI training

An open training suite for getting started with AI: concepts, safety, using
AI agents, AI-assisted software engineering, and customizing and building AI
agents.

Site: <https://schubergphilis.github.io/ai-training/>

The basic material (AI concepts, AI safety, using AI agents) is written for
anyone doing knowledge work. The rest is written for software engineers. The
site is static HTML with interactive lessons that keep your progress in your
browser, and you can also study a lesson from a Claude Code or opencode
session with Claude acting as a tutor. Install the ai-tutor skill with
`npx skills add schubergphilis/ai-training --skill ai-tutor -g` and start it with
`/ai-tutor <lesson URL>`. The skill (`.claude/skills/ai-tutor/SKILL.md`,
spec S08) fetches its rules and the lesson from the published site.

**Content co-authored by AI.** The lessons, checkpoints, and examples on this
site are written by people working with AI agents, and reviewed by people.

The design is in [`docs/spec/`](./docs/spec/) and the open work is in the
[issue tracker](https://github.com/schubergphilis/ai-training/issues).

## Development

```bash
mise trust               # once per clone
mise install             # one-time: pin + install the toolchain
mise run site-install    # install the site dependencies (bun)
mise run site-dev        # dev server at http://localhost:4321/ai-training/
mise run site-build      # build the static site into site/dist
mise run site-check      # Astro type/content check
mise run lint            # prek hooks over every file + actionlint
mise run ci              # full gate: install + lint + check + build
mise run links           # lychee broken-link check (network; not in `ci`)
mise run audit           # zizmor audit of workflows + dependabot config
mise run vuln            # osv-scanner scan of uv.lock + site/bun.lock (network; not in `ci`)
mise run ci-watch        # watch GitHub Actions for the current branch
```

`mise tasks` lists them all. Content is in `site/src/content/docs/`, and
static assets are in `site/public/`.

## Project structure

```
ai-training/
├── .github/workflows/ci.yml      # lint + Astro check + build, and the zizmor audit
├── .github/workflows/deploy.yml  # build and publish to GitHub Pages
├── .github/workflows/vuln.yml    # weekly osv-scanner scan of the lockfiles on main
├── .github/dependabot.yml        # weekly bun + github-actions updates
├── .claude/settings.json         # shared agent permissions (tracked on purpose)
├── .mise.toml                    # toolchain pins + every repo task
├── prek.toml                     # git hooks, also run by `mise run lint`
├── site/                         # the Astro Starlight site
│   ├── src/content/docs/         # the pages
│   ├── src/styles/custom.css     # the site theme (spec S14)
│   ├── astro.config.mjs          # site, base path, sidebar, rehype plugin
│   ├── package.json              # site dependencies (exact; bun.lock pins the tree)
│   └── bun.lock                  # committed; never gitignore this
├── docs/spec/                    # numbered specs (S01 is the dictionary)
├── docs/agents/                  # agent-facing process docs (issue tracker)
├── AGENTS.md                     # AI agent instructions
├── CLAUDE.md -> AGENTS.md        # Claude Code compatibility
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE                       # CC BY-SA 4.0 (content)
├── LICENSE-CODE                  # Apache-2.0 (code)
├── THIRD_PARTY.md                # third-party material and its terms
└── README.md
```

## Publishing

GitHub Pages serves the site with the source set to **GitHub Actions**. A
push to `main` builds and deploys it to
`https://schubergphilis.github.io/ai-training/`, and the `github-pages` environment
only accepts deployments from `main`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). AI agents see
[AGENTS.md](./AGENTS.md). Security reports: [SECURITY.md](./SECURITY.md).

## License

Content is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see
[LICENSE](./LICENSE), which also says what counts as content. Code is
licensed under the [Apache License 2.0](./LICENSE-CODE). Third-party
material and its terms are listed in [THIRD_PARTY.md](./THIRD_PARTY.md).
