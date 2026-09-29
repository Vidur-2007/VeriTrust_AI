# Design direction

**Subject:** an airline's AI support guardrail. **Audience:** support operations and compliance
leads (and hackathon judges watching on a projector). **Primary job:** show at a glance whether
the AI is telling customers the truth, and exactly why.

**Concept: a flight deck for trust.** Borrow from aviation instruments and airport signage:
calm, dark, highly legible, with colour reserved for meaning. Nothing decorative that
doesn't carry information.

## Colour tokens (CSS variables, Tailwind reads them)

The palette follows GitHub's colours (Primer "dark default" and "light default"): near-black
chrome, flat bordered cards, neutral greys, and GitHub's blue, green, amber and red.

Dark theme (default):

| Token | Hex | Use |
|---|---|---|
| `--bg` Canvas | `#010409` | page background, top bar, nav rail |
| `--surface` Panel | `#0D1117` | panels and cards |
| `--surface-2` | `#151B23` | raised areas, hover, inner blocks |
| `--line` | `#3D444D` | borders, dividers, route line |
| `--text` | `#F0F6FC` | primary text |
| `--text-muted` | `#9198A1` | secondary text |
| `--accent` Blue | `#4493F8` | interactive elements, focus ring, the travelling request |
| `--ok` Green | `#3FB950` | supported / approved |
| `--caution` Amber | `#D29922` | unsupported / corrected |
| `--stop` Red | `#F85149` | contradicted / escalated |

Light theme: `--bg #F6F8FA`, `--surface #FFFFFF`, `--surface-2 #EFF2F5`, `--line #D1D9E0`,
`--text #1F2328`, `--text-muted #59636E`, `--accent #0860C9`, `--ok #177232`,
`--caution #8A5C00`, `--stop #C21F2A`.

Status colours are only for status. Never use them as decoration.

> Implementation note (WCAG AA): every text colour passes 4.5:1 on every surface, including
> hover areas and tinted status pills. GitHub's dark colours pass as they are; in the light
> theme GitHub's green, amber, red and blue are darkened slightly to pass. `/styleguide` shows
> the live ratio for every pair.

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
│ rail │ top bar: page title · strictness chip · [running locally]│
│ nav  │          · inject toggle · alerts · theme · Ctrl+K        │
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

This is the hero moment of the demo: it gets the richest animation in the app.

- Five nodes on a horizontal route line (SVG). Idle nodes are outlined in `--line`.
- As SSE events arrive, a small beacon (accent dot with a soft trail) travels between nodes;
  the active node glows; finished nodes show their ms below.
- Judge rejection: the path draws an arc back to Maker (the holding pattern), labelled
  "Retry 1". Multiple retries stack arcs.
- Final node lands with the status in Barlow Condensed: Approved, Corrected, or Escalated.
- Build the connections with Magic UI's Animated Beam (beam colour `--accent`; the retry loop
  is a curved beam back to Maker in `--caution`).
- With `prefers-reduced-motion`, update states instantly with no travel.

## Motion and animated components (eye-catching, but purposeful)

The UI should feel alive and impressive on a projector. Libraries (all free, copy-paste,
shadcn-compatible, built on the free `motion` core): **Magic UI**, **Motion Primitives**,
**Animate UI**. Only use their free components. Do NOT use Motion+ / Motion UI (paid).
Read each library's current docs for install commands; restyle every component with our
tokens (no default purple/pink gradients).

Where animation goes:
- Verification trace: Animated Beam between nodes; Border Beam around the verdict panel while
  a request is in flight; Text Shimmer for "Checking claims…".
- Numbers (KPIs, trust score, scoreboard): animated number tickers that count on change.
- Claims, red-team results, review queue items: animated list, items slide in as they arrive.
- Tabs, segmented controls, nav rail: sliding active indicator (layout animation).
- Page changes: quick cross-fade via `AnimatePresence` (≤200 ms).
- Primary buttons only (Send, Run attacks, Scan manuals): shimmer or glow on hover.
- Console background: very subtle dot or grid pattern at low opacity.
- Customer site `/site`: this is where to go loudest: animated hero (particles or meteors
  in brand colours), blur-fade headline, marquee of destinations, animated chat widget open.

Limits: animation must never hide data or delay reading it (≤300 ms for UI transitions);
no more than one ambient background effect per page; cap particle counts for laptop GPUs;
everything respects `prefers-reduced-motion`.

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
