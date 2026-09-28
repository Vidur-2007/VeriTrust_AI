# Feature catalogue

Build in tier order. A tier is "done" only when every feature in it works in the browser.
If Tier 2 isn't done by Day 2 noon, skip Tier 3 and 4 and polish instead.

## Tier 1 — Core (Day 1)

**1. Guardrail loop.** Maker → Judge → Rules → Decide → Rewrite/Fallback, as in CLAUDE.md.
Done when: injected hallucinations are usually caught and corrected; clean answers pass.

**2. Interaction logging + metrics.** Every request logged with timings, claims, trust score.
Done when: `/api/metrics` returns rates, avg/p95 latency and a per-minute timeseries.

**3. Knowledge base API.** List and edit verified facts; edits re-embed the fact.

**4. App shell.** Design tokens, left rail navigation, top bar, theme switch (dark default),
styleguide page at `/styleguide` showing every token and component.

## Tier 2 — Showstoppers (Day 2 morning)

**5. Live verification trace (signature element).** Streams node events; the request travels
along a route through Retrieve, Maker, Judge, Rules, Decision. A rejected draft draws a
holding-pattern loop back to Maker labelled with the retry number. Per-node ms shown under
each node. See DESIGN.md.

**6. Inline claim highlighting.** Claims are underlined inside the answer text (style differs
by verdict, not only colour). Hover or keyboard focus opens a popover: verdict, evidence fact
statement, fact ID, manual section, and whether the Judge or the rule layer caught it.

**7. Draft vs final diff.** Tabs for each draft; word-level diff between the first draft and
the final answer (removed text struck through, added text marked).

**8. Trust score.** 0–100 gauge per answer, with the breakdown on hover.

**9. Red Team Lab.** Attack library in `data/redteam/attacks.json`, ~20 attacks across types:
fake fee, wrong deadline, invented policy, prompt injection, emotional pressure, off-topic,
competitor comparison. Select attacks, run them (throttled), watch a live scoreboard: caught,
corrected, escaped, per attack type.

**10. Drift monitor.** Fact edits create drift events shown on a timeline. The Knowledge Base
table marks recently changed facts.

**11. Manual audit.** One button scans manuals against verified facts and lists stale
sections with the verified value and a proposed corrected paragraph. Should find all 4
planted stale facts.

**12. Multilingual.** Customer can write in English, Hindi or Telugu; answer comes back in the
same language; claims show an English translation in the verdict panel.

**13. Voice.** Mic button (Web Speech API, language selectable) and read-aloud of the answer.
Hide gracefully when the browser doesn't support it.

**14. Evaluation page.** Baseline vs guarded hallucination rate, catch rate, false-block
rate, correction success, latency cost, per-category breakdown.

## Tier 3 — Operations polish (Day 2 afternoon)

**15. Human review queue.** Escalated conversations with full trace. Reviewer can approve or
edit the reply, and optionally save the correction as a new verified fact (creates a drift
event). Badge count in the nav.

**16. Guardrail settings.** Strictness, max retries, high-risk categories, alert threshold.
Changes apply to the next request; show the active strictness in the top bar.

**17. Alerts.** If the blocked rate in the rolling window exceeds the threshold, show a banner
and toast with a link to the recent failing interactions.

**18. Latency waterfall.** Per-request horizontal bars per node, in the interaction detail.

**19. Audit export.** CSV/JSON export of interactions, and a printable per-conversation audit
report page (question, drafts, claims, evidence, decision, timings).

**20. PII redaction.** Phone numbers, emails and PNR-like codes masked in logs; show a
"redacted" marker in the UI.

**21. Customer demo site.** `/site`: a Charminar Airways landing page with a floating chat
widget using the same API (channel 'site'). Customers never see verdicts, only the final
answer. Used to open the demo.

**22. Command palette + shortcuts.** Ctrl/Cmd+K: navigate, toggle injection, run red team,
switch theme. `I` toggles injection on the console. Shortcut list in the palette.

## Tier 4 — Stretch (only if ahead of schedule)

**23. Firebase Auth** (Google sign-in) gating the ops pages; customer site stays public.

**24. Firebase Hosting** deploy of the built frontend.

**25. Domain packs.** Switchable knowledge base (airline, bank, telecom) to prove the guardrail
is domain-agnostic.

**26. Model comparison.** Run the eval with Gemini vs Ollama as Maker and compare.
