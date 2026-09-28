# VeriTrust AI — Maker & Judge Hallucination Guardrail

Hackathon project (GDG on Campus GRIET, 2-day build). Goal: a feature-rich, beautiful,
demo-ready prototype plus benchmark numbers. A reliable live demo beats an unfinished feature.

**Before any frontend work, read `docs/DESIGN.md`. Before starting a feature, read its entry in
`docs/FEATURES.md`.** Build features strictly in tier order (Tier 1 → 2 → 3 → 4).

## What we are building

A customer-support chatbot for a FICTIONAL airline, **Charminar Airways**, with a guardrail:

1. **Maker agent** drafts an answer from the company manuals (unstructured markdown).
2. **Judge agent** breaks the draft into atomic claims and checks each one against the
   **verified facts database** (SQLite, the source of truth).
3. A **deterministic rule layer** re-checks numbers the Judge marked as supported.
4. If a claim fails, the Maker rewrites with feedback (max retries from settings). If it still
   fails, the customer gets a safe hand-off message and the conversation goes to a human
   **review queue**.
5. Everything is logged, streamed live to an ops console, and measured on a dashboard.

Key story: the manuals are deliberately slightly OUT OF DATE versus the verified DB
(4 planted stale facts). That is how hallucinations and accuracy drift happen in real
companies, and the system must catch it.

## Tech stack (all free)

- Python 3.11, FastAPI, Uvicorn, Pydantic v2, pydantic-settings
- LangGraph for the agent workflow
- Google Gemini via the `google-genai` SDK (free tier, Flash-class model) for Maker and Judge
- Gemini embeddings + ChromaDB (local, persistent) for retrieval
- SQLite for facts, logs, settings, drift events
- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui (Radix) + lucide-react + motion
  (framer-motion) + Recharts + cmdk + sonner + `diff`
- Browser Web Speech API for voice in/out (free, Chrome)
- Optional: Ollama fallback (`LLM_PROVIDER=ollama`), Firebase Hosting + Firebase Auth

Model names are NOT hardcoded. Read them from env: `GEMINI_MODEL`, `GEMINI_EMBED_MODEL`.

## Repo layout

```
backend/
  app/
    main.py            # FastAPI app, CORS, routers
    config.py          # env settings
    llm.py             # generate_json(), embed(); retries, backoff on 429, disk cache, provider switch
    db.py              # SQLite helpers + schema
    retrieval.py       # Chroma collections: manual_chunks, facts
    events.py          # per-request asyncio queues for streaming node events
    pii.py             # redaction of phone, email, PNR-like codes before logging
    scoring.py         # trust score
    graph/
      state.py  nodes.py  build.py
    rules.py           # deterministic checks (numbers, currency, kg, hours/days, %)
    routers/           # chat, metrics, interactions, facts, drift, audit, redteam,
                       # review, settings, alerts, export, eval
  scripts/  seed.py  run_eval.py  demo_warmup.py
  tests/
data/
  manuals/*.md  facts.json  STALE.md
  eval/questions.jsonl
  redteam/attacks.json
frontend/
docs/  DESIGN.md  FEATURES.md
```

## Data model (SQLite)

- `facts`: id PK, category, subject, attribute, value, unit, statement (full sentence),
  updated_at. Categories: baggage, fees, refunds, cancellations, check_in, loyalty,
  special_assistance, pets.
- `interactions`: id, ts, channel ('console' | 'site' | 'redteam' | 'eval'), question
  (redacted), language, injected BOOL, attack_id NULL, input_flags JSON, drafts JSON,
  final_answer, status ('approved' | 'corrected' | 'escalated'), claims JSON, trust_score,
  retries, timings JSON (per node ms), review_status ('none' | 'pending' | 'resolved'),
  reviewer_text.
- `drift_events`: id, ts, fact_id, old_value, new_value, source ('edit' | 'review').
- `manual_audits`: id, ts, findings JSON.
- `settings`: key, value. Keys: strictness ('strict' | 'balanced' | 'lenient'), max_retries,
  high_risk_categories JSON, alert_threshold_pct, alert_window_min.
- `eval_runs`: id, ts, mode, metrics JSON, per_question JSON.

## LangGraph workflow

State: request_id, question, channel, inject_hallucination, attack_id, input_flags, language,
manual_context, facts_context, draft, drafts[], claims[], retries, status, final_answer,
trust_score, timings.

