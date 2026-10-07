# Topic map and competencies (S02)

**Purpose:** Name what the site teaches (topics and their concepts, per area,
with prerequisite links) and what a learner should be able to do afterwards
(competencies, their learning objectives and behaviors). Say how the map
differentiates between learners.

**Status:** In progress - topic and competency YAML, the map page, topic and
competency pages, the glossary, the course lesson graph with milestone bar,
ring and review card, the checkpoint fail and extension cards, and the
learner's reference on topic pages and at `/reference/` are implemented
(2026-09-20). Every objective has behaviors and the YAML holds
the alignment rows for Brilliant, Ng and AI Fluency 4D (2026-09-20).
Claude Academy is a source, with one `Academy <slug>` key per cited course
in the bibliography and the topic YAML (2026-09-20).
Every `DLAI-N` key carries its verified public course page URL in the
bibliography and the table below (2026-09-20).
Deferred: the map's side drawer, path lanes, and quizzes.
Since 2026-09-20 each checkpoint names the concepts it exercises by id
(S03 "Checkpoints"), and the build rejects an unknown id. A concept id is
a public identifier like a topic id, and renaming one means updating the
checkpoints that name it. Issue #106 added the `picks-a-model-by-fit`
objective under `using-agents/chooses-tool-and-autonomy` (2026-09-23).
The competency map at `/competencies/`, its sidebar group, and the course
line on competency pages are implemented (issue #514, 2026-09-26).
Two topics, `concepts/tokens-and-cost` and
`customizing-agents/inspecting-the-agent`, two competencies,
`concepts/reasons-about-cost` and `customizing-agents/adopts-a-skill-set`,
and concepts and objectives across four areas were added without lessons
(2026-10-02).

## Introduction

Vocabulary is per the [project dictionary](S01-dictionary.md). In short:
**topics** and **concepts** are what's taught and form the map; **competencies**,
**learning objectives** and **behaviors** are what a learner can do afterwards
and point into the map. **Lessons** cover topics and serve objectives.

## Shape

### Areas

| Group       | Area               | Slug                 | Audience           |
| ----------- | ------------------ | -------------------- | ------------------ |
| Foundations | Concepts           | `concepts`           | Everyone           |
| Foundations | Safety             | `safety`             | Everyone           |
| Foundations | Using agents       | `using-agents`       | Everyone           |
| Engineering | Coding with agents | `coding-with-agents` | Software engineers |
| Engineering | Customizing agents | `customizing-agents` | Software engineers |
| Engineering | Building agents    | `building-agents`    | Software engineers |

The groups, their audience and the area order are data in
`site/src/data/groups.yaml`, and each area's name and description are in
`site/src/data/areas/<area>/area.yaml` (S09). This table is the summary.

An area has three to seven topics and two to four competencies. A lesson
covers one topic and teaches one to five of its concepts.

### Taught and learned

| Tier                   | Register     | Owns                             | Carries                                                                             |
| ---------------------- | ------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| **Topic**              | noun         | two to eight concepts            | The graph edges: `prerequisite` (the arrow in the map), `related`, `specialization` |
| **Concept**            | noun         | one paragraph definition         | Inherits its topic's edges; has a glossary anchor                                   |
| **Competency**         | verb phrase  | three to six learning objectives | The topics it draws on, possibly across areas; its alignment rows                   |
| **Learning objective** | verb phrase  | two to six behaviors; one level  | What lessons serve and assume, what checkpoints prove                               |
| **Behavior**           | claim triple | -                                | What one checkpoint question or tutor question tests                                |

### Lesson frontmatter

A lesson names, by id, the topic it **covers**, the objectives it
**serves**, the objectives it **assumes** (each pointing at the lesson
section that teaches it) and the lessons, topics, or shorts it **extends
to**. These are written in the lesson's data file and copied onto the page
at build (S11). Paths are lists of lesson ids, and goals are competency levels. Lesson
lists per topic and per objective are derived from frontmatter at build
time, never stored twice.

### Storage

One YAML file per topic, per competency, per course and per lesson, all
under the area's directory (S09 "The data tree"). The map page, one
reference page per topic, one per competency, and the glossary all render
from these files, and `mise run data` checks them against each other and
the lesson pages.

| File                                                        | Contents                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site/src/data/areas/<area>/topics/<topic>.yaml`            | `id`, `area`, `name`, `definition`, `concepts[] {id, name, definition}`, `links {prerequisites[], related[], specializations[]}`, `sources[]`                             |
| `site/src/data/areas/<area>/competencies/<competency>.yaml` | `id`, `area`, `statement`, `topics[]`, `objectives[] {id, statement, level, behaviors[] {claim, why, example}}`. Format in S10                                            |
| `site/src/data/alignment/<framework>.yaml`                  | `framework`, `rows[] {code, asks, objectives[]}`, each row written once. Format in S10                                                                                    |
| `site/src/data/areas/<area>/courses/<course>.yaml`          | The course's lesson order, flat or in parts. Format in S11                                                                                                                |
| `site/src/data/areas/<area>/lessons/<lesson>.yaml`          | Everything the plan says about one lesson, written or not, and the frontmatter of its page once live. The course page renders every lesson, live or coming. Format in S11 |

### Stable URLs

| Page           | URL                                  | Notes                                                                           |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| Topic          | `/topics/<area>/<topic>/`            | The map opens it in a side drawer and updates the URL, so the view is shareable |
| Competency     | `/competencies/<area>/<competency>/` | Lists objectives, behaviors, alignment, and the lessons that serve it           |
| Competency map | `/competencies/`                     | The competency map: every competency and its objectives, one column per course  |
| Glossary       | `/glossary/#<concept>`               | Generated from every topic's concept definitions                                |
| Reference      | `/reference/`                        | The learner's reference: finished lessons by area, linking to their topic pages |

Tutor mode cites these URLs when it points a learner somewhere.

### Rendering rules

- Concept definitions are one plain paragraph of at most about 80 words,
  no lists or links inside, so it reads both in the glossary and as hover text
  on the map. Depth belongs in the topic page prose and in cited sources.
- No short codes. A reference from one behavior to another uses the
  objective slug.
- The topic map colors each topic by the state of the lessons that cover
  it, using the same three states as the lesson graph below.
- The competency map colors each competency and each objective by the state
  of the lessons that serve it, with the same states and colors as the topic
  map.
- Both maps show three states: not started, in progress and finished. A
  topic, competency or objective without a live lesson is not started. The
  maps show no separate state for a planned lesson or a gap in the plan, and
  their legend doesn't explain the line styles of the prerequisite edges.
- The competency map puts three areas in a row on a wide screen, so the
  six areas take two rows.

## Learner's reference

The learner's reference (S01 "Recap and the learner's reference") is a view
over the topic pages. The topic pages hold the content, and the reference
filters it by the learner's progress.

- **Where it lives.** Each topic page has a "Your reference" section that
  holds, per lesson covering the topic, the lesson's recap takeaways and its
  canonical example. The page `/reference/` lists the learner's finished
  lessons grouped by area, each linking to the topic page it covers, and
  says what to do when nothing is finished yet. It sits in the sidebar next
  to "Your progress".
- **What is shown.** The takeaways are the numbered list inside the lesson's
  `Recap`. The canonical example is one block per lesson, defined in S03
  "Examples": the `Predict` or `Prompt` block marked `canonical`, or the
  first of either in source order when none is marked. A lesson with
  neither shows its takeaways and says it has no example.
- **Rendering.** Both parts are read from the lesson source and rendered at
  build time into the topic page, hidden. A client script reads the progress
  record (S04) and reveals the parts for finished lessons. The rest keep a
  note that names the lesson to finish. No fetch at view time and nothing
  leaves the browser.
- **Unlock rule.** A lesson's part appears when the record holds that lesson
  as `finished`. A topic is in the reference when at least one lesson
  covering it is finished. `read` and `skipped` do not unlock anything, so
  a learner who marks "I know this" sees the unlock note until they finish
  the lesson.

## Course page as lesson graph

Each course renders as a graph of its lessons.

| Element         | Rendering                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lessons         | Boxes placed in **levels**: rows of lessons that share a depth in the prerequisite order                                                                                                                |
| Edges           | Dotted lines from the lessons that teach an assumed objective to the lessons that assume it; derived from `assumes` at build time                                                                       |
| Milestone bar   | The course percent per [S04 "Progress display"](S04-progress-record.md#progress-display) (finished / (all − skipped) lessons) with four labeled stops: getting started, halfway, almost there, complete |
| Completion ring | The same percent as the milestone bar, in compact form, with the skipped count next to it                                                                                                               |
| Review due card | "Review due: N items" when review items are due. Links to the course's review page                                                                                                                      |
| About panel     | Goals, counts, prerequisites                                                                                                                                                                            |

Node styling shows the learner's state from the progress record:

| State       | Meaning                                               | Styling                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------- |
| finished    | Recap reached with every checkpoint passed or skipped | Filled                                   |
| in progress | Read, not finished                                    | Outlined with a partial ring             |
| skipped     | Learner marked "I know this"                          | Struck through and gray                  |
| untouched   | -                                                     | Plain                                    |
| dimmed      | Assumed objectives not yet passed                     | Dimmed, never locked; paths are advisory |

## Source material

The topic tables below name the material each topic can start from. Keys:

| Key                                       | Source                                                                                                                                                                                     | License                                    | Use here                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `AEC-NN`                                  | Lesson NN of *agent-engineer-course*, a fork of Addy Osmani's course maintained by the author, published at `https://lsimons.github.io/agent-engineer-course/`                             | Apache-2.0                                 | May be adapted, with attribution in `NOTICE.md`                                                                           |
| `DLAI-N`                                  | DeepLearning.AI course N in the reading order below, where `M1`..`M5` are modules of a course                                                                                              | Proprietary                                | Topic coverage and sequencing as inspiration only; nothing copied or embedded                                             |
| `Academy <slug>`                          | The Claude Academy course at `https://academy.claude.com/courses/<slug>`, Anthropic's free public learning site. The course table below lists the ones cited                               | Proprietary or CC BY-NC-SA                 | Links and paraphrased ideas; no text                                                                                      |
| `Brilliant XXX`                           | A big idea (three-letter code) in Brilliant's *Coding with AI* skills map; see "Alignment"                                                                                                 | Proprietary                                | Ideas and codes as facts; no text                                                                                         |
| `Ng`                                      | Andrew Ng's AI engineering skills map: build and deploy AI applications, software engineering fundamentals, use coding agents, shape the build                                             | Public newsletter                          | Ordering and area split                                                                                                   |
| `AI Fluency 4D`                           | Dakan and Feller's *Framework for AI Fluency*; see "Alignment". Anthropic's course on it is `Academy ai-fluency-framework-foundations`                                                     | CC BY-NC-ND 4.0 (framework)                | Competency names as facts; asks paraphrased; no text                                                                      |
| `CS50x`                                   | CS50's Introduction to Computer Science, and the CS50 AI tutor that runs across it, which gave this site the endorsed-answers idea                                                         | CC BY-NC-SA 4.0                            | Ideas and vocabulary, cited; no text adapted                                                                              |
| `CS50ai`                                  | CS50's Introduction to Artificial Intelligence with Python                                                                                                                                 | CC BY-NC-SA 4.0                            | Ideas and vocabulary, cited; no text adapted                                                                              |
| `Brown 2020`                              | Brown et al., "Language Models are Few-Shot Learners" (2020), the paper that made few-shot prompting a common term                                                                         | arXiv preprint                             | Cited for the term and the finding; no text copied                                                                        |
| `Sharma 2023`                             | Sharma et al., "Towards Understanding Sycophancy in Language Models" (ICLR 2024) that measured sycophancy in deployed assistants and tied it to preference training                        | CC BY 4.0                                  | Cited for the finding and its cause; no text copied                                                                       |
| `Learn Prompting`                         | The community-written guide to prompt engineering                                                                                                                                          | CC BY-NC-SA 4.0 (current)                  | Vocabulary only; prompting concepts are written from the original papers                                                  |
| `Claude docs <slug>`                      | A page of the Claude Platform documentation, Anthropic's public API reference, at `https://platform.claude.com/docs/en/<path>`. The slug is the last path segment                          | Proprietary                                | Product behavior and documented advice, paraphrased, re-checked by `review-by`; no text adapted                           |
| `Claude support <slug>`                   | A page of the Claude Help Center, Anthropic's public support site, at `https://support.claude.com/en/articles/<id>-<slug>`. The slug names the page                                        | Proprietary                                | Product features and settings as facts, re-checked by `review-by`; no text adapted                                        |
| `Claude privacy <name>`                   | A page of the Anthropic Privacy Center at `https://privacy.claude.com/en/articles/<id>-<slug>`. The name says which page, such as `consumer-training`                                      | Proprietary                                | Data use, training and retention terms as facts, re-checked by `review-by`; no text adapted                               |
| `Fuchsia review`                          | Fuchsia, "Review process for external Rust crates"                                                                                                                                         | CC BY 4.0                                  | May be adapted, with attribution in `NOTICE.md`                                                                           |
| `OpenSSF Scorecard`                       | OpenSSF Scorecard documentation (`docs/checks.md`, README)                                                                                                                                 | Apache-2.0                                 | Check names and behavior as facts; no text adapted                                                                        |
| `sbp-dependency-audit`                    | The `sbp-dependency-audit` skill in the public `schubergphilis/agents.md` repository, a dependency audit procedure for coding agents                                                       | Apache-2.0                                 | Linked and described in our own words; no text adapted                                                                    |
| `npm package-lock`                        | The npm CLI documentation page `package-lock.json` at `docs.npmjs.com`                                                                                                                     | CC BY 4.0                                  | What the lockfile records and its root entry as facts; no text adapted                                                    |
| `Cargo build scripts`                     | The Cargo Book chapter "Build Scripts" at `doc.rust-lang.org/cargo`                                                                                                                        | MIT OR Apache-2.0                          | When Cargo compiles and runs `build.rs`, as facts; no text adapted                                                        |
| `pnpm settings`                           | The pnpm documentation page "Dependency Resolution Settings" at `pnpm.io/settings/dependency-resolution`                                                                                   | MIT                                        | The `minimumReleaseAge` setting, its unit and scope as facts; no text adapted                                             |
| `AI Act`                                  | Regulation (EU) 2024/1689 (Artificial Intelligence Act), the EUR-Lex consolidated text of July 27, 2026; `AI Act OJ` is the Official Journal text with the recitals                        | EU reuse policy                            | Article numbers, dates, tiers and figures as facts; short quotes, cited                                                   |
| `EC AI Act`                               | The European Commission's AI Act pages; `EC AI Office` is its page on the European AI Office                                                                                               | EU reuse policy                            | Application dates, examples and the enforcement setup as facts; no text adapted                                           |
| `Claude Code permission modes`            | Anthropic's Claude Code documentation page "Choose a permission mode" at `code.claude.com/docs/en/permission-modes`                                                                        | Proprietary                                | Mode names, flags and behavior as facts, re-checked by the lesson's `review-by` date; no text adapted                     |
| `Claude Code memory`                      | Anthropic's Claude Code documentation page "How Claude remembers your project" at `code.claude.com/docs/en/memory`                                                                         | Proprietary                                | Product behavior and documented advice, paraphrased, re-checked by `review-by`; no text adapted                           |
| `ICMJE authorship`                        | ICMJE Recommendations, "Defining the role of authors and contributors", its section on AI-assisted technology                                                                              | Proprietary                                | Disclosure and authorship rules as facts, re-checked by the lesson's `review-by` date; no text copied                     |
| `curl contribute`                         | The curl project's "Contributing to the curl project" page, its section on AI use                                                                                                          | curl license                               | The project's AI rules as facts, re-checked by the lesson's `review-by` date; no text adapted                             |
| `Claude Code permissions`                 | Anthropic's Claude Code documentation page "Configure permissions" at `code.claude.com/docs/en/permissions`                                                                                | Proprietary                                | Rule syntax and precedence as facts, re-checked by the lesson's `review-by` date; no text adapted                         |
| `Claude Code settings`                    | Anthropic's Claude Code documentation page "Settings files and precedence" at `code.claude.com/docs/en/settings`                                                                           | Proprietary                                | File names, scopes and the `env` key as facts, re-checked by `review-by`; no text adapted                                 |
| `Claude Code authentication`              | Anthropic's Claude Code documentation page "Authentication" at `code.claude.com/docs/en/authentication`                                                                                    | Proprietary                                | Credential sources and `apiKeyHelper` behavior as facts, re-checked by `review-by`; no text adapted                       |
| `Claude Code best practices`              | Anthropic's Claude Code documentation page "Best practices for Claude Code" at `code.claude.com/docs/en/best-practices`                                                                    | Proprietary                                | Product behavior and documented advice, paraphrased, re-checked by `review-by`; no text adapted                           |
| `Claude Code subagents`                   | Anthropic's Claude Code documentation page "Create custom subagents" at `code.claude.com/docs/en/sub-agents`                                                                               | Proprietary                                | File location, frontmatter fields and isolation as facts, re-checked by `review-by`; no text adapted                      |
| `Claude Code context window`              | Anthropic's Claude Code documentation page "Explore the context window" at `code.claude.com/docs/en/context-window`                                                                        | Proprietary                                | The `/context` command as a fact, re-checked by `review-by`; no text adapted                                              |
| `Claude Code agent loop`                  | Anthropic's Claude Code documentation page "How the agent loop works" at `code.claude.com/docs/en/agent-sdk/agent-loop`                                                                    | Proprietary                                | Option names, defaults, subtypes and compaction as facts, re-checked by `review-by`; no text adapted                      |
| `Claude Code agent sdk python`            | Anthropic's Claude Code documentation page "Agent SDK reference - Python" at `code.claude.com/docs/en/agent-sdk/python`                                                                    | Proprietary                                | Package, class and field names as facts, re-checked by `review-by`; no text adapted                                       |
| `Claude Code custom tools`                | Anthropic's Claude Code documentation page "Give Claude custom tools" at `code.claude.com/docs/en/agent-sdk/custom-tools`                                                                  | Proprietary                                | Handler return keys and tool naming as facts, re-checked by `review-by`; no text adapted                                  |
| `Claude Code skills`                      | Anthropic's Claude Code documentation page "Extend Claude with skills" at `code.claude.com/docs/en/skills`                                                                                 | Proprietary                                | Skill loading and persistence across turns as facts, re-checked by `review-by`; no text adapted                           |
| `Agent Skills spec`                       | The Agent Skills specification at `agentskills.io/specification`, the open format for a skill directory and its `SKILL.md` file                                                            | CC BY 4.0 (docs)                           | Field names and limits as facts, re-checked by `review-by`; no text adapted                                               |
| `Claude Code mcp`                         | Anthropic's Claude Code documentation page "Connect Claude Code to tools via MCP" at `code.claude.com/docs/en/mcp`                                                                         | Proprietary                                | Tool search and deferred tool definitions as facts, re-checked by `review-by`; no text adapted                            |
| `Gitleaks`                                | The gitleaks secret scanner's README on GitHub                                                                                                                                             | MIT                                        | Named and linked as a real scanner; no text adapted                                                                       |
| `Wilson 2024`                             | Wilson and Caliskan, "Gender, Race, and Intersectional Bias in Resume Screening via Language Model Retrieval" (AIES 2024)                                                                  | CC BY-NC-SA 4.0                            | Findings cited as facts, in our own words; no text adapted                                                                |
| `Liu 2024`                                | Liu et al., "Lost in the Middle: How Language Models Use Long Contexts" (TACL 12, 2024), which measured how answer position in a long context changes accuracy                             | CC BY 4.0                                  | Findings cited as facts, in our own words; no text adapted                                                                |
| `Bertrand 2004`                           | Bertrand and Mullainathan, "Are Emily and Greg More Employable than Lakisha and Jamal?" (AER 2004), the audit-study method                                                                 | Copyright AEA                              | Method and findings cited as facts; no text adapted                                                                       |
| `Parasuraman 2010`                        | Parasuraman and Manzey, "Complacency and Bias in Human Use of Automation" (Human Factors 52, 2010), the review that ties both effects to attention                                         | Copyright HFES                             | Findings cited as facts, in our own words; no text adapted                                                                |
| `Goddard 2012`                            | Goddard, Roudsari and Wyatt, "Automation bias: a systematic review" (JAMIA 19, 2012), on clinicians following wrong decision-support advice                                                | Copyright BMJ                              | Findings and mitigators cited as facts, in our own words; no text adapted                                                 |
| `MCP specification`                       | The Model Context Protocol specification, revision 2026-07-28: `tools/list`, `tools/call`, the stdio and Streamable HTTP transports, the security rules                                    | Apache-2.0 and MIT                         | Message names, fields, transport and security rules cited as facts; no text adapted                                       |
| `MCP filesystem server`                   | The reference file-system server's README in the `modelcontextprotocol/servers` repository on GitHub                                                                                       | Apache-2.0, CC BY 4.0, MIT                 | Package name, tool names and directory scoping cited as facts; no text adapted                                            |
| `A2A specification`                       | The Agent2Agent (A2A) protocol specification, version 1.0.0, at `a2a-protocol.org`: the Agent Card, tasks, messages, artifacts                                                             | Apache-2.0                                 | Object names, discovery path and security rules cited as facts; no text adapted                                           |
| `A2A and MCP`                             | The A2A project's page "A2A and MCP: Detailed Comparison" at `a2a-protocol.org`, on tools as MCP's domain and agents as A2A's                                                              | Apache-2.0                                 | The split between tools and agents cited as fact; no text adapted                                                         |
| `Git docs <page>`                         | A page of the Git reference documentation at `https://git-scm.com/docs/<page>`, the manual pages of the git commands                                                                       | GPL-2.0                                    | Command behavior as facts; no text adapted                                                                                |
| `Bainbridge 1983`                         | Bainbridge, "Ironies of automation" (Automatica 19, 1983), on skill decay and monitoring in operators of automated systems                                                                 | Copyright IFAC                             | Argument cited as fact, in our own words; no text adapted                                                                 |
| `NTSB Asiana 214`                         | NTSB accident report AAR-14/01 on Asiana Airlines flight 214 (San Francisco, 2013), whose findings name the crew's reliance on the autothrottle                                            | Public domain (US)                         | Probable cause and findings cited as facts, in our own words; no text adapted                                             |
| `AI Index 2025`                           | Stanford HAI's "The 2025 AI Index Report" at `hai.stanford.edu/ai-index/2025-ai-index-report`, the real report the source-checking lesson cites                                            | CC BY-ND 4.0                               | Linked, and one adoption sentence quoted with attribution; no text adapted                                                |
| `Liu 2024b`                               | Liu et al., "Teaching CS50 with AI" (SIGCSE 2024), on staff endorsing the answers of the CS50 AI tutor and what the count of endorsements suggested                                        | Copyright authors, ACM                     | Findings cited as facts, in our own words; no text adapted                                                                |
| `Claude Code monitoring`                  | Anthropic's Claude Code documentation page "Monitoring" at `code.claude.com/docs/en/monitoring-usage`                                                                                      | Proprietary                                | What is exported and what is redacted by default as facts; no text adapted                                                |
| `Claude Code plugins`                     | Anthropic's Claude Code documentation page "Plugins overview" at `code.claude.com/docs/en/plugins`                                                                                         | Proprietary                                | What a plugin holds, marketplaces and scopes as facts, re-checked by `review-by`; no text adapted                         |
| `Claude Code plugin security`             | Anthropic's Claude Code documentation page "Plugin security and trust" at `code.claude.com/docs/en/plugins/security`                                                                       | Proprietary                                | What a plugin can run and the review steps as facts, re-checked by `review-by`; no text adapted                           |
| `Claude Code plugin parts`                | Anthropic's Claude Code documentation page "Add components to a plugin" at `code.claude.com/docs/en/plugins/components`                                                                    | Proprietary                                | When plugin hooks fire and component names as facts, re-checked by `review-by`; no text adapted                           |
| `Claude Code plugin install`              | Anthropic's Claude Code documentation page "Install and manage plugins" at `code.claude.com/docs/en/plugins/install`                                                                       | Proprietary                                | Auto-update defaults per marketplace as facts, re-checked by `review-by`; no text adapted                                 |
| `Claude Code plugin manifest`             | Anthropic's Claude Code documentation page "Plugin manifest reference" at `code.claude.com/docs/en/plugins/manifest-reference`                                                             | Proprietary                                | The `version` field and what it pins as facts, re-checked by `review-by`; no text adapted                                 |
| `Claude Code hooks`                       | Anthropic's Claude Code documentation page "Hooks reference" at `code.claude.com/docs/en/hooks`                                                                                            | Proprietary                                | Hook events, matchers and exit code 2 as facts, re-checked by `review-by`; no text adapted                                |
| `Claude Code worktrees`                   | Anthropic's Claude Code documentation page "Run parallel sessions with worktrees" at `code.claude.com/docs/en/worktrees`                                                                   | Proprietary                                | Worktree path, branch and base, `.worktreeinclude`, shared approvals, hook paths; no text adapted                         |
| `AI Training orchestration`               | This repository's page "Orchestrating agents", `docs/agents/orchestration.md` on GitHub, its own practice for parallel agent work                                                          | CC BY-SA 4.0                               | Our own practice, described in our words as the worked example                                                            |
| `AI Training AGENTS`                      | This repository's agent instructions, `AGENTS.md` on GitHub at a fixed commit, its practice for agents: gates, attribution                                                                 | CC BY-SA 4.0                               | Our own practice, quoted and described as the worked example                                                              |
| `AI Training writing-a-lesson`            | This repository's authoring guide, `docs/agents/writing-a-lesson.md` on GitHub at a fixed commit, whose rules name the incident behind them                                                | CC BY-SA 4.0                               | Our own practice: rules that name their incident, quoted closely as the worked example                                    |
| `Claude Code hooks guide`                 | Anthropic's Claude Code documentation page "Automate actions with hooks" at `code.claude.com/docs/en/hooks-guide`                                                                          | Proprietary                                | Hook order and troubleshooting as facts, re-checked by `review-by`; no text adapted                                       |
| `Yao 2022`                                | Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (ICLR 2023), the paper that named the pattern of a reasoning step before each action                              | CC BY 4.0                                  | Pattern and findings cited as facts, in our own words; no text adapted                                                    |
| `Turpin 2023`                             | Turpin et al., "Language Models Don't Always Say What They Think" (NeurIPS 2023), on written reasoning that leaves out what drove the answer                                               | CC BY 4.0                                  | Findings cited as facts, in our own words; no text adapted                                                                |
| `Madaan 2023`                             | Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback" (NeurIPS 2023), on one model that critiques and revises its own output                                               | CC BY 4.0                                  | Findings cited as facts, in our own words; no text adapted                                                                |
| `Huang 2023`                              | Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet" (ICLR 2024), on self-critique with no outside signal                                                               | CC BY 4.0                                  | Findings cited as facts, in our own words; no text adapted                                                                |
| `Claude Code costs`                       | Anthropic's Claude Code documentation page "Manage costs effectively" at `code.claude.com/docs/en/costs`                                                                                   | Proprietary                                | CLI and unused-server advice and prompt caching as facts, re-checked by `review-by`; no text adapted                      |
| `Claude Code commands`                    | Anthropic's Claude Code documentation page "Commands" at `code.claude.com/docs/en/commands`                                                                                                | Proprietary                                | `/context` and `/clear` as facts, re-checked by `review-by`; no text adapted                                              |
| `GitHub docs <page>`                      | A page of GitHub's documentation at `docs.github.com`, from the `github/docs` repository, whose URL ends in `<page>`                                                                       | CC BY 4.0                                  | Workflow and event behavior as facts; no text adapted                                                                     |
| `GitHub docs code-referencing`            | GitHub's documentation page "GitHub Copilot code referencing" at `docs.github.com/en/copilot/concepts/completions/code-referencing`                                                        | CC BY 4.0                                  | Copilot code-referencing behavior as facts, re-checked by `review-by`; no text adapted                                    |
| `Invariant tool poisoning`                | Beurer-Kellner and Fischer, "MCP Security Notification: Tool Poisoning Attacks" (Invariant Labs, April 2025), on tool descriptions that carry instructions                                 | Proprietary                                | The attack and its cross-server example in our own words, linked; no text adapted                                         |
| `Wang 2023`                               | Wang et al., "Plan-and-Solve Prompting" (ACL 2023, Volume 1: Long Papers, 2609-2634), on a prompt that has the model write a plan first                                                    | CC BY 4.0                                  | Findings cited as facts, in our own words; no text adapted                                                                |
| `Claude Code tools reference`             | Anthropic's Claude Code documentation page "Tools reference" at `code.claude.com/docs/en/tools-reference`                                                                                  | Proprietary                                | Tool names and defaults as facts, re-checked by `review-by`; no text adapted                                              |
| `Pearce 2022`                             | Pearce et al., "Asleep at the Keyboard? Assessing the Security of GitHub Copilot's Code Contributions" (IEEE S&P 2022), on vulnerable code from a model                                    | Copyright IEEE                             | Findings and their stated cause cited as facts, in our own words; no text adapted                                         |
| `Bandit`                                  | Bandit documentation, the PyCQA static analyzer for security problems in Python code, at `bandit.readthedocs.io`                                                                           | Apache-2.0                                 | Check codes and behavior as facts, re-checked by `review-by`; no text adapted                                             |
| `Bandit PyPI`                             | The PyPI page for Bandit 1.8.6, which states the Python versions that release needs                                                                                                        | Apache-2.0                                 | Version requirement as a fact, re-checked by `review-by`; no text adapted                                                 |
| `Python sqlite3`                          | The Python documentation page for the `sqlite3` module, on placeholders and SQL injection                                                                                                  | PSF License Version 2                      | Behavior as facts; no text adapted                                                                                        |
| `Claude Code security`                    | Anthropic's Claude Code documentation page "Security" at `code.claude.com/docs/en/security`                                                                                                | Proprietary                                | Safeguards and the working-folder boundary as facts, re-checked by `review-by`; no text adapted                           |
| `Claude Code sandboxing`                  | Anthropic's Claude Code documentation page "Configure the sandboxed Bash tool" at `code.claude.com/docs/en/sandboxing`                                                                     | Proprietary                                | Sandbox settings and defaults as facts, re-checked by `review-by`; no text adapted                                        |
| `Claude Code all settings`                | Anthropic's Claude Code documentation page "All settings" at `code.claude.com/docs/en/settings-reference`                                                                                  | Proprietary                                | Setting keys, scopes and defaults as facts, re-checked by `review-by`; no text adapted                                    |
| `Claude Code how it works`                | Anthropic's Claude Code documentation page "How Claude Code works" at `code.claude.com/docs/en/how-claude-code-works`                                                                      | Proprietary                                | Compaction, session independence and storage as facts, re-checked by `review-by`; no text adapted                         |
| `Claude Code features`                    | Anthropic's Claude Code documentation page "Extend Claude Code" at `code.claude.com/docs/en/features-overview`                                                                             | Proprietary                                | Setup triggers and what each extension is for as facts, re-checked by `review-by`; no text adapted                        |
| `MCP deprecated features`                 | The deprecated-features registry of the MCP specification at `modelcontextprotocol.io/specification/2026-07-28/deprecated`                                                                 | Apache-2.0 and MIT                         | Which features are deprecated, and when, as facts, re-checked by `review-by`; no text adapted                             |
| `AGENTS.md format`                        | The AGENTS.md format's own site at `agents.md`, on where the files go and which one wins in a monorepo                                                                                     | MIT                                        | Nested-file precedence as a fact, re-checked by `review-by`; no text adapted                                              |
| `RFC 2606`                                | Eastlake and Panitz, RFC 2606 "Reserved Top Level DNS Names", which reserves the `.invalid` name                                                                                           | Copyright Internet Society                 | The reserved names as facts; no text adapted                                                                              |
| `DCO`                                     | The Developer Certificate of Origin 1.1 at `developercertificate.org`, the statement a `Signed-off-by` line certifies in many projects                                                     | Verbatim copies only                       | What a contributor certifies as facts, in our own words; no text adapted                                                  |
| `Linux coding assistants`                 | The Linux kernel's "AI Coding Assistants" guideline at `docs.kernel.org/process/coding-assistants.html`, on sign-off and `Assisted-by`                                                     | GPL-2.0                                    | Sign-off and attribution rules as facts, re-checked by `review-by`; no text adapted                                       |
| `OpenTelemetry GenAI spans`               | The OpenTelemetry GenAI semantic conventions page "Semantic conventions for generative client AI spans" at `github.com/open-telemetry/semantic-conventions-genai`                          | Apache-2.0                                 | Span names, attributes and content capture as facts; no text adapted                                                      |
| `Anthropic effective agents`              | Anthropic's engineering article "Building effective agents" at `anthropic.com/engineering/building-effective-agents`, on workflows versus agents and the workflow patterns                 | Proprietary                                | The workflows-versus-agents advice and the workflow patterns, paraphrased in our own words; no text adapted               |
| `Hardy 1988`                              | Hardy, "The Confused Deputy (or why capabilities might have been invented)" (ACM SIGOPS OSR 1988), on a program that spends its own authority                                              | Copyright ACM                              | The example and the term cited as facts, in our own words; no text adapted                                                |
| `Claude Code setup`                       | Anthropic's Claude Code documentation page "Advanced setup" at `code.claude.com/docs/en/setup`                                                                                             | Proprietary                                | Install methods and required account plans as facts, re-checked by `review-by`; no text adapted                           |
| `Claude Code cli reference`               | Anthropic's Claude Code documentation page "CLI reference" at `code.claude.com/docs/en/cli-reference`                                                                                      | Proprietary                                | Flag names and what they restrict as facts, re-checked by `review-by`; no text adapted                                    |
| `Claude Code isolation`                   | Anthropic's Claude Code documentation page "Choose a sandbox environment" at `code.claude.com/docs/en/sandbox-environments`                                                                | Proprietary                                | Isolation options and their limits as facts, re-checked by `review-by`; no text adapted                                   |
| `claude-docker`                           | The README of the public `schubergphilis/claude-docker` repository, a hardened container for Claude Code with a threat model                                                               | Apache-2.0                                 | Linked and described in our own words; no text adapted                                                                    |
| `Codex approvals`                         | OpenAI's Codex documentation page "Agent approvals & security" at `learn.chatgpt.com/docs/agent-approvals-security`                                                                        | Proprietary                                | Sandbox modes, approval policy and network default, re-checked by `review-by`; no text adapted                            |
| `Pi security`                             | "Run Pi safely" in the Pi coding agent's documentation, in the `earendil-works/pi` repository on GitHub                                                                                    | MIT                                        | How the agent runs and where its authors put safety, in our own words; no text adapted                                    |
| `pnpm supply chain`                       | The pnpm documentation page "Mitigating supply chain attacks" at `pnpm.io/supply-chain-security`                                                                                           | MIT                                        | The `minimumReleaseAge` setting and its default as facts; no text adapted                                                 |
| `Claude docs effort`                      | Anthropic's Claude Platform documentation page "Effort" at `platform.claude.com/docs/en/build-with-claude/effort`                                                                          | Proprietary                                | Effort levels, their default and the cache effect of changing them as facts, re-checked by `review-by`; no text adapted   |
| `Huang 2025`                              | Huang et al., "A Survey on Hallucination in Large Language Models" (ACM Transactions on Information Systems 43(2), 2025), whose taxonomy splits factuality from faithfulness hallucination | arXiv non-exclusive license                | The taxonomy cited as fact, in our own words; no text adapted                                                             |
| `Anthropic context engineering`           | Anthropic's engineering article "Effective context engineering for AI agents", on loading context up front versus retrieving it just in time                                               | Proprietary                                | The ideas paraphrased in our own words; no text adapted                                                                   |
| `Claude Code statusline`                  | Anthropic's Claude Code documentation page "Customize your status line" at `code.claude.com/docs/en/statusline`                                                                            | Proprietary                                | The context fields a status line receives as facts, re-checked by `review-by`; no text adapted                            |
| `Claude Code llm gateway`                 | Anthropic's Claude Code documentation page "Other LLM gateways" at `code.claude.com/docs/en/llm-gateway`                                                                                   | Proprietary                                | What a gateway records and how the agent is pointed at one as facts, re-checked by `review-by`; no text adapted           |
| `Claude Code claude directory`            | Anthropic's Claude Code documentation page "Explore the .claude directory" at `code.claude.com/docs/en/claude-directory`                                                                   | Proprietary                                | Where session transcripts are kept, for how long, and what they hold as facts, re-checked by `review-by`; no text adapted |
| `Claude Code agent sdk permissions`       | Anthropic's Claude Code documentation page "Configure permissions" for the Agent SDK at `code.claude.com/docs/en/agent-sdk/permissions`                                                    | Proprietary                                | The order permission checks run in as facts, re-checked by `review-by`; no text adapted                                   |
| `Claude Code agent sdk user input`        | Anthropic's Claude Code documentation page "Handle approvals and user input" at `code.claude.com/docs/en/agent-sdk/user-input`                                                             | Proprietary                                | What an approval callback receives and returns as facts, re-checked by `review-by`; no text adapted                       |
| `anthropics skills`                       | The public `anthropics/skills` repository on GitHub, Anthropic's example skills                                                                                                            | Apache-2.0 and source-available, per skill | Named as one example of a published skill set; no text adapted                                                            |
| `Husain 2024`                             | Hamel Husain, "Your AI Product Needs Evals" (hamel.dev, 2024), on logging traces and turning failures into tests                                                                           | Proprietary                                | The cycle from traces to test cases in our own words; no text adapted                                                     |
| `Google eng-practices`                    | Google's engineering practices documentation, the code review guides at `google.github.io/eng-practices/review/`                                                                           | CC BY 3.0                                  | The style guide as the reviewer's authority, and non-blocking nits, in our own words; no text adapted                     |
| `GitHub docs creating-issue-dependencies` | GitHub's documentation page "Creating issue dependencies" at `docs.github.com`                                                                                                             | CC BY 4.0                                  | Blocked-by and blocking links as facts; no text adapted                                                                   |
| `Thomas 2019`                             | Thomas and Hunt, *The Pragmatic Programmer*, 20th anniversary edition (Addison-Wesley, 2019), the topics on tracer bullets and prototypes                                                  | Proprietary                                | Ideas cited, in our own words; no text copied                                                                             |
| `Artima tracer bullets`                   | Bill Venners, "Tracer Bullets and Prototypes", an interview with Hunt and Thomas (Artima, 2003)                                                                                            | Proprietary                                | The authors' distinction between tracer code and prototypes, in our own words; no text adapted                            |
| `Brooks 1995`                             | Brooks, *The Mythical Man-Month*, anniversary edition (Addison-Wesley, 1995), chapter 11 "Plan to Throw One Away" and its revision in chapter 19                                           | Proprietary                                | Ideas cited, in our own words; no text copied                                                                             |
| `Evans 2003`                              | Evans, *Domain-Driven Design* (Addison-Wesley, 2003), on a shared domain language                                                                                                          | Proprietary                                | Ideas cited, in our own words; no text copied                                                                             |
| `Evans DDD Reference`                     | Evans, *Domain-Driven Design Reference* (Domain Language, 2015), the public summary of the patterns                                                                                        | CC BY 4.0                                  | The shared domain language cited, in our own words; no text adapted                                                       |
| `Ousterhout 2021`                         | Ousterhout, *A Philosophy of Software Design*, 2nd edition (Yaknyam Press, 2021), on deep and shallow modules                                                                              | Proprietary                                | Ideas cited, in our own words; no text copied                                                                             |
| `AI Hero <slug>`                          | A free post on Matt Pocock's AI Hero site at `https://www.aihero.dev/<slug>`. The slug is the URL's path segment                                                                           | Proprietary                                | Link only, no text                                                                                                        |
| `AI Hero video <id>`                      | A free video on Matt Pocock's YouTube channel at `https://www.youtube.com/watch?v=<id>`. The id is the YouTube video id                                                                    | Proprietary                                | Link only, no text                                                                                                        |
| new                                       | No usable source; written from scratch                                                                                                                                                     | -                                          | -                                                                                                                         |

The `Academy <slug>` license is Proprietary, except the AI Fluency courses
and *AI capabilities and limitations*, whose lesson pages end with a
CC BY-NC-SA 4.0 notice. The NonCommercial (NC) term is incompatible with this
site's CC BY-SA 4.0, so no text is adapted from any Academy course regardless
of its license.

| Key      | agent-engineer-course lesson                                                                  |
| -------- | --------------------------------------------------------------------------------------------- |
| `AEC-01` | What are AI agents: model versus agent, autonomy levels, when a prompt suffices               |
| `AEC-02` | How agents think: tokens and context, reasoning strategies, model choice, system prompts      |
| `AEC-03` | Tools, giving agents hands: function calling, schema design, the N x M problem                |
| `AEC-04` | Agentic design patterns: ReAct, reflection, tool use, planning                                |
| `AEC-05` | Memory and context: context engineering, memory kinds, memory versus RAG, context rot         |
| `AEC-06` | Planning and reasoning: the loop, plan-then-execute, hierarchy                                |
| `AEC-07` | Multi-agent systems: architectures, roles, the orchestration tax                              |
| `AEC-08` | Agentic RAG: the retrieve, evaluate, refine loop; when basic RAG is enough                    |
| `AEC-09` | Evaluating and testing agents: quality pillars, metrics, trajectories, LLM as judge           |
| `AEC-10` | Guardrails and safety: why agent safety differs, defense layers, injection, human in the loop |
| `AEC-11` | From prototype to production: eval-gated deploys, rollout, cost                               |
| `AEC-12` | Getting started with Claude Code; written around an internal proxy, needs a public rewrite    |
| `AEC-13` | Building your first agent: the loop from scratch, then with an SDK                            |
| `AEC-14` | Agent protocols, MCP, and A2A                                                                 |
| `AEC-15` | AGENTS.md: contents, monorepo hierarchies, with a builder widget                              |
| `AEC-16` | MCP deep dive: MCP versus CLI, security failure modes, token cost                             |
| `AEC-17` | Agent skills: skills versus tools, the spec, progressive disclosure                           |
| `AEC-18` | Orchestrators: code- versus model-driven, patterns, anti-patterns                             |

DeepLearning.AI courses cited, in reading order. Each links to its public course page. The pages are linked and never copied or embedded.

| Key       | DeepLearning.AI course                                                                                  | Public course page                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `DLAI-1`  | ChatGPT Prompt Engineering for Developers                                                               | <https://www.deeplearning.ai/courses/chatgpt-prompt-eng>                                     |
| `DLAI-2`  | Generative AI for Everyone                                                                              | <https://www.deeplearning.ai/courses/generative-ai-for-everyone>                             |
| `DLAI-3`  | AI Prompting for Everyone                                                                               | <https://www.deeplearning.ai/courses/ai-prompting-for-everyone>                              |
| `DLAI-5`  | Claude Code: A Highly Agentic Coding Assistant                                                          | <https://www.deeplearning.ai/courses/claude-code-a-highly-agentic-coding-assistant>          |
| `DLAI-6`  | Introduction to Generative AI for Software Development                                                  | <https://www.deeplearning.ai/courses/introduction-to-generative-ai-for-software-development> |
| `DLAI-7`  | Team Software Engineering with AI                                                                       | <https://www.deeplearning.ai/courses/team-software-engineering-with-ai>                      |
| `DLAI-9`  | MCP: Build Rich-Context AI Apps with Anthropic                                                          | <https://www.deeplearning.ai/courses/mcp-build-rich-context-ai-apps-with-anthropic>          |
| `DLAI-10` | Agent Skills with Anthropic                                                                             | <https://www.deeplearning.ai/courses/agent-skills-with-anthropic>                            |
| `DLAI-11` | Agentic AI: M1 workflows and autonomy, M2 reflection, M4 evals and error analysis, M5 autonomous agents | <https://www.deeplearning.ai/courses/agentic-ai>                                             |

Claude Academy courses cited, by slug. Each is at `https://academy.claude.com/courses/<slug>`. Course and concept names are facts, and the material itself is paraphrased and never copied.

| Key                                                   | Claude Academy course                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Academy ai-capabilities-and-limitations`             | AI capabilities and limitations: next-token prediction, knowledge, working memory, steerability, and how these properties interact                                                         |
| `Academy ai-fluency-framework-foundations`            | AI Fluency: Framework and foundations: generative AI fundamentals, capabilities and limits, the four competencies (Delegation, Description, Discernment, Diligence), prompting techniques  |
| `Academy ai-fluency-for-builders`                     | AI Fluency for builders: the four competencies applied to product and engineering work, discernment for code and for user experience                                                       |
| `Academy claude-101`                                  | Claude 101: product vocabulary (projects, artifacts, skills, connectors, research)                                                                                                         |
| `Academy introduction-to-claude-cowork`               | Introduction to Claude Cowork: an agent on your own files, the task loop, standing context, skills and plugins, working safely                                                             |
| `Academy building-effective-human-agent-teams`        | Building effective human-agent teams: from single-player to multiplayer AI, what makes an agent a teammate, the organizational checklist                                                   |
| `Academy deploying-claude-enterprise-with-confidence` | Deploying Claude Enterprise with confidence: the governance decisions of a rollout (structure and identity, access, governance, spend, visibility)                                         |
| `Academy claude-code-101`                             | Claude Code 101: the agentic loop, permissions, plan mode, explore-plan-code-commit, context management, CLAUDE.md, subagents, skills, MCP, hooks                                          |
| `Academy claude-code-in-action`                       | Claude Code in action: steering long sessions, a lean CLAUDE.md, permission modes, hooks, routines and headless runs, verifying unsupervised runs, plugins                                 |
| `Academy ai-native-sdlc-playbook`                     | The AI-native SDLC playbook: `intent.md`, plan mode as the default, skills as institutional knowledge, parallel sessions, evals in CI, AI in PR review, hooks as approval gates            |
| `Academy introduction-to-agent-skills`                | Introduction to agent skills: `SKILL.md`, descriptions that trigger, progressive disclosure, skills versus other customizations, sharing and troubleshooting                               |
| `Academy introduction-to-subagents`                   | Introduction to subagents: isolated context, creating and designing subagents, when delegation pays                                                                                        |
| `Academy introduction-to-model-context-protocol`      | Introduction to Model Context Protocol: architecture, clients and servers, the tools, resources and prompts primitives                                                                     |
| `Academy model-context-protocol-advanced-topics`      | Model Context Protocol advanced topics: sampling, notifications, roots, message types, the `stdio` and streamable HTTP transports, stateless scaling                                       |
| `Academy claude-platform-101`                         | Claude Platform 101: first API call, model choice, the agent loop, tool use, thinking, built-in tools, skills, MCP, context management, managed agents                                     |
| `Academy building-with-the-claude-api`                | Building with the Claude API: requests and system prompts, temperature, prompt evaluation with model- and code-based grading, prompting techniques, tool use, RAG, workflows versus agents |

## Foundations

### Concepts (`concepts`)

Topics:

| Topic id                    | Name                     | Concepts                                                                                                                          | Prerequisites     | Source material                                                                                                                                                                        |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `concepts/how-models-work`  | How language models work | token, context window, training vs inference, model family and size, sampling, and temperature                                    | -                 | `AEC-02` first half; `DLAI-2`, `DLAI-6`; `Academy ai-capabilities-and-limitations`, `Academy ai-fluency-framework-foundations`, `Academy building-with-the-claude-api`; `Liu 2024`     |
| `concepts/prompting`        | Prompting                | instruction, example (few-shot), role and system prompt, iteration, structured output                                             | how-models-work   | `DLAI-1`, `DLAI-3`; `Brown 2020` for the definitions from the papers, `Learn Prompting` vocabulary; `Academy ai-fluency-framework-foundations`, `Academy building-with-the-claude-api` |
| `concepts/limits`           | Capabilities and limits  | hallucination, knowledge cutoff, non-determinism, sycophancy, cost and latency, instruction dilution, factuality and faithfulness | how-models-work   | `DLAI-3` (sycophancy); otherwise new; `Academy ai-capabilities-and-limitations`, `Academy ai-fluency-framework-foundations`; `Huang 2025` for factuality and faithfulness              |
| `concepts/what-is-an-agent` | What an agent is         | model vs agent, tool, agent loop, degree of autonomy, harness, environment, model request, stateless model                        | prompting, limits | `AEC-01`, usable for knowledge workers as is; `DLAI-11` M1; `Academy claude-platform-101`; `Claude Code agent loop`, `Claude docs messages`                                            |
| `concepts/grounding`        | Grounding and memory     | retrieval (RAG), grounding, short- and long-term memory, context rot                                                              | what-is-an-agent  | `AEC-05` knowledge-worker parts; `AEC-08` introduction; `Academy ai-capabilities-and-limitations`                                                                                      |
| `concepts/tokens-and-cost`  | Tokens, cost and effort  | input and output tokens, growing session cost, prompt caching, effort level                                                       | how-models-work   | `Claude docs prompt-caching`, `Claude Code costs`, `Claude docs effort`, `Claude docs messages`, `Claude docs pricing`                                                                 |

Competencies:

| Competency id                 | Statement                                                      | Draws on topics                    |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| `concepts/explains-models`    | Explains how a language model produces text and where it fails | how-models-work, limits, grounding |
| `concepts/prompts-reliably`   | Writes prompts that get reliable results                       | prompting, how-models-work         |
| `concepts/recognizes-agents`  | Recognizes an agent, its tools, and its degree of autonomy     | what-is-an-agent, limits           |
| `concepts/reasons-about-cost` | Reasons about what a model request costs and why               | tokens-and-cost, what-is-an-agent  |

Learning objectives:

| Competency           | Objective                    | Level  | Statement                                                                                      |
| -------------------- | ---------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `explains-models`    | `explains-generation`        | base   | Explains tokens, context, and sampling in plain words                                          |
| `explains-models`    | `names-failure-modes`        | base   | Names the common ways output goes wrong and why                                                |
| `explains-models`    | `explains-grounding`         | base   | Explains what grounding and retrieval add and what they don't fix                              |
| `prompts-reliably`   | `structures-a-prompt`        | base   | Turns a vague request into instruction, context, example, and format                           |
| `prompts-reliably`   | `iterates-on-output`         | base   | Improves a result by changing the prompt, not by retrying                                      |
| `prompts-reliably`   | `asks-for-structure`         | base   | Asks for output in a format the next step can use                                              |
| `recognizes-agents`  | `tells-agent-from-assistant` | base   | Tells a chat assistant from an agent by what it can do unprompted                              |
| `recognizes-agents`  | `places-on-autonomy-scale`   | base   | Places a product or workflow on the autonomy scale                                             |
| `recognizes-agents`  | `names-the-loop`             | base   | Describes the observe-think-act loop and the tools in it                                       |
| `recognizes-agents`  | `follows-one-prompt`         | base   | Follows one prompt through its model requests and names the part of the agent behind each step |
| `reasons-about-cost` | `reads-token-counts`         | base   | Reads the token counts of a request and says where its cost comes from                         |
| `reasons-about-cost` | `explains-growing-cost`      | base   | Explains why a session costs more per request as it grows                                      |
| `reasons-about-cost` | `chooses-effort-level`       | base   | Chooses an effort level for a kind of work and keeps it fixed                                  |
| `reasons-about-cost` | `explains-prompt-caching`    | expert | Explains what prompt caching saves and what breaks it                                          |

### Safety (`safety`)

Safety isn't a first-class track in any of the source courses; most of
this area is new material.

Topics:

| Topic id                 | Name                     | Concepts                                                                                         | Prerequisites                           | Source material                                                                                                                                                                               |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `safety/responsible-use` | Responsible use          | data privacy, confidentiality, licensing and attribution, disclosure                             | concepts/limits                         | new; `DLAI-2` week 3; `Academy ai-fluency-framework-foundations`                                                                                                                              |
| `safety/failure-modes`   | Recognizing failure      | hallucination in practice, bias, overreliance, automation complacency                            | concepts/limits                         | new; `Academy ai-capabilities-and-limitations`; `Parasuraman 2010`, `Goddard 2012`, `Bainbridge 1983`, `NTSB Asiana 214` for overreliance and automation complacency                          |
| `safety/verification`    | Verifying outputs        | checking habits, source checking, endorsed answers, "trust but verify" for agents                | failure-modes                           | new; `CS50x` endorsed answers as an idea; `Academy ai-fluency-framework-foundations`                                                                                                          |
| `safety/agent-risk`      | Agent risk               | blast radius, permissions and least privilege, human in the loop, prompt injection, exfiltration | concepts/what-is-an-agent, verification | `AEC-10`, the best knowledge-worker safety material available; `Academy introduction-to-claude-cowork`                                                                                        |
| `safety/governance`      | Governance and oversight | policy, logging and audit, model change risk, escalation, regulation, risk assessment            | agent-risk                              | `AEC-10` defense layers; `AEC-11` engineer parts; `Academy deploying-claude-enterprise-with-confidence`, `Academy building-effective-human-agent-teams`; `AI Act`, `EC AI Act` for regulation |

Competencies:

| Competency id                | Statement                                          | Draws on topics             |
| ---------------------------- | -------------------------------------------------- | --------------------------- |
| `safety/handles-data-safely` | Uses AI safely with confidential and personal data | responsible-use             |
| `safety/verifies-output`     | Verifies AI output before relying on it            | failure-modes, verification |
| `safety/judges-agent-risk`   | Judges the risk of letting an agent act            | agent-risk, governance      |

Learning objectives:

| Competency            | Objective               | Level  | Statement                                                         |
| --------------------- | ----------------------- | ------ | ----------------------------------------------------------------- |
| `handles-data-safely` | `decides-what-to-share` | base   | Decides what may go into a prompt and what may not                |
| `handles-data-safely` | `discloses-ai-use`      | base   | Discloses AI use where the audience expects it                    |
| `handles-data-safely` | `respects-licenses`     | base   | Respects licenses and attribution in AI-assisted output           |
| `verifies-output`     | `checks-claims`         | base   | Checks claims and sources on anything that leaves their desk      |
| `verifies-output`     | `spots-sycophancy`      | base   | Spots agreement that's not evidence                               |
| `verifies-output`     | `calibrates-trust`      | base   | Matches the depth of checking to the cost of being wrong          |
| `verifies-output`     | `keeps-a-check-habit`   | expert | Builds verification into a team's routine rather than their own   |
| `judges-agent-risk`   | `names-blast-radius`    | base   | Names what an agent action can reach and break                    |
| `judges-agent-risk`   | `chooses-human-in-loop` | base   | Chooses where a human must approve                                |
| `judges-agent-risk`   | `recognizes-injection`  | base   | Recognizes prompt injection and data exfiltration paths           |
| `judges-agent-risk`   | `sets-oversight`        | expert | Sets policy, logging and escalation for agents in an organization |

### Using agents (`using-agents`)

Topics:

| Topic id                      | Name                      | Concepts                                                                                                 | Prerequisites                                  | Source material                                                                                                                             |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `using-agents/assistant-work` | Working with an assistant | finding information, thought partner, drafting, critique, working with files, and images                 | concepts/prompting                             | `DLAI-3`; `Academy claude-101`, `Academy introduction-to-claude-cowork`                                                                     |
| `using-agents/delegating`     | Delegating to an agent    | task brief, giving context, choosing a degree of autonomy, checking results                              | concepts/what-is-an-agent, safety/verification | new; `DLAI-11` M1; `Ng`; `Academy ai-fluency-framework-foundations`, `Academy introduction-to-claude-cowork`                                |
| `using-agents/decomposition`  | Decomposing work          | task decomposition, iteration, when to stop and do it yourself                                           | delegating                                     | `DLAI-11` M1; `Academy ai-fluency-framework-foundations`                                                                                    |
| `using-agents/choosing-tools` | Choosing models and tools | model fit, cost and speed, chat vs agent vs automation, what to keep human, reasoning across tool levels | delegating, concepts/limits                    | `AEC-12` chooser after a public rewrite; `Brilliant ABS`; `Academy ai-fluency-for-builders`, `Academy building-effective-human-agent-teams` |

Competencies:

| Competency id                            | Statement                                           | Draws on topics                           |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `using-agents/delegates-and-checks`      | Delegates a task to an agent and checks the result  | delegating, decomposition, assistant-work |
| `using-agents/chooses-tool-and-autonomy` | Chooses the right tool and autonomy level for a job | choosing-tools, delegating                |

Learning objectives:

| Competency                  | Objective                        | Level  | Statement                                                   |
| --------------------------- | -------------------------------- | ------ | ----------------------------------------------------------- |
| `delegates-and-checks`      | `writes-a-brief`                 | base   | Writes a brief with goal, context, limits and done-criteria |
| `delegates-and-checks`      | `chooses-autonomy`               | base   | Chooses how much the agent may do before checking in        |
| `delegates-and-checks`      | `reviews-against-brief`          | base   | Reviews the result against the brief, not against a feeling |
| `delegates-and-checks`      | `adjusts-mid-task`               | base   | Adjusts the brief when the work reveals new information     |
| `chooses-tool-and-autonomy` | `picks-chat-agent-or-automation` | base   | Picks chat, agent or automation for a task and says why     |
| `chooses-tool-and-autonomy` | `picks-a-model-by-fit`           | base   | Picks a model for a task by testing fit, cost and speed     |
| `chooses-tool-and-autonomy` | `keeps-the-human-steps`          | base   | Names the steps that remain a human's job and why           |
| `chooses-tool-and-autonomy` | `reasons-across-levels`          | expert | Re-applies judgment when the tool level rises               |

## Engineering

### Area `coding-with-agents`: Coding with agents

**Specification** (taste, success criteria, decomposition, designing the
verification) and **verification** are topics of their own because
Brilliant's map shows where human skill concentrates once an agent does the
implementing. Verification gets its own topic rather than a corner of
quality, and reversibility joins workflow for the same reason.

Topics:

| Topic id                           | Name                         | Concepts                                                                                                                                                                                                                | Prerequisites                             | Source material                                                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coding-with-agents/first-session` | Running a coding agent       | install and setup, codebase understanding, first change, permissions, sandbox, trust boundary, secrets hygiene, session, and context                                                                                    | using-agents/delegating                   | `AEC-12` after a public rewrite; `DLAI-5`; `Academy claude-code-101`, `Academy claude-code-in-action`                                                                                                                                 |
| `coding-with-agents/specification` | Deciding and specifying      | what's worth building, success criteria, decomposition into components, dependencies, designing the verification, design interview, throwaway prototype, shared vocabulary                                              | first-session, using-agents/decomposition | new; `Brilliant TAS`, `Brilliant SPC`; `Academy ai-native-sdlc-playbook`, `Academy ai-fluency-for-builders`; `Claude Code best practices`; `Thomas 2019`, `Artima tracer bullets`, `Brooks 1995`, `Evans 2003`, `Evans DDD Reference` |
| `coding-with-agents/workflow`      | Plan, implement, verify      | plan mode, spec-driven change, test-driven change, working increments, sequencing for early feedback, reversibility, commits and PRs                                                                                    | first-session, specification              | new; `DLAI-5`, `DLAI-6`; `Brilliant INC`; `Academy claude-code-101`, `Academy ai-native-sdlc-playbook`                                                                                                                                |
| `coding-with-agents/context`       | Context engineering for code | project instructions, scoping a task, referencing files, avoiding context rot, starting context, deciding at a phase boundary                                                                                           | workflow, concepts/grounding              | `AEC-15`, shared with customizing-agents; `Academy claude-code-101`, `Academy claude-code-in-action`; `Claude Code context window`, `Claude Code best practices`, `Anthropic context engineering`                                     |
| `coding-with-agents/verification`  | Verifying agent work         | reviewing code you didn't write, verifying against the specification, observing a running system, isolating a fault, bounded self-checking loops, deterministic gates, red-teaming your own agent, fresh-context review | workflow, safety/verification             | new; `Brilliant VER`; `Academy ai-fluency-for-builders`, `Academy claude-code-in-action`; `Claude Code best practices`                                                                                                                |
| `coding-with-agents/quality`       | Quality with agents          | testing, documentation, dependency hygiene, security review of agent output, supply-chain risk, deep modules                                                                                                            | verification, safety/agent-risk           | `DLAI-7`; `Brilliant SEC`; `Fuchsia review`, `OpenSSF Scorecard`; `Academy ai-native-sdlc-playbook`, `Academy claude-code-in-action`; `Ousterhout 2021`                                                                               |
| `coding-with-agents/team`          | Agents in a team             | parallel sessions, worktrees, CI integration, team hooks, review norms, attribution, agent-reachable backlog, standards file                                                                                            | quality                                   | `DLAI-5`; this repo's own practice; `Academy claude-code-in-action`, `Academy ai-native-sdlc-playbook`; `Claude Code best practices`, `Claude Code memory`, `GitHub docs creating-issue-dependencies`, `Google eng-practices`         |

Competencies:

| Competency id                            | Statement                                                                     | Draws on topics                           |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| `coding-with-agents/specifies-work`      | Specifies work well enough for an agent to implement and for anyone to verify | specification, using-agents/decomposition |
| `coding-with-agents/ships-with-agent`    | Ships a change with a coding agent through plan, implement, and verify        | first-session, workflow, context          |
| `coding-with-agents/verifies-agent-work` | Verifies agent-written code before trusting it                                | verification, quality, safety/agent-risk  |
| `coding-with-agents/works-in-team`       | Works with agents alongside a team                                            | team, workflow                            |

Learning objectives:

| Competency            | Objective                          | Level  | Statement                                                                                |
| --------------------- | ---------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `specifies-work`      | `judges-worth-building`            | base   | Judges whether something should be built before building it                              |
| `specifies-work`      | `defines-success`                  | base   | Defines what a successful outcome requires                                               |
| `specifies-work`      | `decomposes-into-components`       | base   | Decomposes a problem into components with clear dependencies                             |
| `specifies-work`      | `designs-the-check`                | base   | Designs how the work gets verified before it is built                                    |
| `specifies-work`      | `is-interviewed-before-planning`   | base   | Reaches a shared design by having the agent interview them before planning               |
| `specifies-work`      | `settles-with-a-prototype`         | expert | Settles a design question with a throwaway prototype                                     |
| `ships-with-agent`    | `runs-a-session`                   | base   | Runs a session from setup to a reviewed diff                                             |
| `ships-with-agent`    | `works-in-increments`              | base   | Works in small increments, sequenced for early feedback                                  |
| `ships-with-agent`    | `keeps-change-reversible`          | base   | Keeps every change reversible                                                            |
| `ships-with-agent`    | `gives-the-right-context`          | base   | Gives the agent the files, constraints, and limits the task needs                        |
| `ships-with-agent`    | `keeps-understanding`              | expert | Still understands the code as the agent produces more of it                              |
| `ships-with-agent`    | `chooses-what-a-phase-starts-with` | expert | Chooses deliberately what each phase of work starts with, including the starting context |
| `verifies-agent-work` | `reviews-others-code`              | base   | Reviews code they didn't write, against the specification                                |
| `verifies-agent-work` | `observes-and-debugs`              | base   | Observes the running system and isolates a fault systematically                          |
| `verifies-agent-work` | `automates-the-check`              | base   | Turns a check into a bounded, self-checking loop                                         |
| `verifies-agent-work` | `prefers-gates-to-opinions`        | base   | Chooses a deterministic gate over a model's review to block work                         |
| `verifies-agent-work` | `screens-for-security`             | base   | Screens agent output for security and supply-chain problems                              |
| `verifies-agent-work` | `uses-a-fresh-review`              | base   | Has a change reviewed in a fresh session and weighs the findings                         |
| `works-in-team`       | `attributes-honestly`              | base   | Attributes agent work as agent work in commits and reviews                               |
| `works-in-team`       | `follows-team-norms`               | base   | Follows the team's review and CI norms for agent changes                                 |
| `works-in-team`       | `keeps-the-backlog-reachable`      | base   | Keeps specs and tickets where the team and the agent can both reach them                 |
| `works-in-team`       | `turns-findings-into-rules`        | base   | Turns recurring review findings into written standards or automated checks               |
| `works-in-team`       | `runs-parallel-work`               | expert | Runs parallel agent sessions without losing coherence                                    |
| `works-in-team`       | `sets-team-practice`               | expert | Sets the team's practice for agent use                                                   |

### Customizing agents (`customizing-agents`)

Topics:

| Topic id                                  | Name                            | Concepts                                                                                                                                            | Prerequisites                                               | Source material                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customizing-agents/instructions`         | Project instructions            | AGENTS.md / CLAUDE.md, sections, monorepo hierarchy, when instructions aren't enough, loading versus pointing, pruning instructions                 | coding-with-agents/context                                  | `AEC-15` with its builder widget and exercise; `Academy claude-code-101`, `Academy claude-code-in-action`; `Claude Code memory`, `Claude Code best practices`, `Anthropic context engineering`                         |
| `customizing-agents/skills`               | Agent skills                    | skill vs tool vs instruction, skill spec, progressive disclosure, writing a good skill, plugins, invocation mode, skill scope, published skill sets | instructions                                                | `AEC-17`; `DLAI-10`; `Academy introduction-to-agent-skills`, `Academy claude-code-in-action`, `Academy ai-native-sdlc-playbook`; `Claude Code skills`, `Agent Skills spec`, `Claude Code plugins`, `anthropics skills` |
| `customizing-agents/mcp`                  | Connecting tools with MCP       | server, client, transport, MCP primitives, MCP vs CLI, tool cost, MCP security, stdio logging                                                       | instructions, concepts/what-is-an-agent                     | `AEC-14`, `AEC-16`; `DLAI-9`; `Academy introduction-to-model-context-protocol`, `Academy model-context-protocol-advanced-topics`, `Academy claude-code-101`; `MCP specification`                                       |
| `customizing-agents/hooks-permissions`    | Hooks, permissions, settings    | permission modes, allowlists, hooks, subagents, settings layering, steering by rejection                                                            | instructions, safety/agent-risk                             | new; `Academy claude-code-101`, `Academy claude-code-in-action`, `Academy introduction-to-subagents`, `Academy ai-native-sdlc-playbook`; `Claude Code hooks`, `Claude Code permissions`                                |
| `customizing-agents/memory`               | Memory and session context      | auto-memory, context files, compaction, session handoff, turning repeated work into reusable knowledge, primary and secondary sources               | skills, concepts/grounding                                  | `AEC-05` engineer parts; `Brilliant MEM`; `Academy claude-code-101`, `Academy claude-code-in-action`; `Claude Code memory`                                                                                             |
| `customizing-agents/inspecting-the-agent` | Inspecting what the agent sends | context meter, session record, request logging                                                                                                      | concepts/what-is-an-agent, coding-with-agents/first-session | `Claude Code context window`, `Claude Code statusline`, `Claude Code claude directory`, `Claude Code monitoring`, `Claude Code llm gateway`                                                                            |

Competencies:

| Competency id                              | Statement                                                             | Draws on topics                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `customizing-agents/configures-agent`      | Configures an agent for a project                                     | instructions, hooks-permissions, memory                         |
| `customizing-agents/writes-skill`          | Writes a reusable agent skill                                         | skills, instructions                                            |
| `customizing-agents/connects-tools-safely` | Connects an agent to tools and data safely                            | mcp, hooks-permissions, safety/agent-risk, inspecting-the-agent |
| `customizing-agents/adopts-a-skill-set`    | Adopts a published skill set without giving up control of the project | skills, instructions, hooks-permissions                         |

Learning objectives:

| Competency              | Objective                      | Level  | Statement                                                                                        |
| ----------------------- | ------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| `configures-agent`      | `writes-project-instructions`  | base   | Writes instructions that remove a recurring agent mistake                                        |
| `configures-agent`      | `sets-permissions`             | base   | Sets permissions to the least the work needs                                                     |
| `configures-agent`      | `adds-a-hook`                  | base   | Adds a hook that enforces a rule the instructions can't                                          |
| `configures-agent`      | `chooses-load-or-point`        | base   | Decides for each piece of guidance whether to load it or point at it                             |
| `configures-agent`      | `manages-memory`               | expert | Manages what the agent remembers between sessions                                                |
| `configures-agent`      | `prunes-instructions`          | expert | Prunes instruction files line by line                                                            |
| `writes-skill`          | `chooses-skill-over-tool`      | base   | Chooses between a skill, a tool, and an instruction for a need                                   |
| `writes-skill`          | `packages-a-procedure`         | base   | Packages a repeatable procedure as a skill another person's agent can use                        |
| `writes-skill`          | `discloses-progressively`      | base   | Structures a skill so the agent loads only what it needs                                         |
| `writes-skill`          | `evaluates-a-plugin`           | base   | Reads a plugin's parts before installing it and takes only what is needed                        |
| `writes-skill`          | `chooses-invocation-and-scope` | base   | Chooses who invokes a skill and where it is installed                                            |
| `connects-tools-safely` | `adds-a-tool`                  | base   | Adds a tool via MCP or CLI with least privilege                                                  |
| `connects-tools-safely` | `weighs-tool-cost`             | base   | Explains the token and risk cost of a tool before adding it                                      |
| `connects-tools-safely` | `hardens-a-connection`         | expert | Hardens a tool connection against injection and exfiltration                                     |
| `connects-tools-safely` | `inspects-requests`            | expert | Inspects the requests to see what tools and context cost, and keeps request logs local           |
| `adopts-a-skill-set`    | `vets-a-skill-set`             | base   | Vets a published skill set before installing it, as they would a dependency                      |
| `adopts-a-skill-set`    | `adopts-skills-gradually`      | base   | Adopts a few skills at a time and checks each one's effect and context cost                      |
| `adopts-a-skill-set`    | `keeps-the-project-in-charge`  | base   | Keeps the project's own instructions, hooks and permissions in charge when a skill set disagrees |

### Building agents (`building-agents`)

Topics:

| Topic id                           | Name                          | Concepts                                                                                                                                                        | Prerequisites                                         | Source material                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `building-agents/tool-use`         | Tool use                      | function calling, tool schema design, N x M integration problem, error handling, parallel calls, tool approval                                                  | concepts/what-is-an-agent                             | `AEC-03`; `Academy claude-platform-101`, `Academy building-with-the-claude-api`, `Academy introduction-to-model-context-protocol`; `Claude Code agent sdk permissions`, `Claude Code agent sdk user input` |
| `building-agents/agent-loop`       | The agent loop and harness    | loop from scratch, Agent SDK, stop conditions, unbounded-loop pitfalls                                                                                          | tool-use                                              | `AEC-13`, the source lesson closest to an exercise; `Academy claude-platform-101`, `Academy building-with-the-claude-api`                                                                                  |
| `building-agents/patterns`         | Design patterns               | ReAct, reflection, planning, plan-then-execute vs reactive, hierarchical planning, workflow patterns                                                            | agent-loop                                            | `AEC-04`, `AEC-06`; `DLAI-11` M2, M5; `Academy building-with-the-claude-api`; `Anthropic effective agents`                                                                                                 |
| `building-agents/orchestration`    | Orchestration and multi-agent | code- vs model-driven orchestration, sequential / hierarchical / collaborative, orchestration tax                                                               | patterns                                              | `AEC-07`, `AEC-18`; `Academy claude-platform-101`, `Academy introduction-to-subagents`                                                                                                                     |
| `building-agents/retrieval-memory` | Agentic retrieval and memory  | agentic RAG loop, memory storage choices, when basic RAG suffices                                                                                               | agent-loop, concepts/grounding                        | `AEC-05`, `AEC-08`; `Academy building-with-the-claude-api`, `Academy claude-platform-101`                                                                                                                  |
| `building-agents/evaluation`       | Evaluation and testing        | quality pillars, rubrics, metrics that can't be gamed, trajectory evaluation, LLM as judge, golden sets, error analysis, observability                          | agent-loop, coding-with-agents/verification           | `AEC-09`; `DLAI-11` M4; `Brilliant VER`; `Academy building-with-the-claude-api`, `Academy ai-native-sdlc-playbook`                                                                                         |
| `building-agents/production`       | Guardrails and production     | defense layers, eval-gated deploys, rollout strategies, cost, provider operations, agent-specific security risks, protocols (MCP, A2A), trace-driven evaluation | evaluation, safety/governance, customizing-agents/mcp | `AEC-10`, `AEC-11`, `AEC-14`; `Brilliant SEC`; `Academy model-context-protocol-advanced-topics`, `Academy claude-platform-101`; `Husain 2024`                                                              |

Competencies:

| Competency id                         | Statement                                    | Draws on topics                                       |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `building-agents/builds-agent-loop`   | Builds a tool-using agent loop               | tool-use, agent-loop, retrieval-memory                |
| `building-agents/evaluates-agents`    | Evaluates an agent's quality systematically  | evaluation, production                                |
| `building-agents/orchestrates-agents` | Designs and orchestrates multi-agent systems | patterns, orchestration                               |
| `building-agents/runs-in-production`  | Runs an agent in production with guardrails  | production, safety/governance, customizing-agents/mcp |

Learning objectives:

| Competency            | Objective                      | Level  | Statement                                                                           |
| --------------------- | ------------------------------ | ------ | ----------------------------------------------------------------------------------- |
| `builds-agent-loop`   | `defines-a-tool`               | base   | Defines a tool with a schema the model uses correctly                               |
| `builds-agent-loop`   | `implements-the-loop`          | base   | Implements the loop with error handling and a stop condition                        |
| `builds-agent-loop`   | `adds-retrieval`               | base   | Adds retrieval or memory and knows when basic RAG is enough                         |
| `builds-agent-loop`   | `gates-risky-tools`            | base   | Decides which tools must wait for a person's approval and what that person is shown |
| `builds-agent-loop`   | `uses-an-sdk`                  | expert | Rebuilds the loop on an agent SDK and explains what the SDK took over               |
| `evaluates-agents`    | `writes-a-rubric`              | base   | Turns "good" into scorable criteria                                                 |
| `evaluates-agents`    | `builds-a-golden-set`          | base   | Builds a representative input set with expected qualities                           |
| `evaluates-agents`    | `grades-trajectories`          | base   | Grades the path the agent took, not only the final answer                           |
| `evaluates-agents`    | `prioritizes-fixes`            | base   | Chooses what to fix from counted failures                                           |
| `evaluates-agents`    | `avoids-gamed-metrics`         | expert | Chooses metrics that can't improve without the real quality improving               |
| `evaluates-agents`    | `grows-the-set-from-use`       | expert | Grows the evaluation set from what goes wrong in real use                           |
| `orchestrates-agents` | `picks-a-pattern`              | base   | Picks a design pattern for a task and says why                                      |
| `orchestrates-agents` | `justifies-orchestration-cost` | base   | Justifies the coordination cost of more than one agent                              |
| `orchestrates-agents` | `composes-patterns`            | expert | Composes patterns and names the failure modes of the composition                    |
| `runs-in-production`  | `gates-on-evals`               | base   | Gates a deploy on evaluation results                                                |
| `runs-in-production`  | `layers-defenses`              | base   | Layers policy, filtering, and monitoring around the agent                           |
| `runs-in-production`  | `mitigates-agent-risks`        | base   | Mitigates injection, exfiltration and over-permission in a running agent            |
| `runs-in-production`  | `manages-cost-and-rollout`     | expert | Manages cost and rolls out changes without breaking users                           |

## Behaviors: worked example

Every objective has behaviors in the YAML. Each takes this form: a
one-sentence claim, a why, and one example, with two to six per objective.
For `using-agents/delegates-and-checks/writes-a-brief` (`base`):

| #   | Claim                                                                                   | Why                                                                                                                              | Example                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A brief states the goal, the context the work needs and the limits it must stay within. | An agent fills in whatever is left unsaid with plausible defaults, so what it must not touch matters as much as what it must do. | "Update the pricing table in `docs/pricing.md` from this spreadsheet; don't change any other file" stays on task, where "update the pricing" may rewrite the page. |
| 2   | The brief states the done-criteria before the work starts.                              | Without them you judge the result by feel and accept a plausible result as a correct one.                                        | "Done when every row in the spreadsheet appears once in the table and the totals match" turns review into a check rather than a read.                              |
| 3   | The brief names the information the agent should use and where it is.                   | An agent that has to guess sources picks the most available one, not the right one.                                              | Pointing at the approved spreadsheet, not "the latest numbers", prevents the agent from pulling last quarter's figures from an old email.                          |

## Alignment

An alignment row maps an external framework's item to the objectives here
that address it. The YAML keeps the rows per framework, each row written
once (S10 "Alignment"), and a competency page shows the rows that name one
of its objectives. This section summarizes the rows for the three
frameworks known so far, abbreviating a whole competency as `*`; the YAML
lists every objective in full.

### Frameworks

**Brilliant's *Coding with AI* skills map** organizes AI-era programming
skill into seven "big ideas", each with a three-letter code and numbered
objectives underneath (`INC-2`, `VER-7`). This spec cites the codes as facts;
the "asks" column paraphrases what each objective asks for.

| Code | Big idea                               | In short                                                                 |
| ---- | -------------------------------------- | ------------------------------------------------------------------------ |
| TAS  | Taste: what's worth building           | Judge ideas, define success, weigh value against cost                    |
| INC  | Developing incrementally               | Working increments, early feedback, understanding, reversibility         |
| SPC  | Specification and design               | Decompose, analyze dependencies, manage constraints, design the check    |
| MEM  | Memory (listed under SPC)              | Manage what's held in memory; turn repeated work into reusable knowledge |
| BLD  | Designing workflows                    | Direct an agent to a spec, adjust, divide and delegate, oversee          |
| VER  | Verification                           | Verify against spec, review, observe, debug, automate, measure           |
| SEC  | Security and adversarial thinking      | Misuse analysis, secure coding, AI code review, agent risk, supply chain |
| ABS  | Reasoning across levels of abstraction | Reason at the right level; re-apply reasoning as tooling rises           |

**Andrew Ng's AI engineering skills map** names four skills: building and
deploying AI applications, software engineering fundamentals, coding-agent
use, and shaping the build (deciding what goes in the spec).

**The AI Fluency framework** (Dakan and Feller, taught in Anthropic's *AI
Fluency: Framework & Foundations* course) names four competencies, the "4Ds":
Delegation, Description, Discernment, and Diligence. This spec cites the
four names as facts and paraphrases what each asks for in its own words.
Its rows map mostly to Foundations objectives, and the Brilliant and Ng
rows mostly to Engineering ones.

### Rows

| Framework                        | Code / item                            | Asks                                                                       | Our objectives                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brilliant Coding with AI         | TAS-1..4                               | Judge what should be built and define success, weighing value against cost | `coding-with-agents/specifies-work/judges-worth-building`, `defines-success`                                                                                                                                                                                                                     |
| Brilliant Coding with AI         | INC-1, INC-2, INC-5                    | Working increments, early feedback, reversibility                          | `coding-with-agents/ships-with-agent/works-in-increments`, `keeps-change-reversible`                                                                                                                                                                                                             |
| Brilliant Coding with AI         | INC-3, INC-4                           | Maintain understanding and coherence                                       | `coding-with-agents/ships-with-agent/keeps-understanding`                                                                                                                                                                                                                                        |
| Brilliant Coding with AI         | SPC-3, SPC-4, SPC-6                    | Decompose, analyze dependencies, design verification                       | `coding-with-agents/specifies-work/decomposes-into-components`, `designs-the-check`                                                                                                                                                                                                              |
| Brilliant Coding with AI         | SPC-5, BLD-1                           | Manage constraints; direct an agent to a specification                     | `using-agents/delegates-and-checks/writes-a-brief`, `coding-with-agents/ships-with-agent/gives-the-right-context`                                                                                                                                                                                |
| Brilliant Coding with AI         | BLD-2, BLD-3                           | Adjust on new information; divide and delegate                             | `using-agents/delegates-and-checks/adjusts-mid-task`, `using-agents/chooses-tool-and-autonomy/picks-chat-agent-or-automation`                                                                                                                                                                    |
| Brilliant Coding with AI         | BLD-4, BLD-5                           | Organize and oversee a workflow                                            | `coding-with-agents/works-in-team/runs-parallel-work`, `building-agents/orchestrates-agents/picks-a-pattern`                                                                                                                                                                                     |
| Brilliant Coding with AI         | VER-2..6                               | Verify against spec, review, observe, debug, automate                      | `coding-with-agents/verifies-agent-work/*`                                                                                                                                                                                                                                                       |
| Brilliant Coding with AI         | VER-7                                  | Measure quality and evaluate AI systems                                    | `building-agents/evaluates-agents/*`                                                                                                                                                                                                                                                             |
| Brilliant Coding with AI         | MEM-1, MEM-2                           | Manage memory; turn repeated work into reusable knowledge                  | `customizing-agents/configures-agent/manages-memory`, `customizing-agents/writes-skill/packages-a-procedure`                                                                                                                                                                                     |
| Brilliant Coding with AI         | SEC-3, SEC-5                           | Evaluate AI code for vulnerabilities; supply-chain risk                    | `coding-with-agents/verifies-agent-work/screens-for-security`, `customizing-agents/writes-skill/evaluates-a-plugin`                                                                                                                                                                              |
| Brilliant Coding with AI         | SEC-4                                  | Mitigate AI- and agent-specific risks                                      | `building-agents/runs-in-production/mitigates-agent-risks`, `customizing-agents/connects-tools-safely/hardens-a-connection`                                                                                                                                                                      |
| Brilliant Coding with AI         | ABS-1..3                               | Reason across levels of abstraction and tooling                            | `using-agents/chooses-tool-and-autonomy/reasons-across-levels`                                                                                                                                                                                                                                   |
| Ng, AI engineering skills map    | Using coding agents                    | Plan, execute, verify, monitor at calibrated autonomy                      | `using-agents/delegates-and-checks`, `coding-with-agents/ships-with-agent`                                                                                                                                                                                                                       |
| Ng, AI engineering skills map    | Shaping the build                      | Deciding what goes in the spec                                             | `coding-with-agents/specifies-work`                                                                                                                                                                                                                                                              |
| Ng, AI engineering skills map    | Building and deploying AI applications | Build, evaluate, ship                                                      | `building-agents/*`                                                                                                                                                                                                                                                                              |
| AI Fluency 4D (Dakan and Feller) | Delegation                             | Decide what to hand to AI, which tool fits, and how much autonomy to give  | `concepts/recognizes-agents/places-on-autonomy-scale`, `using-agents/chooses-tool-and-autonomy/picks-chat-agent-or-automation`, `keeps-the-human-steps`, `picks-a-model-by-fit`, `using-agents/delegates-and-checks/chooses-autonomy`, `coding-with-agents/specifies-work/judges-worth-building` |
| AI Fluency 4D (Dakan and Feller) | Description                            | State the goal, context and wanted output clearly, and refine it           | `concepts/prompts-reliably/*`, `using-agents/delegates-and-checks/writes-a-brief`, `adjusts-mid-task`, `coding-with-agents/ships-with-agent/gives-the-right-context`                                                                                                                             |
| AI Fluency 4D (Dakan and Feller) | Discernment                            | Judge the output, the process and the behavior of the AI critically        | `concepts/explains-models/names-failure-modes`, `safety/verifies-output/checks-claims`, `spots-sycophancy`, `calibrates-trust`, `using-agents/delegates-and-checks/reviews-against-brief`, `coding-with-agents/verifies-agent-work/reviews-others-code`                                          |
| AI Fluency 4D (Dakan and Feller) | Diligence                              | Use AI responsibly, transparently and with accountability for the result   | `safety/handles-data-safely/*`, `safety/judges-agent-risk/names-blast-radius`, `chooses-human-in-loop`, `coding-with-agents/works-in-team/attributes-honestly`                                                                                                                                   |

### Not covered

Brilliant SEC-1 and SEC-2 (general secure coding) and SPC-1 and SPC-2
(interaction and data-model design) are software engineering, not
AI-specific, and stay out of scope.

## Differentiation by routing

Differentiation happens through position in the graph, not through variants
of a page. Content is written once. This is the model Brilliant describes
for a classroom: three learners work in parallel on prerequisite review, the
current objective and an extension, all inside the same course graph.

### Mechanism

| Input                              | Routing                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lesson frontmatter                 | `assumes` lists the objectives a lesson relies on, each pointing at the section that teaches it. `extends-to` lists the next lesson, a specialization topic, or a short. |
| Failed or skipped checkpoint       | Shows a card naming the assumed objective and the section to revisit.                                                                                                    |
| Every checkpoint passed first time | Shows the lesson's extensions.                                                                                                                                           |
| Comfort level `less`               | Inserts the assumed objectives' sections into the path before each lesson, and keeps tutor mode hint-heavy.                                                              |
| Comfort level `more`               | Offers a skills check at the start of a lesson (one checkpoint per served objective), skips what's passed, offers the extensions.                                        |
| Exercise                           | One per lesson, written once with no variants, ending with an optional one-line stretch goal.                                                                            |
| Path                               | Renders three lanes: behind (assumed objectives not yet passed), on target (the path's next lesson), ahead (extensions). "You are here" marks the learner.               |
| Review item                        | A review item failed twice in a row marks its objective "behind" in the path lanes and offers the section that teaches it, exactly like a failed checkpoint.             |
| Tutor mode                         | On a wrong answer asks a diagnostic question. If the gap is upstream, it points at the upstream section rather than re-explaining.                                       |

All routing reads only the map and the local progress record.

### Worked example

Take the lesson *Your first session with a coding agent*:

| Field        | Value                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| serves       | `ships-with-agent/runs-a-session`, `ships-with-agent/gives-the-right-context`                                                                  |
| assumes      | `delegates-and-checks/writes-a-brief` (section "Writing the brief" in *Delegating a task to an agent*), `judges-agent-risk/names-blast-radius` |
| extends-to   | *Plan, implement, verify*; a short on permission modes                                                                                         |
| checkpoint 1 | Fix a weak brief. A fail routes to the Delegating section, and a clean run offers the extensions.                                              |
| exercise     | A scripted change in the fixture repository. Stretch goal: "now ask the agent for a refactor you choose, and review it the same way".          |

## Cross-area edges

| Edge                                                                                        | Type         | Why                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `safety/agent-risk` -> `coding-with-agents/quality`, `customizing-agents/hooks-permissions` | prerequisite | Safety gates Engineering instead of continuing as a track of its own after Foundations |
| `concepts/what-is-an-agent` -> six topics                                                   | prerequisite | The hub of the map and the anchor for its first visual                                 |
| `coding-with-agents/context` and `customizing-agents/instructions`                          | related      | The same subject taught from the user side and the author side                         |
| `coding-with-agents/verification` -> `building-agents/evaluation`                           | prerequisite | You verify one piece of work before you measure a system                               |
| `building-agents/evaluation` before `patterns` and `orchestration`                          | path order   | Ng's ordering puts evaluation and error analysis early; not a hard prerequisite        |

Some competencies draw on topics from two areas. That's expected;
competencies aren't confined to their area's topics.

## Paths

| Path               | Audience                  | Lessons                                                                                             | Goal                                                 |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `knowledge-worker` | Everyone                  | All Foundations, in area order                                                                      | All Foundations competencies at `base`               |
| `engineer`         | Software engineers        | Foundations, then coding-with-agents, then customizing-agents                                       | `ships-with-agent` and `configures-agent` at `base`  |
| `agent-builder`    | Engineers building agents | Foundations (agent and safety parts), building-agents/tool-use through evaluation, then customizing | `builds-agent-loop` and `evaluates-agents` at `base` |

## Related specs

- [S01 Project dictionary](S01-dictionary.md): every term used here.

## Open questions

1. Whether `concepts/grounding` belongs in Foundations or moves to
   Engineering as a `building-agents` topic only. Leaning: keep a short
   version in Foundations because knowledge workers meet RAG-based products
   daily.
2. Whether `safety/governance` deserves a Foundations lesson or only the
   `expert` objective `sets-oversight`. Leaning: one short lesson.
3. Naming of `hooks-permissions`; it is Claude Code specific where the rest
   isn't. Decide when writing the lesson.
4. Whether Foundations should have any `expert` objectives at all.
   `keeps-a-check-habit` and `sets-oversight` are drafted above. Drop them if
   Foundations stops at `base` by design.
5. Whether `coding-with-agents/specification` deserves a competency of its
   own or folds into `ships-with-agent`. Kept separate for now because
   specifying is where human skill concentrates once an agent implements.
