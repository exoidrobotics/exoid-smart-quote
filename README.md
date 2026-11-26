# Exoid Smart Quote

Internal quotation and proposal tool for Exoid Robotics: pick the client, switch on the systems, add items from the
catalog or a package, set markup (OCM, CP) and the payment schedule, and download the Proposal, Bill of Quantities
(Exhibit A), Detailed Unit Price Analysis (Exhibit B), Proforma Invoice and Contract, all from one calculation.

- Static web app (plain HTML/CSS/JS, no build step), served by GitHub Pages.
- Backend: Google Apps Script bound to a private Google Sheet (in progress; see `docs/PLAN.md`).
- Until the backend URL is set in `js/config.js`, the app runs in **demo mode** with made-up data saved only in your browser
  (user code `DEMO`, password `demo1234`, both made up).

This repository is public. It contains no client data, prices, rates, bank details or credentials; those live only in the
private Sheet and are imported after login.

## Try it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Tests

```bash
npm test
```

Runs the calculation-engine tests (Node 18+, no dependencies).

## Docs

- `docs/PLAN.md`: design, security, data and calculation rules
- `docs/PROGRESS.md`: what is done and what is next

Third-party: pdfmake (MIT) and Inter font (SIL OFL 1.1), vendored in `vendor/pdfmake/` with their licences.
