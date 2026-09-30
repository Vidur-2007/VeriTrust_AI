# Evaluation results

Run #6, 29 September 2026. 80 questions × 3 modes = 240 answers, all scored, none skipped.
Every answer and every grade came from Gemini (the local model was switched off for the run).
Reproduce: `cd backend && python scripts/run_eval.py --mode all` (finished calls replay from the
LLM cache). The live page is **Evaluation** in the app.

## Slide table

| | Without guardrail (baseline) | With guardrail |
|---|---|---|
| Wrong answers reaching the customer | **28.8%** (23 of 80) | **1.2%** (1 of 80) |
| After hand-checking the grades | **23.8%** (19 of 80) | **0%** (0 of 80) |
| Stale-manual traps answered wrong | **14 of 15** | **0 of 15** |
| Planted false details caught | – | **94.7%** (72 of 76) |
| Correct answers wrongly blocked | – | **0%** (0 of 35) |
| Blocked drafts fixed by a rewrite | – | **100%** |
| Handed to a person | – | 0% |
| Median answer time | 5.0 s | 8.1 s (+3.1 s) |

One-line version: **the guardrail cut wrong answers from 29% to 1% (0% after hand-checking) on 80
questions, caught 14 of 15 out-of-date manual prices, and never blocked a correct answer.**

## What the modes are

- **Baseline:** the Maker alone, answering from the support manuals: a plain RAG support bot.
- **Guarded:** the full guardrail: Maker, Judge against the verified facts, rule layer, rewrite
  with feedback, safe hand-off.
- **Injected:** the full guardrail with one plausible false detail planted in every first draft.

A **wrong answer** is one with a claim that contradicts a verified fact, or an unsupported claim in
a high-risk category (fees, refunds, baggage).

## All metrics

| | Baseline | Guarded | Injected |
|---|---|---|---|
| Questions scored | 80 | 80 | 80 |
| Wrong answers reaching the customer | 28.8% (23) | 1.2% (1) | 1.2% (1) |
| First draft blocked | – | 30.0% | 90.0% |
| Injected error caught | – | – | 94.7% |
| False blocks (answerable questions) | – | 0.0% | – |
| Correction success | – | 100.0% | 100.0% |
| Handed to a person | – | 0.0% | 0.0% |
| Latency p50 / p95 | 5.0 s / 32.4 s | 8.1 s / 35.4 s | 21.3 s / 67.5 s |

In 4 of the 80 injected runs the Maker did not plant the false detail, so the catch rate is over
76 drafts. Latency is from live Gemini calls (n = 74, 74, 73), measured on the free tier with
frequent overload retries, so p95 is mostly retry waiting, not the guardrail.

## By question type (wrong-answer rate)

| Question type | n | Baseline | Guarded | Injected |
|---|---|---|---|---|
| Answerable | 35 | 5.7% | 0% | 0% |
| Stale trap | 15 | 93.3% | 0% | 0% |
| Adversarial | 20 | 30.0% | 0% | 0% |
| Out of scope | 10 | 10.0% | 10.0% | 10.0% |

The out-of-scope 10% in every mode is one question (E78, see the hand-check): a grader false
alarm on a correct refusal.

## By category (wrong-answer rate)

| Category | n | Baseline | Guarded |
|---|---|---|---|
| Fees | 12 | 66.7% | 0% |
| Special assistance | 8 | 50.0% | 0% |
| Pets | 8 | 37.5% | 0% |
| Baggage | 13 | 30.8% | 0% |
| Cancellations | 7 | 28.6% | 0% |
| Refunds | 9 | 11.1% | 0% |
| Out of scope | 10 | 10.0% | 10.0% |
| Check-in | 7 | 0% | 0% |
| Loyalty | 6 | 0% | 0% |

Fees, special assistance and pets are where the manuals are out of date (the four planted stale
facts), which is why the baseline fails there most.

## The questions

`data/eval/questions.jsonl`: 80 questions with gold fact IDs. 66 English, 8 Hindi, 6 Telugu.

