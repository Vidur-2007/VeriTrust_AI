# Planted stale facts (Golconda Bank pack)

The bank's support manuals were last revised in March 2026. Three values were updated in the
verified facts database on 1 September 2026, but the manuals were never updated. The Maker reads
the manual, and the Judge checks against the database.

There are exactly three. Every other value in `manuals/` matches `facts.json`.

| # | Fact ID | Topic | Verified (DB) | Stale (manual) | Manual and section |
|---|---|---|---|---|---|
| 1 | ACC-003 | Savings non-maintenance charge, per quarter | ₹300 | ₹200 | `accounts_and_fees.md` → Minimum balance |
| 2 | CRD-001 | Classic debit card, daily ATM withdrawal limit | ₹40,000 | ₹50,000 | `cards.md` → Classic debit card |
| 3 | LON-001 | Home loan starting interest rate | 8.90% | 8.40% | `loans.md` → Home loans |
