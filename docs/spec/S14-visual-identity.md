# Visual identity (S14)

**Purpose:** Fix how the site looks next to the two sites it now sits
between: the organization site it is a sub-site of, and the learning
platform that deep links into its lessons. Say which parts of the look the
open repository takes and which parts it leaves out.

**Status:** Implemented (2026-09-30)

## Introduction

The site moved to `schubergphilis.github.io/ai-training/`. Learners reach a
lesson in two ways: from the organization site at
`schubergphilis.github.io`, and from a learning platform that lists lessons
as activities in a learning journey and opens them by deep link. Today the
site uses the maintainer's personal "LSD Warm" palette (brown and amber),
with Merriweather Sans for the interface and Merriweather, a serif font, for
lesson text. A learner who clicks through from either site opens a page
that looks like a different product.

The repository remains open source and open content: code under Apache-2.0
and content under CC BY-SA 4.0. A company logo, a licensed typeface and
brand guide text can't be released under those licenses. The site can't
use the full brand. Color values and a free font aren't protected, and
neither is the spacing or the corner radius of a component, so the site
can match those.

The organization site applies the brand fully: an SBP Blue header bar, the
logo, and Poppins with extra-bold headings. The learning platform uses a
quieter version: a white header, a light grey page, white cards with thin
borders, Inter at weight 600 for headings, fully rounded badges and
buttons, and teal for "done".

This spec follows the learning platform. Most learners come from there, its
design is meant for long study sessions, and it uses only free fonts and
plain color values. The organization site uses the same blue, and the
shared accent makes the three sites look related.

## Design

### What the site takes and what it leaves out

| Part                          | Decision                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| SBP Blue `#1E80ED`            | Taken as the accent. A color value is a fact, and the organization site publishes it in its own CSS.        |
| Neutral greys, teal, amber    | Taken, as values chosen to match the learning platform in both themes.                                      |
| Inter (SIL Open Font License) | Taken for the interface and for the lesson body.                                                            |
| Radii, borders, pills         | Taken: 16px cards, pill badges and buttons, borders instead of shadows.                                     |
| Company logo and wordmark     | Left out. It is a trademark and can't be licensed as CC BY-SA. The site uses its current favicon and title. |
| TT Interphases                | Left out. It is a licensed font.                                                                            |
| Brand guide text and images   | Left out. The brand guide sources are private.                                                              |
| Blue header bar               | Left out. The learning platform uses a white header, and a lesson opened from it should look like it.       |

### Palette

The site keeps Starlight's token model (`site/src/styles/custom.css`): an
accent ramp, a gray ramp and black and white, per theme. The values:

| Token                    | Light     | Dark      | Role                                    |
| ------------------------ | --------- | --------- | --------------------------------------- |
| `--sl-color-accent`      | `#1e80ed` | `#1e80ed` | Borders, rings, progress fills, focus   |
| `--sl-color-accent-high` | `#1469c8` | `#7fb8f5` | Link text, current page, filled buttons |
| `--sl-color-accent-low`  | `#e7f2fc` | `#0d2e52` | Tinted backgrounds                      |
| `--sl-color-white`       | `#1a1f36` | `#f8f9fb` | Headings                                |
| `--sl-color-gray-2`      | `#2d3142` | `#ecedf2` | Body text                               |
| `--sl-color-gray-3`      | `#5f6878` | `#b1b8c5` | Secondary text                          |
| `--sl-color-gray-4`      | `#7f8898` | `#757d8c` | Control borders                         |
| `--sl-color-gray-5`      | `#e2e5eb` | `#353b4e` | Borders                                 |
| `--sl-color-gray-6`      | `#f0f2f5` | `#1d2230` | Code and hint backgrounds, dark sidebar |
| `--sl-color-gray-7`      | `#f8f9fb` | -         | Light sidebar                           |
| `--sl-color-black`       | `#ffffff` | `#0f1218` | Page background                         |

Three more tokens in `custom.css` set the page and its surfaces, as in the
learning platform:

| Token          | Light     | Dark      | Role                                                    |
| -------------- | --------- | --------- | ------------------------------------------------------- |
| `--at-page`    | `#f0f2f5` | `#0f1218` | The page behind the content                             |
| `--at-surface` | `#ffffff` | `#1d2230` | Checkpoints, lesson blocks, widgets, cards              |
| `--at-inset`   | `#f0f2f5` | `#2a2f40` | A block inside a surface, such as a hint or code sample |

