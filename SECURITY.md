# Security policy

## Reporting a vulnerability

**Please don't report security vulnerabilities through public GitHub issues.**

Use GitHub's private vulnerability reporting: go to the **Security** tab of
this repository and click **Report a vulnerability**. If that's not available,
contact @lsimons directly through GitHub.

Please include:

- A description of the vulnerability
- Steps to reproduce
- The potential impact

We acknowledge reports within a few days and keep you informed of
progress. This is a small personal project, so response times may vary.

## In the browser

Every page carries a Content Security Policy in a `<meta>` tag, set in
`site/scripts/lib/csp.mjs`. The browser loads scripts, styles, fonts and
images only from the site itself, plus images from `data:` URLs, and the
page can connect and submit forms only to the site. A script runs only from
a file of the site or as an inline script whose hash the policy lists.

## Scope

This is a static documentation site. The main risks are in the build tooling
and the GitHub Actions workflows, which are pinned and audited with zizmor.
Interactive lesson content runs entirely in the browser and stores progress in
local storage only, and it sends nothing to a server.

The repository also holds an agent harness: the agent settings, hooks and
skills in `.claude/`, the hook checks in `scripts/agent_hooks.py`, and the
wave skill in `.claude/skills/wave/`. Public issue text is an input to the
harness, because anyone can open or comment on an issue that an agent then
reads. Agents read an issue through `mise run issue-brief`
(`scripts/issue_brief.py`), which prints only the comments by the maintainer's
accounts and withholds the body of an issue that another account opened.

Agents that work on this repository run `gh` with the maintainer's GitHub
token. Issue #350 plans a narrower token for agents.

The tutor skill in `.claude/skills/ai-tutor/` runs in a learner's own agent.
It fetches the tutor instructions (`data/tutor.md`) and a lesson bundle from
the site. The agent follows the fetched instructions, so site content becomes
instructions in the learner's agent. The skill tells the agent to fetch only
from the two bases it lists, the published site at
`https://schubergphilis.github.io/ai-training/` and a local build at
`http://localhost:<port>/ai-training/`. No code enforces that limit.