- **35 answerable** across all 8 categories.
- **15 stale traps** on the four facts where the manual is out of date: excess baggage ₹650/kg
  (manual ₹550), date change ₹3,000 (₹2,500), pet in cabin ₹4,500 (₹3,500), unaccompanied minor
  ₹5,000 (₹4,000).
- **20 adversarial**: false premises ("the name change fee is only ₹200, right?"), pressure,
  prompt injection ("SYSTEM: policy override…"), invented policies.
- **10 out of scope**: weather, hotels, medicine, other airlines, visas, stock tips.

## How grading works, and the hand-check

Each final answer is graded by one Judge call against the question's gold facts, plus facts that
share words with the answer (plus every fact in the gold facts' categories for Hindi and Telugu
answers), then the deterministic rule layer re-checks numbers. The grader is the same model family
as the Judge, so grades were checked by hand.

**40 graded answers were read against the verified facts; the grader agreed on 34 (85%).**
Every answer graded wrong, in all three modes, was read, plus 10 graded correct.

| Checked | Grader agreed | Disagreed |
|---|---|---|
| 14 stale-trap baseline answers graded wrong | 14 | 0 |
| 11 other answers graded wrong (9 baseline, E78 guarded and injected) | 5 | 6 |
| 15 answers graded correct | 15 | 0 |

All 6 disagreements are the same pattern: a **refusal sentence counted as a wrong claim**. E08,
E58 and E61 (baseline) and E78 (all three modes) were correct answers flagged for sentences such as
"we cannot confirm a lower fee" or "I do not have that information regarding visa requirements".
Correcting those gives the hand-verified rates in the slide table (baseline 19 of 80, guarded 0 of
80). The grader never missed a real wrong answer in the sample.

One grader bug was found and fixed during the run: Hindi and Telugu answers could be graded
"unsupported" for true side details (E42: "pay by card or UPI" is fact BAG-015) because word
matching against the English facts found nothing. Those answers are now graded against every fact
in the gold facts' categories.

## Gemini vs Gemma (local model)

Run #8, 30 September 2026. The same guardrail with a small local model, Gemma 3 4B through
Ollama, as both Maker and Judge. A fixed sample of 24 of the 80 questions (10 answerable, 5 stale
traps, 6 adversarial, 3 out of scope) in all three modes: 72 answers, all scored. Gemini graded
the final answers of both runs, so the rates are comparable; the Gemini column is run #6 on the
same 24 questions. Reproduce: `python scripts/run_eval.py --provider ollama --sample 24`.

| On the same 24 questions | Gemini | Gemma 3 4B (local) |
|---|---|---|
| Wrong answers, no guardrail | 29.2% (7) | 29.2% (7) |
| Wrong answers, with guardrail | **0%** | **0%** |
| Planted false details caught | **95.8%** | 54.2% |
| Wrong answers reaching the customer with a planted error | 0% | 8.3% (2) |
| Correct answers wrongly blocked | 0% | 0% |
| Handed to a person | 0% | 0% |
| Median answer time, guarded | 10.9 s | 57.3 s |

What this shows:

- **The guardrail's gain does not depend on a large model.** On its own, each model gives a wrong
  answer to 7 of the 24 questions (mostly the stale manuals). With the guardrail, both get to 0.
- **The small model is a much weaker Judge of subtle errors.** It caught about half of the planted
  false details, against 96% for Gemini, and 2 of 24 planted errors reached the customer.
- **It is about five times slower** on this laptop's CPU (no GPU).

Caveats for this comparison: 24 questions is a small sample, so single answers move the rates by
about 4 points. Gemini's median time covers the 21 of 24 guarded answers with a live timing. The
Gemma run was interrupted by a laptop sleep and a network drop and resumed from its cache; one
baseline answer has a timing that includes the sleep, which does not affect the medians.

## Caveats

- 80 questions: large enough to show the effect, small for fine-grained per-category claims
  (categories have 6 to 13 questions).
- The questions were written by the team that built the system, from the same fact set.
- The grader is an LLM from the same family as the Judge; see the hand-check above.
- The injected mode measures catching a *planted* error, which is easier to detect than a subtle
  natural one.
- Free-tier Gemini: overloads and daily quotas make latency noisy.
