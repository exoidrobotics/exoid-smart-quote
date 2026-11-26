# Progress

Public file: no confidential data. Confidential work lives in the git-ignored `_private/` folder (and in the owner's private Sheet).

## Phase 1: study and plan (done)

- Parsed all quotation files with scripts; grouped projects, revisions and alternatives; rebuilt totals; drafted a catalog (all private).
- Owner decisions since: markups are only **CP (Contractor's Profit)** and **OCM (Overhead, Miscellaneous & Contingencies)**;
  warranty wording and contract clauses follow the company's own contract and turnover agreement (period editable in Settings);
  logo exported from the company's Canva design.

## Phase 2: prototype (milestones 1–4 done, in demo mode)

- `js/engine.js`: one calculation for everything (centavos, half-away-from-zero rounding, non-compounding quote markups,
  optional system markup, discount on subtotal or after markup, round-down/target adjustment, payment stages that always sum
  to the total, warnings). `npm test`: 9 tests pass.
- Screens: sign-in, quote list (search, status, duplicate, trash/restore), quote editor (client & project, systems with
  on/off switches, catalog picker, custom lines, packages, location notes, pricing & payment, live summary, warnings,
  internal profit view that never prints), mark as sent (frozen revision), new revision, conflict warning, catalog,
  packages, settings (company, signatories, payment channel, systems, presets, document wording, contract clauses),
  export/import.
- PDFs (pdfmake + embedded Inter with ₱): Proposal (cover, overview, included systems, investment, payment terms,
  warranty, exclusions, acceptance), BOQ, DUPA (one page per system), Proforma Invoice with payment channel, Contract (Annex A).
- Checked in Chromium at 1366 px and 390 px (no horizontal scroll); all PDF pages rendered and inspected.
- Private initial-data import file generated from the Phase 1 catalog and the company contract (not in the repo).

## Next

5. Apps Script backend (login with hashed password, tokens, lockout, locking, chunked storage, backups) and security tests.
6. Owner set-up: Sheet, script deployment, password, import, GitHub Pages.
7. Rebuild past quotes to the centavo (private) and an independent review of the repo and its history.

## To resume in a new session

1. Re-create `_private/` from the owner's copies (never commit it).
2. Read `docs/PLAN.md` and this file. Run `npm test`.
