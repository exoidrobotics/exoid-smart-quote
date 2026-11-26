# Exoid Smart Quote: plan

Status: **draft for approval** (Phase 1). Nothing is built until this plan is approved.

This file is public. It contains no client data, prices, rates, payment terms, bank details, user codes or credentials.
Those live only in the owner's private Google Sheet and in the git-ignored `_private/` folder.

## 1. Goal

An internal tool for Exoid Robotics to make correct quotations and proposals in about 10 minutes:
quote list → quote editor → PDFs (BOQ / Exhibit A, DUPA / Exhibit B, Proforma Invoice, Proposal).
Not a SaaS. One company, a few users.

## 2. Architecture

| Part | What | Where |
|---|---|---|
| Web app | Plain HTML/CSS/JS (ES modules), no build step, PDF library vendored | This repo, served by GitHub Pages from `main` (root) at `https://exoidrobotics.github.io/exoid-smart-quote/` |
| Backend | Google Apps Script web app, **bound to the private Sheet**, runs as the owner | Source in `apps-script/` (no IDs, no secrets); deployed by the owner |
| Data | Private Google Sheet + Drive folder owned by the owner, never shared publicly | Owner's Google Drive |
| Dev backend | Mock API in the browser with made-up data and a made-up password | `js/api-mock.js`, used with `?mock=1` or on `localhost` |

The page holds no business data before login. The web app URL is in `js/config.js`; security does not depend on hiding it.
Patterns borrowed from the earlier solar tool (saved list, duplicate/delete, shared catalog, PDF), **not** its login design.

## 3. Security design

- **Login**: user code + password, checked only on the server.
- **Password storage**: PBKDF2-HMAC-SHA256 (random 16-byte salt per user, iteration count tuned to about 1 s in Apps Script), stored in
  Script Properties. Set by a one-time menu action in the Sheet (`Exoid ▸ Set password / Add user`) that prompts the owner;
  the password is never typed into code, the repo, the page or the chat. More users are added the same way, no code change.
- **Sessions**: a correct login returns a random 256-bit token and its expiry (default 12 h). The server stores only the
  SHA-256 of the token with user code and expiry. Every action, read or write, checks the token first; no data is returned
  without a valid token. `doGet` returns no data at all. Logout deletes the token server-side.
- **Brute force**: per-user-code failure counter with exponential delay (1, 2, 4 … capped at 15 minutes) plus a global cap
  on failed attempts per minute. Lockouts always expire, so an attacker cannot lock the owner out permanently; the owner can
  also clear lockouts from the Sheet menu. Failed attempts return the same generic message whether the code exists or not.
- **Transport**: HTTPS POST with a `text/plain` JSON body (avoids CORS preflight). Inputs are validated server-side; values are
  written as data, never evaluated (strings starting with `=`, `+`, `-`, `@` are stored safely so they cannot become formulas).
- **Repo hygiene**: `_private/` and spreadsheet files are git-ignored; every push is preceded by a check of the staged files
  for names, prices, rates, bank details, tokens, hashes, URLs with IDs and user codes.

## 4. Data (Google Sheet tabs)

| Tab | Content |
|---|---|
| `Settings` | Company details, logo, signatories, warranty text, exclusions text, default validity, quote-number prefix and counter, payment presets, markup presets, client-facing system descriptions |
| `Bank` | Payment channel details (printed on Proforma only) |
| `Catalog` | id, system, kind (material / labor / equipment / general requirement), name, brand, model, unit, unit cost, notes, active, updated |
| `Packages` | Named sets of catalog lines with default quantities, per system |
| `Quotes` | One row per quote revision: id, number, revision, status, client, project, totals, dates, prepared by, version, deleted flag |
| `QuoteData` | The full quote JSON split into chunks of at most 40,000 characters per cell (the Sheets limit is 50,000), keyed by quote id + revision + chunk number |
| `Log` | Who saved what and when |

- **Saved quotes keep their prices**: every line stores its own name, unit and unit cost (a snapshot). Catalog changes never alter a saved quote.
- **Two people saving**: every save sends the version it started from; the server takes a `LockService` lock, compares versions,
  and refuses with "this quote was changed by X at T; reload or save as copy" instead of overwriting.
- **Backups**: a daily time-driven trigger copies the Sheet into a dated file in a `Backups` Drive folder (keeps the last 30).
  An **Export** button downloads everything (settings, catalog, packages, all quotes) as one JSON file; **Import** restores it.
- **Initial data**: the catalog and settings drafted in Phase 1 are imported after login from a JSON file generated in
  `_private/` (never committed).

## 5. Calculation engine (one engine feeds every screen and document)

Money is held in **integer centavos**. Rounding rule: half away from zero, to the centavo, at each line and each percentage.

