# Design direction

**Subject:** an airline's AI support guardrail. **Audience:** support operations and compliance
leads (and hackathon judges watching on a projector). **Primary job:** show at a glance whether
the AI is telling customers the truth, and exactly why.

**Concept: a flight deck for trust.** Borrow from aviation instruments and airport signage:
calm, dark, highly legible, with colour reserved for meaning. Nothing decorative that
doesn't carry information.

## Colour tokens (CSS variables, Tailwind reads them)

Dark theme (default):

| Token | Hex | Use |
|---|---|---|
| `--bg` Night apron | `#0F1B2E` | page background |
| `--surface` Panel | `#16263F` | panels |
| `--surface-2` | `#1E3150` | raised areas, hover |
| `--line` | `#2A3F60` | borders, dividers, route line |
| `--text` | `#E6EDF7` | primary text |
| `--text-muted` | `#93A4BF` | secondary text |
| `--accent` Beacon blue | `#6EA8FE` | interactive elements, focus ring, the travelling request |
| `--ok` Runway green | `#34C38F` | supported / approved |
| `--caution` Cockpit amber | `#F5A524` | unsupported / corrected |
| `--stop` Stop-bar red | `#EF4B4B` | contradicted / escalated |

Light theme: `--bg #F2F5F9`, `--surface #FFFFFF`, `--surface-2 #E8EEF5`, `--line #CCD6E3`,
`--text #13233A`, `--text-muted #56677F`; status colours darkened ~15% for contrast.

Status colours are only for status. Never use them as decoration.

## Typography

- **Barlow Condensed** (600, 700): page titles, metric numbers, trust score, node labels in
  the trace. Its signage heritage fits the airport theme.
- **Barlow** (400, 500, 600): all body and UI text.
- Numbers use `font-variant-numeric: tabular-nums`. No monospace for labels.
- Scale (1.25): 12 / 14 / 16 / 20 / 25 / 31 / 39 px. Minimum 14px anywhere (projector).
- Sentence case everywhere. No all-caps labels, no eyebrow labels above headings, no single
  highlighted word in headings.

## Layout

```
┌──────┬───────────────────────────────────────────────────────────┐
│ rail │ top bar: page title · strictness chip · inject toggle ·   │
│ nav  │          alerts · theme · Ctrl+K                          │
│      ├───────────────────────────────────────────────────────────┤
│      │ VERIFICATION TRACE (full width, the hero of the console)  │
│      │  Retrieve ─── Maker ─── Judge ─── Rules ─── Decision       │
│      │               ╰──── holding pattern · retry 1 ────╯        │
│      ├─────────────────────────────┬─────────────────────────────┤
│      │ Customer conversation       │ Verdict                     │
│      │  bubbles, inline claim      │  trust score, claim list,   │
│      │  highlights, mic, language  │  evidence, drafts/diff tabs │
│      │  composer at bottom         │  waterfall                  │
└──────┴─────────────────────────────┴─────────────────────────────┘
```

Left-aligned text throughout. Rail: icon + label, active item marked by an accent bar.
Dashboard: a single status strip of KPIs separated by vertical rules (not a grid of identical
cards), then charts at different sizes according to importance, then the recent table.

Radii by hierarchy: 12px panels, 8px controls, full for status pills. Depth comes from surface
steps and borders, not drop shadows.

## Signature element: the verification trace

Spend all the boldness here; keep everything else quiet.

- Five nodes on a horizontal route line (SVG). Idle nodes are outlined in `--line`.
- As SSE events arrive, a small beacon (accent dot with a soft trail) travels between nodes;
  the active node glows; finished nodes show their ms below.
- Judge rejection: the path draws an arc back to Maker (the holding pattern), labelled
  "Retry 1". Multiple retries stack arcs.
- Final node lands with the status in Barlow Condensed: Approved, Corrected, or Escalated.
- This is the only non-user-triggered animation in the app. With
  `prefers-reduced-motion`, update states instantly with no travel.

## Claim highlighting

Not colour alone:
- Supported: solid green underline + check icon in popover.
- Unsupported: dashed amber underline + question icon.
- Contradicted: wavy red underline + cross icon.
Popovers open on hover and keyboard focus. Evidence shows the fact statement and fact ID.

## Components

shadcn/ui (Radix) for dialog, popover, tabs, tooltip, switch, select, table, toast (sonner),
command (cmdk). lucide-react icons. Recharts styled with tokens (no default colours, gridlines
in `--line`, tooltips on `--surface-2`).

Every page needs designed empty, loading (skeletons, not spinners) and error states.

## Copy

Plain verbs, sentence case, active voice. Buttons say what happens: "Send", "Run attacks",
"Save fact", "Approve reply", "Scan manuals". Toasts reuse the same verb ("Fact saved").
Errors say what happened and what to do: "Gemini rate limit reached. Retrying in 20 s."
Empty states invite an action: "No escalations yet. Try the Red Team Lab to generate some."

## Quality floor

- Test at 1366×768 and at 125% zoom: projector conditions.
- WCAG AA contrast, visible focus rings (accent, 2px), full keyboard navigation.
- Responsive down to tablet; the customer site also works on mobile.
- Before calling a page done: remove one decorative element.
