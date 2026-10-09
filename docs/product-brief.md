# Product Brief — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Repository class | Maxpromo / AI-assisted |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
| Status | Complete |

## 1. Purpose

Help first-time entrepreneurs in Germany understand their financial position **before** problems
develop: which part of the money is really theirs, which part belongs to the tax office, what is
still due, and what to prepare for the Steuerberater or the Jobcenter. It is **not** an
accounting or tax-filing product and never submits anything to authorities.

## 2. Users

| Persona | Goal | Notes |
|---|---|---|
| Kleinunternehmer / freelancer | "How much can I take out without trouble later?" | Often limited financial education; may be new to Germany |
| Small business with VAT | Track VAT owed vs. deductible, reserve for taxes | Quarterly or monthly VAT returns |
| Self-employed receiving Grundsicherungsgeld | Prepare the Anlage EKS correctly | Income counted differently from tax profit |
| Steuerberater (indirect) | Receives a clean monthly overview | Export only |

## 3. Problem

Money in the business account looks like income, but part is VAT, part is a loan or private
deposit, and taxes arrive months later. Users are surprised by tax bills, mix private and
business money and fail to prepare Jobcenter paperwork.

## 4. Scope (RC2)

In: transactions with business/private/mixed/unsure classification, receipt reading with
mandatory review, bank-statement import with explicit classification, monthly position, tax
reserve per period, Kleinunternehmer limits, income-tax estimate, Jobcenter EKS estimate,
receivables/payables, fixed costs, salaries (gross), reports, guidance for Finanzamt letters,
decision centre, data export, account deletion.

Out: filing (ELSTER), bookkeeping/DATEV, payroll calculation, Gewerbesteuer, bank connections,
paid plans (prepared, not enabled).

## 5. Principles

- Estimates are labelled as estimates; limitations are shown, not hidden.
- AI suggests, the user decides. Nothing AI-read is booked silently.
- Never assume incoming money is profit or that every expense is deductible.
- Plain language, mobile-first, accessible (WCAG AA).