Every node emits `{node, phase: start|end, ms, payload}` to `events.py` for streaming.

1. `guard_input` — no LLM. Heuristic prompt-injection / pressure detection ("ignore your
   rules", "promise me", "you must refund"). Sets input_flags; flagged requests run in strict
   mode regardless of settings.
2. `retrieve_manual` — top-k manual chunks.
3. `maker` — structured output `{language, answer}`. Answer ONLY from manual_context, in the
   customer's language (English, Hindi, Telugu). If `inject_hallucination`, include exactly one
   plausible but false specific detail. If `retries > 0`, apply Judge feedback.
4. `judge` — ONE structured call. Input: draft + facts retrieved using question and draft.
   Output `claims: [{text, text_en, category, verdict: supported|contradicted|unsupported,
   evidence_fact_ids[], correction, span_start, span_end}]`. Spans index into the draft so the
   UI can highlight claims inline. Pleasantries are not claims.
5. `rule_check` — for each supported claim, compare extracted numbers/units with cited facts.
   Mismatch → contradicted, with `caught_by: "rules"` (else `caught_by: "judge"`).
6. `decide` — applies strictness policy: strict blocks contradicted + unsupported; balanced
   blocks contradicted, and unsupported in high-risk categories; lenient blocks contradicted
   only. Pass → approved (or corrected if retries > 0). Fail and retries < max → `rewrite`
   (loop to maker). Else → `fallback`.
7. `fallback` — safe hand-off message in the customer's language; status escalated;
   review_status pending.

Trust score (`scoring.py`, deterministic): start 100; −40 per contradicted, −15 per
unsupported, −10 per retry; clamp 0–100; escalated = 0. Redact PII before logging.

## API (all under /api)

- `POST /chat` → full result. `POST /chat/stream` → text/event-stream of node events then the
  final result (frontend reads it with fetch + ReadableStream).
- `GET /metrics`, `GET /interactions`, `GET /interactions/{id}`, `GET /interactions/{id}/report`
- `GET /facts`, `PATCH /facts/{id}` (re-embeds + writes drift_event), `GET /drift/events`
- `POST /audit/manuals`, `GET /audit/latest`
- `GET /redteam/attacks`, `POST /redteam/run` (streams results)
- `GET /review`, `POST /review/{id}` {action: approve|edit, text, save_as_fact?: {...}}
- `GET /settings`, `PUT /settings`
- `GET /alerts`
- `GET /export/interactions.csv`, `GET /export/interactions.json`
- `POST /eval/run`, `GET /eval/latest`
- `GET /health` (also reports LLM provider and whether the rate limit was hit recently)

## Conventions

- Keep the app runnable end-to-end after every phase. The user commits after each phase.
- Type hints everywhere, small functions, Pydantic models for all LLM I/O.
- All LLM calls go through `app/llm.py`. Cache by prompt hash. On 429, back off and surface a
  clear status to the UI; never crash.
- Budget LLM calls: normal chat = 2 calls (Maker + Judge) + 2 per retry. Batch features
  (red team, audit, eval) must be throttled by `LLM_RPM` and show progress.
- Secrets only in `.env` (gitignored). Provide `.env.example`.
- pytest tests for rules.py, scoring.py, pii.py, decide policy logic.
- Do NOT add: Docker, microservices, extra databases, backend auth.
- When unsure about a library's current API, check the installed version/docs; don't guess.

## Commands

- Backend: `cd backend && uvicorn app.main:app --reload --port 8000`
- Seed: `cd backend && python scripts/seed.py`
- Warm demo cache: `cd backend && python scripts/demo_warmup.py`
- Eval: `cd backend && python scripts/run_eval.py --mode all`
- Tests: `cd backend && pytest -q`
- Frontend: `cd frontend && npm run dev`

## Demo script (must work flawlessly, in this order)

1. Customer site: ask the baggage question in the chat widget → answer appears.
2. Ops console: same request, verification trace animates, claims highlighted green.
3. Press `I` (inject), ask about refunds → red claim, holding-pattern loop, corrected answer,
   diff view.
4. Stale-trap question → manual says old fee, DB catches it.
5. Knowledge Base: change a fee live → ask again → old value blocked; drift timeline updates.
6. Ask in Telugu by voice → answer in Telugu, claims verified against English facts.
7. Red Team Lab: run 10 attacks → live scoreboard.
8. Review queue: resolve an escalated case, save as fact.
9. Dashboard + Evaluation: before/after numbers.
