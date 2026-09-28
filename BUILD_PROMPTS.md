# VeriTrust AI — Build Prompts for Claude Code

Paste one phase at a time. After each phase: test it yourself, `git commit`, then `/clear`
(CLAUDE.md is re-read automatically). Use plan mode (Shift+Tab) for big phases.

**UI tip:** Claude Code can't see your browser. Take a screenshot of each page and paste it
into Claude Code with: "Critique this against docs/DESIGN.md and fix the top 5 issues."
Do this 2–3 times per page. This is the single biggest UI quality boost.

## Timeline

| When | Phases | Checkpoint |
|---|---|---|
| Day 1 morning | 0–1 | Data seeded, backend runs |
| Day 1 afternoon | 2 | Guardrail loop works from CLI |
| Day 1 night | 3–4 | All APIs + design system + app shell |
| Day 2 morning | 5–6 | **Minimum winning demo exists** |
| Day 2 midday | 7–8 | Red team, eval numbers |
| Day 2 afternoon | 9 | Tier 3 features |
| Day 2, 6 PM | — | **Feature freeze.** Bugs, video, slides, rehearsal |

## Phase 0 — Setup (you, 15 min)

1. Free Gemini API key at https://aistudio.google.com. Note the current Flash model and
   embedding model names for `.env`.
2. Project folder, `git init`, copy `CLAUDE.md` and the `docs/` folder into it.
3. Run `claude` in the folder.

## Phase 1 — Skeleton + data

```
Read CLAUDE.md. Set up the backend skeleton as described: config, llm.py (google-genai,
structured JSON output, retries with backoff on 429, disk cache, Ollama fallback), db.py with
the full schema, events.py, pii.py, and /api/health.
Create the Charminar Airways data: data/facts.json (~60 verified facts, realistic INR values),
data/manuals/ (5–6 realistic support manuals, consistent with facts EXCEPT 4 planted stale
facts, listed in data/STALE.md), data/redteam/attacks.json (~20 attacks across the types in
docs/FEATURES.md #9). Write scripts/seed.py, .env.example, requirements.txt. Run seed.py.
```

## Phase 2 — The guardrail graph

```
Implement the LangGraph workflow in CLAUDE.md: guard_input, retrieve_manual, maker
(multilingual, inject mode, rewrite with feedback), judge (single structured call with claim
spans), rule_check, decide (strictness policy from settings), fallback. Emit node events,
compute trust score, redact PII, log everything. Expose POST /api/chat and POST /api/chat/stream.
Write pytest tests for rules, scoring, pii and decide. Then write a CLI script that sends
6 questions (2 injected, 1 stale trap, 1 Telugu, 1 prompt injection, 1 normal) and prints
status, claims, trust score and timings. Run it.
```

Check: injected errors usually caught. If the Judge is too strict or lenient, ask Claude Code
to tune the Judge prompt with concrete examples from the CLI output.

## Phase 3 — Complete API

```
Implement every remaining endpoint in CLAUDE.md: metrics, interactions (+ report), facts with
drift events, manual audit, red team run (streaming, throttled), review queue (with
save_as_fact), settings, alerts, exports, eval. Test each with curl and show me the output.
```

## Phase 4 — Design system + shell

```
Read docs/DESIGN.md fully. Set up the frontend (Vite + React + TS + Tailwind + shadcn/ui +
lucide-react + motion + Recharts + cmdk + sonner). Implement the colour tokens for dark and
light themes, Barlow and Barlow Condensed from Google Fonts, the type scale, the app shell
(left rail, top bar with strictness chip, inject toggle, alerts, theme switch, Ctrl+K
palette), routing for all pages, and a /styleguide page showing every token and component.
Before coding, write a short design plan and check it against DESIGN.md.
```

Check: screenshot `/styleguide` and the shell, run the critique loop.

## Phase 5 — Live Console (the hero)

```
Build the Live Console per DESIGN.md and FEATURES.md #5–8, #12, #13: the animated
verification trace driven by /api/chat/stream (holding-pattern loop on retries, reduced-motion
support), customer conversation with inline claim highlighting and accessible popovers,
verdict panel with trust score gauge, claim list, drafts tabs with word-level diff, language
selector, mic input and read-aloud. Include empty, loading and error states (including a
visible rate-limit state).
```

Check: run demo steps 2, 3, 4 and 6 from CLAUDE.md. Critique loop on screenshots.
**After this phase you have a winning core demo. Commit and tag it: `git tag demo-safe`.**

## Phase 6 — Dashboard, Knowledge Base, drift, audit

```
Build the Dashboard (KPI status strip, approved vs blocked over time, latency by node,
catch rate, recent interactions with detail drawer including latency waterfall), the
Knowledge Base (editable facts table, recently changed markers, drift timeline) and the
Manual Audit view (FEATURES.md #10, #11, #18). Follow DESIGN.md.
```

## Phase 7 — Red Team Lab

```
Build the Red Team Lab (FEATURES.md #9): attack library grouped by type with multi-select,
run button, live progress, scoreboard (caught / corrected / escaped per type), and each result
linking to its interaction detail.
```

## Phase 8 — Evaluation

```
Create data/eval/questions.jsonl with 80 questions (35 answerable, 15 stale_trap,
20 adversarial, 10 out_of_scope) with gold_fact_ids. Implement scripts/run_eval.py with all
four modes in CLAUDE.md, throttled and cached, saving to eval_runs and eval_results.json.
Build the Evaluation page (FEATURES.md #14). Run the eval and give me a summary table for
the slides.
```

Start the eval run early and let it work while you build Phase 9. Hand-check ~15 graded
answers so you can say the grading was verified.

## Phase 9 — Tier 3 features

Do these one prompt at a time, in this order, and stop at freeze time:

1. `Build the customer demo site at /site (FEATURES.md #21).`
2. `Build the human review queue (FEATURES.md #15).`
3. `Build guardrail settings and alerts (FEATURES.md #16, #17).`
4. `Build audit export and the printable report (FEATURES.md #19, #20).`
5. `Finish the command palette and shortcuts (FEATURES.md #22).`
6. `Write scripts/demo_warmup.py to pre-cache the 9 demo-script requests, and a README with
   setup, a Mermaid architecture diagram and eval results.`

Tier 4 (Firebase Auth/Hosting, domain packs, model comparison) only if all of the above is
done before 4 PM on Day 2.

## Before the event

- Run `demo_warmup.py` so the live demo runs from cache and can't hit rate limits.
- Record a full backup demo video.
- Test on the actual projector resolution if you can (1366×768, 125% zoom).
- Rehearse the demo script twice, timed.

## Team split

- Person 1: drives Claude Code, tests every phase.
- Person 2: reviews generated data for realism, writes extra attacks and eval questions,
  hand-checks grading, tests Telugu/Hindi.
- Person 3: slides, architecture diagram, demo video, pitch.
- Person 4 (if any): QA on every page, screenshots for the critique loop, plays "customer".