1. Line amount = round(qty × unit cost × people), where people applies to labor lines only (default 1).
2. System direct cost = materials + labor + equipment (sum of its lines).
3. System markup (optional, "DUPA level") = round(direct cost × rate). System unit price = direct + markup.
4. BOQ line amount = system unit price × system quantity. Only switched-on systems are included, automatically.
5. Subtotal = sum of BOQ lines.
6. Quote markups ("BOQ level"): each = round(subtotal × rate). They **do not compound** (this matches every past file).
7. Discount (optional): percentage or fixed amount, applied to the subtotal by default (as in past files) or to the total after markups.
8. Round-to adjustment (optional): a "Less" line that brings the total to a chosen amount (for example down to a round figure).
9. Grand total (VAT exclusive). No VAT is calculated or added anywhere.
10. Payment stages: each = round(total × share); the last stage takes the centavo remainder, so stages always add up to the total.

Labels and rates for markups, discounts and payment stages are data (presets in Settings, editable per quote), never hard-coded.
The BOQ, DUPA, Proforma, Proposal and the on-screen totals all call the same `calculate(quote)` function, so they cannot disagree.

**Warnings** (shown in the editor, block "Mark as sent" until acknowledged): markup at both levels; a switched-on system with ₱0;
payment shares not totalling 100%; a line with quantity or cost of 0; validity date passed; unsaved changes.

## 6. App screens (version 1)

1. **Login**: user code, password.
2. **Quotes**: search, filter by status (draft, sent, accepted, lost), duplicate, delete (to trash) and restore, new quote, export.
3. **Quote editor**
   - Details: client, project, address, general contractor (optional), project type, date (fixed on first save), validity, prepared by (selectable), conforme.
   - Systems: switch each on or off (like the old MASTER tab). Each system has materials, labor and equipment lines: add from the catalog,
     add a custom line, or apply a package. Quantity, unit, location note ("where devices go") per line; room counts.
   - Pricing: system markups, quote markups, discount, round-to adjustment, with a clear label of the level each applies at.
   - Payment schedule: presets or fully custom stages (name, share, due description); must total 100%.
   - **Internal profit view** (cost vs. price per system and in total). Never printed, never in a PDF.
   - Documents: choose which to generate (default: Proposal, BOQ, DUPA for every switched-on system, Proforma).
4. **Revisions**: "Mark as sent" freezes that revision exactly as sent (data and PDF numbers). Further edits create the next revision.
   Older revisions stay readable and can be compared.
5. **Catalog**, **Packages**, **Settings** editors.

**Quote numbers** (proposed): `EXR-2026-0142` (prefix, year, 4-digit sequence issued by the server under a lock, so they are unique),
revision shown as `Rev 2`, alternatives for the same project as a letter suffix (`EXR-2026-0142A`, `…B`).

## 7. Documents (new design)

A4 portrait, white page, black text, brand orange accent (from the website), Inter font embedded (has a real ₱ sign),
logo top left, document title and quote number top right, page *x* of *y*, "VAT exclusive" on every total.
Tables split across pages with the header row repeated; rows never split; long names wrap.
Generated in the browser with **pdfmake 0.2.x** (vendored in `vendor/`, no CDN).

| Document | Content |
|---|---|
| Proposal | Cover; overview; descriptions of the included systems only; scope; investment (same totals as the BOQ); payment terms; warranty; exclusions; acceptance signatures |
| BOQ (Exhibit A) | Project block; one line per system with materials, labor, equipment, unit price, amount and location notes; subtotal, each markup, discount, adjustment, grand total; signatures |
| DUPA (Exhibit B) | One section per switched-on system: materials, labor (people × qty × rate), equipment, direct cost, system markup, unit price carried to Exhibit A |
| Proforma Invoice | Systems summary, the same totals, payment schedule with amounts and due descriptions, payment channel |

Sample pages with made-up data were produced in Phase 1 for approval (kept privately, sent to the owner).
Warranty and exclusions wording are approved by the owner before they go into the Proposal.

## 8. Files in the repo

```
index.html            app shell
css/app.css
js/config.js          web app URL (not a secret)
js/api.js             backend client (token handling)
js/api-mock.js        mock backend, made-up data, made-up password
js/engine.js          calculate(quote): pure functions
js/pdf/*.js           document definitions
js/ui/*.js            screens
vendor/pdfmake/       pdfmake + vfs with Inter (OFL licence file included)
apps-script/*.gs      backend source, no IDs or secrets
tests/*.test.js       node --test, made-up data only
docs/PLAN.md, docs/PROGRESS.md, docs/HOW-TO-USE.md (Phase 3)
```

## 9. Phase 2 milestones (each ends with "what to try")

1. App shell, login screen and quote list against the mock backend; laptop and phone layouts.
2. Quote editor + calculation engine + automated tests (made-up data).
3. Catalog, packages and settings editors; private import of the drafted catalog and settings.
4. PDFs (all four) rendered and inspected page by page (no cut rows, wrapping, ₱ sign).
5. Apps Script backend: login, tokens, lockout, locking, chunked storage, backups, export; security tests against the deployed script.
6. Revisions, conflict warnings, delete/restore.
7. Rebuild at least 5 varied past quotes to the centavo (kept in `_private/`), explaining every difference; independent review of the repo and its history for confidential data.

Phase 3: owner set-up steps, go-live check, `docs/HOW-TO-USE.md`.

Later: billing statements and progress billing, emailing, e-signature, payment tracking, import of past quotes.
