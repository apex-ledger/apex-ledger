import { describe, expect, it } from 'vitest';
import type { Account, Contact, JournalEntry } from '../types';
import { writeXeroAccountsCsv, writeXeroContactsCsv, writeXeroManualJournalsCsv, xeroAccountType, xeroDate, XERO_TAX_EXEMPT } from './writeXero';
import { sageDate, writeSage50GeneralJournal, writeSageAccountsCsv, writeSageContactsCsv } from './writeSage';

const acct = (id: number, code: string, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account =>
  ({ id, code, name, accountType, accountSubtype, normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: false } as Account);
const BANK = acct(1, '1000', 'Chequing Account', 'Asset', 'Cash and Bank');
const AR = acct(2, '1200', 'Accounts Receivable', 'Asset', 'Current Asset');
const HST = acct(3, '2280', 'GST/HST Payable', 'Liability', 'Current Liability');
const SALES = acct(4, '4000', 'Service Revenue', 'Revenue', 'Revenue');
const TRUCK = acct(5, '1730', 'Vehicles', 'Asset', 'Capital Asset');
const DEP = acct(6, '1731', 'Accumulated Depreciation - Vehicles', 'Asset', 'Capital Asset');
const COGS = acct(7, '5035', 'Cost of Goods Sold', 'Expense', 'Cost of Sales');
const ACCOUNTS = [BANK, AR, HST, SALES, TRUCK, DEP, COGS];

const entry = (id: number, entryDate: string, memo: string, lines: [number, number, number, string?][]): JournalEntry =>
  ({ id, entryDate, memo, reference: `INV-${id}`, status: 'posted', createdAt: entryDate, postedAt: entryDate, periodFrom: null, periodTo: null, isAdjustingEntry: false, source: 'manual', sourceReference: null,
    lines: lines.map(([accountId, debitCents, creditCents, description], i) => ({ id: id * 10 + i, journalEntryId: id, accountId, debitCents, creditCents, description: description ?? null, lineOrder: i, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null })) } as JournalEntry);
const SALE = entry(42, '2026-09-03', 'Invoice INV-42, "Maple Dental"', [[AR.id, 113000, 0, 'Invoice'], [SALES.id, 0, 100000, 'Consulting'], [HST.id, 0, 13000, 'HST collected']]);

const contact = (id: number, name: string, over: Partial<Contact> = {}): Contact =>
  ({ id, name, companyName: null, contactName: null, website: null, shippingAddress: null, email: null, phone: null, address: null, notes: null, isActive: true, isT4aContractor: false, t4aSin: null, t4aBusinessNumber: null, isT5018Contractor: false, defaultExpenseAccountId: null, ...over } as Contact);

describe('Xero export', () => {
  it('maps account types the way Xero names them', () => {
    expect([BANK, AR, HST, SALES, TRUCK, DEP, COGS].map(xeroAccountType)).toEqual(['CURRENT', 'CURRENT', 'CURRLIAB', 'REVENUE', 'FIXED', 'DEPRECIATN', 'DIRECTCOSTS']);
  });

  it('writes the chart in Xero\'s template columns, tax exempt, bank accounts payment-enabled', () => {
    const csv = writeXeroAccountsCsv(ACCOUNTS);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('*Code,*Name,*Type,*Tax Code,Description,Dashboard,Expense Claims,Enable Payments,Balance');
    expect(lines[1]).toBe(`1000,Chequing Account,CURRENT,${XERO_TAX_EXEMPT},,No,No,Yes,`);
    expect(lines).toHaveLength(ACCOUNTS.length + 1);
  });

  it('writes each posted line as a balanced manual-journal row, debits positive and credits negative, quoting commas and quotes', () => {
    const csv = writeXeroManualJournalsCsv(ACCOUNTS, [SALE]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toMatch(/^\*Narration,\*Date,\*Description,\*AccountCode,\*TaxRate,\*Amount/);
    expect(lines[1]).toBe(`"Invoice INV-42, ""Maple Dental""",03/09/2026,Invoice,1200,${XERO_TAX_EXEMPT},1130.00,,,,`);
    expect(lines[2]).toContain(',4000,Tax Exempt (0%),-1000.00,');
    expect(lines[3]).toContain(',2280,Tax Exempt (0%),-130.00,');
    const sum = lines.slice(1).reduce((s, l) => s + Number(l.split(',').filter((c) => /^-?\d+\.\d\d$/.test(c)).pop()), 0);
    expect(Math.round(sum * 100)).toBe(0);
    expect(xeroDate('2026-01-05')).toBe('05/01/2026');
  });

  it('writes contacts with the full Xero header and the name, email, phone, address and website in their columns', () => {
    const csv = writeXeroContactsCsv([contact(1, 'Maple Dental', { contactName: 'Ann Lee', email: 'ann@maple.example', phone: '416 555 0100', address: '12 King St\nToronto', website: 'maple.example' }), contact(2, 'Gone Ltd', { isActive: false })]);
    const [header, first, ...rest] = csv.trim().split('\r\n');
    const cols = header.split(',');
    expect(cols[0]).toBe('*ContactName');
    const cells = first.split(',');
    expect(cells[cols.indexOf('*ContactName')]).toBe('Maple Dental');
    expect(cells[cols.indexOf('EmailAddress')]).toBe('ann@maple.example');
    expect(cells[cols.indexOf('FirstName')]).toBe('Ann');
    expect(cells[cols.indexOf('LastName')]).toBe('Lee');
    expect(cells[cols.indexOf('POAddressLine1')]).toBe('12 King St');
    expect(cells[cols.indexOf('POAddressLine2')]).toBe('Toronto');
    expect(cells[cols.indexOf('PhoneNumber')]).toBe('416 555 0100');
    expect(cells[cols.indexOf('Website')]).toBe('maple.example');
    expect(cells).toHaveLength(cols.length);
    expect(rest).toHaveLength(0); // inactive contacts are left out
  });
});

describe('Sage export', () => {
  it('writes the Sage 50 general journal text: header, line count, then account, signed amount, comment', () => {
    const txt = writeSage50GeneralJournal(ACCOUNTS, [SALE]);
    expect(txt.trim().split('\r\n')).toEqual([
      '09-03-26,"INV-42","Invoice INV-42, \'Maple Dental\'"',
      '3',
      '"1200",1130.00,"Invoice"',
      '"4000",-1000.00,"Consulting"',
      '"2280",-130.00,"HST collected"',
    ]);
    expect(sageDate('2026-12-31')).toBe('12-31-26');
  });

  it('writes accounts with Sage classes and contacts as plain CSV', () => {
    const a = writeSageAccountsCsv(ACCOUNTS).trim().split('\r\n');
    expect(a[0]).toBe('Account Number,Account Name,Type,Class,GIFI Code,Description');
    expect(a[1]).toBe('1000,Chequing Account,Asset,Bank,,');
    expect(a.find((l) => l.startsWith('5035'))).toBe('5035,Cost of Goods Sold,Expense,Cost of Goods Sold,,');
    const c = writeSageContactsCsv([contact(1, 'Acme, Inc.', { email: 'ap@acme.example', address: '1 Main\nOttawa' })], 'Vendor').trim().split('\r\n');
    expect(c[0]).toBe('Vendor Name,Contact,Email,Phone,Address,Website,Business Number');
    expect(c[1]).toBe('"Acme, Inc.",,ap@acme.example,,"1 Main, Ottawa",,');
  });
});
