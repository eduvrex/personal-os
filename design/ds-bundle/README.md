# Personal OS — Watercolor Edition · design bundle

Self-contained HTML previews of the live site's design system
(the deployed app). Every card shows **night**
(left) and **day** (right) side by side. All values are the real tokens
from `src/app/globals.css` — edit freely; the hex codes are printed on the
color card so changes can be mapped straight back to code.

## Cards

| File | What it shows |
|---|---|
| `colors.html` | Full token palettes, both themes, with hex values |
| `type.html` | Type system — Fraunces display serif, Inter UI, IBM Plex Mono data (previews use fallback stacks: Didot/Georgia, system-ui, Menlo) |
| `panel.html` | The Panel card — hairline border, top highlight, mono section label |
| `buttons.html` | Primary / ghost buttons, ⌘K pill, tags |
| `data-viz.html` | Progress bar, habit heat ramp, progress ring |
| `page-opener.html` | The editorial page opener — folio, serif headline, ghost watermark, rule |
| `atmosphere.html` | The glow fields — indigo/rose bleed (night), pigment bands (day) |

## Token cheat-sheet (night → day)

- ink-0 base `#0F2A1E` → `#F4EFE4` · ink-1 panel `#153123` → `#FAF6EC`
- ink-4 text `#F1ECDB` → `#2B2E66` · ink-3 muted `#A2B8A7` → `#6B6D9E`
- ember (rose accent) `#E989B7` → `#CE3D86` · ember-deep `#B3548C` → `#99306B`
- sage (green ↔ peri) `#8FBFA3` → `#7D82CF` · sun `#E3C86B` → `#C9A02E`
- sky `#5BC4B4` → `#2E9FB4` · iris `#5A63D8` → `#3A41B8`

When you're done editing, bring the changed files (or just the new hex
values / screenshots) back to the coding session and they'll be applied to
`globals.css` and the components, then redeployed.
