import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './parseReceiptText';

describe('parseReceiptText', () => {
  it('picks up vendor name, total, tax, and date from a typical grocery receipt', () => {
    const text = [
      'COSTCO WHOLESALE',
      '123 Main St',
      'Milk           4.99',
      'Bread          3.49',
      'Subtotal       8.48',
      'HST            1.10',
      'Total          9.58',
      '2026-03-14',
    ].join('\n');

    const result = parseReceiptText(text);
    expect(result.vendorNameGuess).toBe('COSTCO WHOLESALE');
    expect(result.amountCentsGuess).toBe(958);
    expect(result.taxAmountCentsGuess).toBe(110);
    expect(result.dateGuess).toBe('2026-03-14');
  });

  it('parses MM/DD/YYYY dates', () => {
    const result = parseReceiptText('Shell Gas\n03/14/2026\nTotal $45.00');
    expect(result.dateGuess).toBe('2026-03-14');
  });

  it('parses "Month D, YYYY" dates', () => {
    const result = parseReceiptText('Home Depot\nJan 5, 2026\nTotal $120.00');
    expect(result.dateGuess).toBe('2026-01-05');
  });

  it('falls back to the largest dollar amount when no "total" line exists', () => {
    const result = parseReceiptText('Parking Lot\nRate 2.50\n15.00\n5.00');
    expect(result.amountCentsGuess).toBe(1500);
  });

  it('ignores a subtotal line when picking the total', () => {
    const result = parseReceiptText('Shop\nSubtotal 10.00\nTotal 11.30');
    expect(result.amountCentsGuess).toBe(1130);
  });

  it('rejects an invalid date rather than guessing garbage', () => {
    const result = parseReceiptText('Store\n13/45/2026\nTotal $10.00');
    expect(result.dateGuess).toBeNull();
  });

  it('returns nulls for text with no recognizable fields', () => {
    const result = parseReceiptText('');
    expect(result).toEqual({
      vendorNameGuess: null,
      dateGuess: null,
      amountCentsGuess: null,
      taxAmountCentsGuess: null,
      currencyGuess: null,
    });
  });

  it('detects USD from an explicit marker', () => {
    expect(parseReceiptText('Target\nTotal USD 45.00').currencyGuess).toBe('USD');
    expect(parseReceiptText('Target\nTotal US$45.00').currencyGuess).toBe('USD');
    expect(parseReceiptText('Store in the United States\nTotal 45.00').currencyGuess).toBe('USD');
  });

  it('does not guess a currency for an ordinary Canadian receipt', () => {
    expect(parseReceiptText('Costco Wholesale\nHST 1.10\nTotal 9.58').currencyGuess).toBeNull();
  });
});

describe('a till receipt whose TOTAL is printed in reverse video', () => {
  // Costco prints "**** TOTAL" white on black; OCR reads the label but no figure there.
  const costco = [
    'COSTCO WHOLESALE',
    'NW Vaughan #1261',
    '2087734 PANEER 1.6KG 16.99',
    '1407213 NATURE BAG 12.99 H',
    'SUBTOTAL 131.78',
    'TAX 5.72',
    '**** TOTAL',
    'XXXXXXXXXXXX4301',
    'ACCT: INTERAC CHEQUING',
    'AUTH #: 163429 2026/08/30 16:34:29',
    'AMOUNT: $137.50',
    'Interac 137.50',
    'CHANGE 0.00',
    'P (H)HST 13% 5.72',
    'TOTAL TAX 5.72',
    'TOTAL NUMBER OF ITEMS SOLD = 12',
    'TOTAL DISCOUNT(S) $ 7.50',
    'HST/GST #121476329RT',
  ].join('\n');

  it('takes the terminal AMOUNT line when the TOTAL figure is unreadable', () => {
    const guesses = parseReceiptText(costco);
    expect(guesses.amountCentsGuess).toBe(13750);
    expect(guesses.taxAmountCentsGuess).toBe(572);
    expect(guesses.dateGuess).toBe('2026-08-30');
    expect(guesses.vendorNameGuess).toBe('COSTCO WHOLESALE');
  });

  it('never mistakes TOTAL TAX, item counts or discounts for the total', () => {
    const noAmountLine = costco.split('\n').filter((line) => !line.startsWith('AMOUNT') && !line.startsWith('Interac')).join('\n');
    // Falls through to SUBTOTAL + TAX.
    expect(parseReceiptText(noAmountLine).amountCentsGuess).toBe(13178 + 572);
  });

  it('does not trust a TOTAL figure OCR read out of reverse video', () => {
    const pharmacy = ['LCOSTCO', 'SUBTOTAL * 69.99', 'TAX 9.10', 'xxx TOTAL (9.09 ]', 'AMOUNT: $79.09', 'Interac 79.09', 'TOTAL TAX 9.10'].join('\n');
    expect(parseReceiptText(pharmacy).amountCentsGuess).toBe(7909);
    const groceries = ['SUBTOTAL 131.78', 'TAX 5.72', 'xxx TOTAL [____135{.50 |', 'Interac 137.50'].join('\n');
    expect(parseReceiptText(groceries).amountCentsGuess).toBe(13750);
  });

  it('uses a card tender line, never the cash handed over', () => {
    expect(parseReceiptText('**** TOTAL\nInterac 137.50\nCHANGE 0.00').amountCentsGuess).toBe(13750);
    expect(parseReceiptText('TOTAL 11.30\nCASH 20.00\nCHANGE 8.70').amountCentsGuess).toBe(1130);
    expect(parseReceiptText('**** TOTAL\nCASH 20.00\nCHANGE 8.70\nSUBTOTAL 10.00\nHST 1.30').amountCentsGuess).toBe(1130);
  });

  it('skips logo debris when naming the vendor', () => {
    expect(parseReceiptText('J\nLCOSTCO\nNW Vaughan #1261').vendorNameGuess).toBe('LCOSTCO');
    expect(parseReceiptText('=——WHOLESALE\nNW Vaughan #1261').vendorNameGuess).toBe('WHOLESALE');
  });

  it('still reads an ordinary TOTAL line first', () => {
    expect(parseReceiptText('SUBTOTAL 10.00\nHST 13% 1.30\nTOTAL 11.30\nVISA 11.30').amountCentsGuess).toBe(1130);
    expect(parseReceiptText('SUBTOTAL 10.00\nHST 13% 1.30\nTOTAL 11.30').taxAmountCentsGuess).toBe(130);
  });

  it('ignores a registration number that contains the word HST', () => {
    expect(parseReceiptText('HST/GST #121476329RT\nTOTAL 11.30').taxAmountCentsGuess).toBeNull();
  });
});
