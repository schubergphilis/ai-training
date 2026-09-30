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

This spec follows the learning platform for layout, type, and shapes. Most
learners come from there, its design is meant for long study sessions, and
it uses only free fonts and plain color values. The colors come from an
open source scheme instead of the brand: the GNOME desktop's Adwaita
scheme, as libadwaita 1.10 defines it in its
[CSS variables](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.10/css-variables.html).
Its blue is close to the brand blue. The sites look related, and a
screenshot of a lesson fits next to the organization's own material. The
site takes the color values from that page and credits it here. It
doesn't copy the page's text or its style sheets.

## Design

### What the site takes and what it leaves out

| Part                          | Decision                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| SBP Blue `#1E80ED`            | Left out as a value. The accent is GNOME Adwaita's blue, `#3584e4`: hue 213° against the brand's 212°, from an open source desktop. |
| Other colors                  | Taken from Adwaita: its greys, window, card and sidebar colors, and its success and warning colors.                                 |
| Inter (SIL Open Font License) | Taken for the interface and for the lesson body.                                                                                    |
| Radii, borders, pills         | Taken: 16px cards, pill badges and buttons, borders instead of shadows.                                                             |
| Company logo and wordmark     | Left out. It is a trademark and can't be licensed as CC BY-SA. The site uses its current favicon and title.                         |
| TT Interphases                | Left out. It is a licensed font.                                                                                                    |
| Brand guide text and images   | Left out. The brand guide sources are private.                                                                                      |
| Blue header bar               | Left out. The learning platform uses a white header, and a lesson opened from it should look like it.                               |

### Palette

The site keeps Starlight's token model (`site/src/styles/custom.css`): an
accent ramp, a gray ramp and black and white, per theme. Each value is an
Adwaita variable or palette color, or is derived from one. Adwaita gives
some colors as a translucent black or white. The site composites those
onto the color behind them, so every token is opaque.

| Token                    | Light     | Dark      | Role                                    | Adwaita source                                     |
| ------------------------ | --------- | --------- | --------------------------------------- | -------------------------------------------------- |
| `--sl-color-accent`      | `#3584e4` | `#3584e4` | Borders, rings, progress fills, focus   | Blue accent background                             |
| `--sl-color-accent-high` | `#0461be` | `#81d0ff` | Link text, current page, filled buttons | Blue standalone accent                             |
| `--sl-color-accent-low`  | `#e9f2fc` | `#273a55` | Tints, and block and sort zone headers  | The accent mixed into white and into the window    |
| `--sl-color-white`       | `#242428` | `#ffffff` | Headings                                | Window foreground (light: a step darker than body) |
| `--sl-color-gray-2`      | `#333338` | `#f6f5f4` | Body text                               | Window foreground on white; palette light 2        |
| `--sl-color-gray-3`      | `#5e5c64` | `#c0bfbc` | Secondary text                          | Palette dark 2 and light 4                         |
| `--sl-color-gray-4`      | `#77767b` | `#9a9996` | Control borders                         | Palette dark 1 and light 5                         |
| `--sl-color-gray-5`      | `#e0e0e1` | `#434346` | Borders                                 | The foreground at the border opacity, 15%          |
| `--sl-color-gray-6`      | `#ebebed` | `#2e2e32` | Light code background, dark header      | Sidebar background                                 |
| `--sl-color-black`       | `#ffffff` | `#1d1d20` | Inputs and map nodes                    | View background                                    |

Four more tokens set the page, its cards and the right-hand menu, in
Adwaita's roles:

| Token            | Light     | Dark      | Role                                                  | Adwaita source                  |
| ---------------- | --------- | --------- | ----------------------------------------------------- | ------------------------------- |
| `--at-page`      | `#fafafb` | `#222226` | The page behind the content                           | Window background               |
| `--at-surface`   | `#ffffff` | `#343437` | Checkpoints, lesson blocks, widgets, cards            | Card background                 |
| `--at-inset`     | `#f3f3f5` | `#45454a` | A hint or a code sample inside a checkpoint or widget | Secondary sidebar; white at 16% |
| `--at-sidebar-2` | `#f3f3f5` | `#28282c` | The right-hand menu                                   | Secondary sidebar background    |

The header uses the header bar background (white, and `#2e2e32` in dark
mode). The left-hand menu uses the sidebar background (`#ebebed`, and
`#2e2e32` in dark mode). The theme toggle in the header uses the link
color, as the social icons next to it do.

The site replaces three of Adwaita's colors with Adwaita palette colors. Adwaita dims secondary text by
opacity, and at 55% it is below 4.5:1, so secondary text uses palette dark
2 and light 4. The dark control border uses light 5, because palette dark
1 is below 3:1 on a dark card.

The blue accent background on white has a contrast ratio of 3.8:1. That's
enough for a border or a ring (3:1) but below the 4.5:1 that text needs.
Starlight's light theme puts the plain accent on text and on fills that
hold text. The site points `--sl-color-text-accent` and
`--sl-color-bg-accent` at the standalone accent in light mode, which is
6.1:1 on white. Text on an accent fill, such as the Check button, the due
count and the widget buttons on hover, uses `--sl-color-bg-accent` and
`--sl-color-text-invert` as a pair.

The status colors in `site/src/styles/lesson.css` are Adwaita's success
and warning colors. A fill uses the background tone and text uses the
standalone tone. The light success background is 2.3:1 on white, so fills
use the dark success background in both themes, and a filled Done button
uses the standalone tone:

| Token              | Light     | Dark      | Role                           | Adwaita source                  |
| ------------------ | --------- | --------- | ------------------------------ | ------------------------------- |
| `--at-done`        | `#26a269` | `#26a269` | Done fills, borders, and rings | Dark success background         |
| `--at-done-text`   | `#007c3d` | `#78e9ab` | Done text                      | Success standalone              |
| `--at-done-strong` | `#007c3d` | `#78e9ab` | A filled Done button           | Success standalone              |
| `--at-on-done`     | `#ffffff` | `#1d1d20` | Text on a Done button          | Success foreground; view (dark) |
| `--at-warn`        | `#905400` | `#ffc252` | Warning text and borders       | Warning standalone              |

Adwaita's document font, Adwaita Sans, is based on Inter. The type below
matches it too.

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
- Starlight's link cards and the previous and next links at the foot of
  a page are white in light mode, drop their resting shadow, and get a
  small one on hover. A linked card keeps its current lift.
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