In light mode the header and both side menus are white. In dark mode
both side menus are `#1d2230`. The theme toggle in the header uses the
link color, as the social icons next to it do.

`#1e80ed` on white has a contrast ratio of 3.9:1. That's enough for a
border or a ring (3:1) but below the 4.5:1 that text needs. Starlight's
light theme puts the plain accent on text and on fills that hold text. The
site points `--sl-color-text-accent` and `--sl-color-bg-accent` at
`#1469c8` (5.4:1) in light mode. In dark mode, `#7fb8f5` on `#0f1218` is
9.0:1. Text on an accent fill, such as the Check button, the due count and
the widget buttons on hover, uses `--sl-color-bg-accent` and
`--sl-color-text-invert` as a pair.

The status colors in `site/src/styles/lesson.css` change from green to the
learning platform's teal, `#36c5b0`, and warnings change to amber,
`#f5a623`. Dark mode uses both unchanged. On white, the teal is
2.2:1 and the amber 2.0:1, so light mode uses darker tones:

| Token              | Light     | Dark      | Role                           |
| ------------------ | --------- | --------- | ------------------------------ |
| `--at-done`        | `#239b89` | `#36c5b0` | Done fills, borders, and rings |
| `--at-done-text`   | `#1a7466` | `#36c5b0` | Done text                      |
| `--at-done-strong` | `#1a7466` | `#36c5b0` | A filled Done button           |
| `--at-on-done`     | `#ffffff` | `#0f1218` | Text on a Done button          |
| `--at-warn`        | `#9a5800` | `#f5a623` | Warning text and borders       |

### Type

Inter replaces both Merriweather fonts. Lesson text stays at Starlight's
16px because a lesson is long-form reading, even though the learning
platform sets its body text at 14px. Headings use weight 600 with a letter
spacing of -0.01em, as the platform does. Code keeps the system-first
monospace stack.

The font is self-hosted from the `@fontsource-variable/inter` package at an
exact version, in place of the Google Fonts link. A page load then doesn't
send a request to a third party. This matches the rule that the site has no
telemetry.

### Shapes

The radius tokens in `custom.css` set the corners: `--at-radius-lg`
(16px) for cards and panels, `--at-radius-md` (10px) for rows inside them,
`--at-radius-sm` (6px) for inputs and code, and `--at-radius-pill` for
buttons, badges, and progress tracks.

- Cards, checkpoint containers, lesson blocks, and widget panels use the
  16px radius and a 1px border in `--sl-color-gray-5`, without a shadow.
- Starlight's link cards drop their resting shadow and get a small one on
  hover. A linked card keeps its current lift.
- Buttons, badges (Starlight's and the due count) and progress tracks are
  fully rounded.

### Header and landing page

The header keeps the title "AI Training" and the GitHub link, on a white
background in light mode, and adds a link to `schubergphilis.github.io`. The landing page hero keeps its content and gets
the new accent and pill buttons.

### How it's checked

`site/e2e/contrast.spec.ts` loads one lesson page in each theme,
resolves the token pairs above, and asserts 4.5:1 for each text pair and
3:1 for the done fill and the accent border. That test fails a later palette change that
breaks readability.

## Implementation plan

Issue #599 builds this on one branch, `feat/599-visual-identity`,
in these commits:

1. Palette: replace the LSD Warm tokens in `custom.css`, and the green
   status colors in `lesson.css`, with the values above. Keep the white main
   pane rule.
2. Type: add `@fontsource-variable/inter` at an exact version, remove the
   Google Fonts links from `astro.config.mjs`, and drop the Merriweather
   body rule.
3. Shapes: radii, borders and pills in `custom.css`, `lesson.css` and the
   widget components that set their own colors or borders.
4. Contrast test in `site/e2e/`.
5. The link back to `schubergphilis.github.io`, and the narrower company
   name rule in `AGENTS.md`.

## Open questions

None. The maintainer took these decisions on 2026-09-30:

1. `AGENTS.md` said "No company names". The repository is now under the
   company's GitHub organization. The rule stays for lessons, course pages,
   and examples. The organization's name appears only in URLs and in a
   link back to `schubergphilis.github.io` in the header.
2. The header is white, as in the learning platform.
3. The font is Inter, as in the learning platform, because it is the font of
   the site that deep links to lessons and it reads well at body size.
4. The font is self-hosted, which adds one pinned dependency.

## Out of scope

- A back link to the learning platform. Its URL is internal.
- Embedding lessons in a frame inside the learning platform.
- Any change to lesson text.
