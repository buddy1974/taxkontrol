# How TaxKontrol calculates

All maths is in `lib/finance/` (pure functions, integer cents, Europe/Berlin calendar).
Routes and pages only load data and present results. Tests: `tests/unit/*`, `tests/integration/finance.test.ts`.

## 1. One transaction (`transactionAmounts.ts`)

Primary fields: type, gross amount, VAT rate, usage, business %. Everything else is derived.

| Case | Business (profit-relevant) | VAT | Private | Unclear |
|---|---|---|---|---|
| Income, BUSINESS, Regelbesteuerung | net | output VAT owed | – | – |
| Income, BUSINESS, Kleinunternehmer | gross (no VAT allowed) | – | – | – |
| Income, PRIVATE (own deposit, loan, private refund) | – | – | gross | – |
| Income, UNSURE | – | – | – | gross (excluded until classified, flagged) |
| Expense, BUSINESS / MIXED, Regelbesteuerung | net × business % | deductible input VAT × business % | rest of gross | – |
| Expense, BUSINESS / MIXED, Kleinunternehmer | gross × business % | none | rest | – |
| Expense, PRIVATE | – | – | gross | – |
| Expense, UNSURE | – | – | – | gross (not deductible until classified) |

`business + deductible VAT + private = gross` always holds. Stored derived columns are a cache;
aggregations recompute from primary fields, so legacy rows and later status changes are consistent.

## 2. Monthly position (`position.ts`)

```
left from this month = business money received (gross)
                     − all payments this month (gross, incl. private ones)
                     − taxes caused this month  (VAT payable + income-tax estimate on this month's profit)
                     − open commitments this month
```
- Private deposits, loans and unclear money are **not** available money.
- The result may be **negative** — shown as a shortfall, never floored to 0.
- Based on recorded transactions, **not** the bank balance (shown to the user).

Open commitments:
- Monthly fixed cost: counted unless an expense this month matches it (name/word in
  merchant/description **and** amount within ±2 %, min. 1 €) → no double counting once paid.
- Quarterly/yearly fixed cost: monthly share as a provision — except in a month where the full amount is already booked.
- Monthly salary: unless a paid salary payment exists for this Berlin month or a matching expense
  is booked. Hourly wages and employer social costs are **not** calculated (shown as limitation).
- Supplier bills: outstanding amount if due by month end or undated, unless a matching expense (name + amount) is already booked this month. Overdue = due **day** passed.
- Recording a payment on a customer invoice / supplier bill, or marking a salary paid, **books the
  transaction** (business income / expense) in the same database transaction, unless the user ticks
  "already entered". Bills without a VAT rate are flagged for review for VAT-registered users.
- Customer invoices are never counted as money until paid.

## 3. Tax reserve per period

| Reserve | Period | Target |
|---|---|---|
| VAT (Regelbesteuerung only) | current VAT filing period (Settings) | output VAT − deductible input VAT of that period (≥ 0) |
| Income tax | calendar year | year-to-date profit × effective rate of the projected annual profit |

Projected annual profit = YTD profit ÷ months with records this year × 12 (months counted from
the first recorded month, so new users are not under-estimated). Effective rate = §32a tax + Soli
(+ church tax) ÷ projected profit. "Reserved" is only what the user enters; old periods are history
and never rewritten. Shortfall = max(0, target − reserved).

## 4. Kleinunternehmer monitor
Prior-year and current-year business income (received, without VAT) vs. 25,000 € / 100,000 €;
warnings at ≥ 80 % of 100,000 €, above 25,000 € (next year at risk) and for founding years.

## 5. Jobcenter / Anlage EKS
Receipts (business income received, incl. VAT) − business expenses paid (business share incl.
input VAT) over whole Berlin months → monthly average → §11b deductions → countable income.
Private and unclear money are excluded; unclear items are reported.

## 6. Reports
Monthly EÜR-style overview (business income, deductible expenses, profit), VAT section only for
Regelbesteuerung, private and unclear money listed separately, text export for the Steuerberater.
