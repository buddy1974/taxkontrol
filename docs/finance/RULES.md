# German rule values used by TaxKontrol

**Research date:** 2026-10-09 (additions 2026-11-01) · **Code:** `lib/finance/rules.ts` (single source in code)
**Rule:** values change only together with this file, with source and effective year.
Years without enacted law use the latest enacted rules and are shown to the user as provisional.

Confidence: **H** = read in the current law text · **M** = official/administrative or consistent
secondary sources · **U** = unconfirmed (not used in code).

## VAT (Umsatzsteuer)

| Item | Value | Basis | Source | Conf. |
|---|---|---|---|---|
| Standard / reduced rate | 19 % / 7 % | §12 Abs. 1, 2 UStG | https://www.gesetze-im-internet.de/ustg_1980/__12.html | H |
| Restaurant meals (not drinks) | 7 % from 1.1.2026, no end date | §12 Abs. 2 Nr. 15 UStG (StÄndG 2025, BGBl. 2025 I Nr. 363) | same | H |
| Voranmeldung default | quarterly | §18 Abs. 2 UStG | https://www.gesetze-im-internet.de/ustg_1980/__18.html | H |
| Monthly filing | prior-year VAT > 9,000 € | §18 Abs. 2 UStG | same | H |
| Exemption possible | prior-year VAT ≤ 2,000 € | §18 Abs. 2 UStG | same | H |
| Filing/payment deadline | 10th day after the period (shown as "usually due by"; Dauerfristverlängerung +1 month, §§46–48 UStDV) | §18 Abs. 1 UStG | same | H |
| Founders | monthly rule suspended 2021–2026; **2027 unconfirmed** | §18 Abs. 2 S. 4, 6 UStG | same | H / U |

TaxKontrol lets the user choose MONTHLY / QUARTERLY / YEARLY (Settings); default QUARTERLY.

## Kleinunternehmer (§19 UStG, since 1.1.2025)

| Item | Value | Source | Conf. |
|---|---|---|---|
| Prior-year Gesamtumsatz | ≤ 25,000 € | https://www.gesetze-im-internet.de/ustg_1980/__19.html | H |
| Current-year Gesamtumsatz | ≤ 100,000 € (hard limit); the sale that crosses it is already taxable | §19 Abs. 1 UStG; BMF 18.03.2025 (Abschn. 19.1 UStAE) | H / M |
| Basis | received amounts without VAT; fixed-asset sales excluded | §19 Abs. 2 UStG | H |
| Founding year | 25,000 € applied to actual turnover (administrative view) | BMF 18.03.2025 | M |
| Input VAT | not deductible (turnover tax-exempt since 2025) | §15 Abs. 2 S. 1 Nr. 1 UStG | H |
| Expenses in EÜR | booked gross (non-deductible VAT is part of the cost) | §9b EStG | M |

The old "22,000 € / 50,000 €" limits are obsolete and were removed from the app.

## Income tax (§32a EStG) — estimate only

| Year | Grundfreibetrag | Zone 2 | Zone 3 | Zone 4 (42 %) | Zone 5 (45 %) | Conf. |
|---|---|---|---|---|---|---|
| 2025 | 12,096 € | ≤ 17,443: (932.30·y + 1,400)·y | ≤ 68,480: (176.64·z + 2,397)·z + 1,015.13 | 0.42·x − 10,911.92 | ≥ 277,826: 0.45·x − 19,246.67 | H (constants verified for continuity) |
| 2026 | 12,348 € | ≤ 17,799: (914.51·y + 1,400)·y | ≤ 69,878: (173.10·z + 2,397)·z + 1,034.87 | 0.42·x − 11,135.63 | ≥ 277,826: 0.45·x − 19,470.38 | H |
| 2027 | **not enacted** (cabinet draft 2.9.2026) — 2026 tariff used, flagged provisional | | | | | U |

Source: https://www.gesetze-im-internet.de/estg/__32a.html (2026), consolidated history for 2025.
zvE and tax are rounded down to full euros. Reference values in `tests/unit/taxRules.test.ts`
were computed independently from the formula text (Python, decimal arithmetic).

Solidaritätszuschlag (§3, §4 SolZG): 5.5 %, Milderungszone 11.9 % of the excess;
Freigrenze (single) **19,950 € (2025)**, **20,350 € (2026)**. Church tax: 8 % (Bayern,
Baden-Württemberg) / 9 % (other states) of income tax — user setting.

Estimate assumptions shown to the user: single assessment, no other income or deductions,
Gewerbesteuer not included, based only on recorded data.

Not modelled (documented, not invented): Gewerbesteuer (Freibetrag 24,500 €, Messzahl 3.5 %,
Mindesthebesatz 200 % → **280 % from 2027**, §35 EStG credit 4.0×), Vorauszahlungen
(10.3./10.6./10.9./10.12., min. 400 €/year and 100 €/instalment, §37 EStG).

## Grundsicherungsgeld (formerly Bürgergeld) — §11b SGB II, §3 GrusiGV

| Item | Value | Source | Conf. |
|---|---|---|---|
| Name | Grundsicherungsgeld since **1.7.2026** (BGBl. 2026 I Nr. 107) | https://www.bmas.de/… (BMAS press 2026) | H |
| Flat deduction | 100 €/month (higher actual costs provable above 400 €) | §11b Abs. 2 SGB II | H |
| Earned-income allowance | 20 % of 100–520 €, 30 % of 520–1,000 €, 10 % of 1,000–1,200 € (1,500 € with a minor child), on **monthly** income | §11b Abs. 3 SGB II | H |
| Self-employed income | receipts actually received − necessary expenses actually paid in the period, averaged per month; tax rules do not apply | §3 GrusiGV | H |
| Period | usually 6 months for provisional decisions (§41 Abs. 3, §41a SGB II) | | H |
| Taxes on income | deducted from income (§11b Abs. 1 S. 1 Nr. 1 SGB II), in addition to the 100 € flat amount, which replaces only Nr. 3–5 (§11b Abs. 2 S. 1) | https://www.gesetze-im-internet.de/sgb_2/__11b.html | H (law text read 2026-11-01) — shown as a note, not computed |
| Worked examples | 800 €/month → 532 € countable; 1,300 €/month → 952 € | tests | H |

The previous implementation computed `(profit − 100) × 0.3` as countable income — this inverted
the allowance (30 % is what the person keeps in one band) and is replaced.

## Other values referenced in text

Retention (§147 AO, since 2025): Buchungsbelege **8 years**; books/annual statements 10 years.
Regelbedarf single adult 563 € (2025, 2026). Mindestlohn 13.90 € (2026), 14.60 € (2027).
Minijob limit 603 € (2026). (Context only; not used in calculations.)
