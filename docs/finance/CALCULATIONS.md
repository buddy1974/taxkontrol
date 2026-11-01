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
- **Payments to / refunds from the Finanzamt** (transactions with `taxPaymentType`, recorded on the
  Tax page) are not in "all payments this month": they are paid from the reserve and the tax was
  already deducted in the months that caused it. They are not profit, not a business expense and
  not private money. (Net method: VAT paid to the Finanzamt is profit-neutral; income tax is never
  deductible, §12 Nr. 3 EStG.)
- Records dated in the future are left out of every "so far" figure until their date (limitation shown).
- **Unconfirmed VAT (Regelbesteuerung):** business income still flagged for review with 0 % VAT
  (e.g. bank import or customer payment without a rate) is counted at **19 %** until the user
  confirms the rate — the cautious reading (higher VAT reserve, slightly lower profit). Limitation
  `ASSUMED_VAT` is shown. Kleinunternehmer are never affected.
- The result may be **negative** — shown as a shortfall, never floored to 0.
- Based on recorded transactions, **not** the bank balance (shown to the user).

Open commitments:
- Monthly fixed cost: counted unless an expense this month matches it (name, or a word of ≥ 4
  letters that is not a legal form / filler word such as "GmbH", "Zahlung", in merchant/description
  **and** amount within ±2 %, min. 1 €) → no double counting once paid. **Each expense settles at
  most one commitment** (fixed costs first, then salaries, then bills): one "Miete" payment cannot
  mark two rents as paid.
- Quarterly/yearly fixed cost: monthly share as a provision — except in a month where the full amount is already booked.
- Monthly salary: unless a paid salary payment exists for this Berlin month or a matching expense
  is booked. Hourly wages and employer social costs are **not** calculated (shown as limitation).
- Supplier bills: outstanding amount if due by month end or undated. A bill the user booked by
  hand (expense with the supplier name and the **full bill amount**) is not counted again — only
  when no payment was recorded on the bill in TaxKontrol (recorded payments already reduce the
  outstanding amount, so a partly paid bill keeps its open rest). Overdue = due **day** passed.
- Recording a payment on a customer invoice / supplier bill, or marking a salary paid, **books the
  transaction** (business income / expense) in the same database transaction, unless the user ticks
  "already entered". Bills without a VAT rate are flagged for review for VAT-registered users.
- Customer invoices are never counted as money until paid.

## 3. Tax reserve per period

| Reserve | Period | Estimated tax |
|---|---|---|
| VAT (Regelbesteuerung only) | current VAT filing period (Settings) **and the period just ended** | output VAT − deductible input VAT of that period (≥ 0) |
| Income tax | current calendar year **and the previous year** | current: YTD profit × effective rate of the projected annual profit; previous year: §32a tax + Soli (+ church tax) on last year's recorded profit |

**Ended periods** stay listed (status ENDED, dashboard warning) until the payment is recorded or the
user marks the period *settled* — the tax of a quarter is due only after it ends (VAT: 10th day after
the period, §18 Abs. 1 UStG; one month later with Dauerfristverlängerung; income tax: per
Steuerbescheid). Periods older than that are not tracked (limitation).

For every period: **paid** = recorded payments to the Finanzamt for that period − refunds;
**open** = max(0, estimated tax − paid); **shortfall** = max(0, open − reserved). Advance payments
(Vorauszahlungen) are recorded as payments for the current year. Deleting a payment booking reopens
the amount. "Settled" is only ever set by the user (Steuerbescheid differs from the estimate).

Projected annual profit = YTD profit ÷ months with records this year × 12 (months counted from
the first recorded month, so new users are not under-estimated). Effective rate = §32a tax + Soli
(+ church tax) ÷ projected profit. The projection is kept even with few months of records because
dropping it under-reserves steady earners; next to it the user sees the **minimum** (tax on the
profit so far if nothing more were earned), so one large early invoice is visible as such.
"Reserved" is only what the user enters (it can be updated for past periods — late transfers —
and every change is audited).

## 4. Kleinunternehmer monitor
Prior-year and current-year business income (received, without VAT) vs. 25,000 € / 100,000 €.
Turnover is read with **each row's stored VAT rate**, so a year under standard taxation (rows at
19 %) is measured net even after switching to Kleinunternehmer. Order of checks: prior year
> 25,000 € → current year > 100,000 € → **founding year > 25,000 €** → ≥ 80 % of 100,000 € →
current year > 25,000 € (next year at risk).

## 5. Jobcenter / Anlage EKS
Receipts (business income received, incl. VAT, **plus VAT refunded by the Finanzamt**) − business
expenses paid (business share incl. input VAT, **plus VAT paid to the Finanzamt**) over whole Berlin
months → monthly average → §11b deductions → countable income. Private and unclear money are
excluded; unclear items are reported. Income tax paid is **not** a business expense; it is deducted
separately under §11b Abs. 1 S. 1 Nr. 1 SGB II — the estimate does not include that deduction and
tells the user when income tax payments exist in the period.

## 6. Reports
Monthly EÜR-style overview (business income, deductible expenses, profit), VAT section only for
Regelbesteuerung, private and unclear money listed separately, payments to / refunds from the
Finanzamt in their own section (not in the totals), text export for the Steuerberater. Known
limitation: an old period is shown with the user's *current* VAT status. The preparation-package
export uses the same summary (Berlin calendar year, business income only).
