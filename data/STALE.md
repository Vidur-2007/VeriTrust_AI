# Planted stale facts

The support manuals were last revised in March 2026. Four values were updated in the verified
facts database on 1 September 2026, but the manuals were never updated. This is the drift the
guardrail must catch: the Maker reads the manual, and the Judge checks against the database.

There are exactly four. Every other value in `data/manuals/` matches `data/facts.json`.

| # | Fact ID | Topic | Verified (DB) | Stale (manual) | Manual and section |
|---|---|---|---|---|---|
| 1 | BAG-007 | Excess baggage, domestic, per kg | ₹650 | ₹550 | `baggage.md` → Excess baggage at the airport |
| 2 | FEE-001 | Date change fee, domestic | ₹3,000 | ₹2,500 | `fees_and_changes.md` → Changing the date or time of a booking |
| 3 | PET-003 | Pet in cabin fee, per sector | ₹4,500 | ₹3,500 | `loyalty_special_assistance_pets.md` → Pets in the cabin |
| 4 | SPA-003 | Unaccompanied minor fee, per sector | ₹5,000 | ₹4,000 | `loyalty_special_assistance_pets.md` → Unaccompanied minors |

## Stale-trap questions

Use these for demo step 4, the eval `stale_trap` set, and to check the manual audit.

1. "My bag is 3 kg over on a domestic flight. How much will I pay at the airport?"
   Correct answer: ₹650 per kg, so ₹1,950.
2. "What does it cost to change the date of my Hyderabad to Delhi flight?"
   Correct answer: ₹3,000 per passenger per sector, plus any fare difference.
3. "How much is it to take my cat in the cabin to Bengaluru?"
   Correct answer: ₹4,500 per pet per sector.
4. "My 9-year-old is flying alone to Chennai. What is the fee?"
   Correct answer: ₹5,000 per child per sector.

Demo step 1 (baggage allowance) and step 3 (refunds) deliberately avoid these facts. The refunds
manual has no stale values, so an injected hallucination there is clearly the Maker's doing.
