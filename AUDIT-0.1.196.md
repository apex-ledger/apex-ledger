# North Ledger 0.1.196 — Company-address tax picker

## Tax picker simplification

Normal transaction screens now show only three choices:

1. **Company tax** — automatically selected from the business province/territory in Company Settings.
2. **No HST / No tax** — for documents with no sales tax, including applicable exempt/zero-rated treatment.
3. **Manual HST / Tax** — user enters the exact tax amount from the source document.

The detailed provincial tax codes remain in the accounting engine for historic/imported transactions and correct reporting.

## Current automatic company rates (CRA table, current 2026)

- Ontario: HST 13%
- Nova Scotia: HST 14%
- New Brunswick, Newfoundland and Labrador, Prince Edward Island: HST 15%
- Alberta, Northwest Territories, Nunavut, Yukon: GST 5%
- British Columbia: GST 5% + PST 7%
- Manitoba: GST 5% + RST 7%
- Saskatchewan: GST 5% + PST 6%
- Quebec: GST 5% + QST 9.975% (QST treatment remains distinct from CRA GST/HST reporting)

The app does not guess Ontario when the company province is missing or misspelled. It prompts the user to set the company province instead.

## Company switching

The tax-default hook now refreshes whenever the active company/data universe changes, preventing a province from the previously opened company from carrying into a new transaction.

## Purchase order correction

The PO editor previously discarded `productId`, `taxCode`, and manual tax by saving them as null. 0.1.196 now retains those fields per line, shows the same three-choice company-tax dropdown, displays subtotal/tax/total, and preserves tax when converting the PO to a vendor bill. A mixed-tax PO converts using Manual Tax with the exact summed tax amount so no tax disappears.
