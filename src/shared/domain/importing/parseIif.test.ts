import { describe, expect, it } from 'vitest';
import { parseIif } from './parseIif';

const CHART_OF_ACCOUNTS_IIF = [
  '!ACCNT\tNAME\tACCNTTYPE\tDESC',
  'ACCNT\tChecking\tBANK\tBusiness chequing',
  'ACCNT\tAccounts Receivable\tAR\t',
  'ACCNT\tOffice Equipment\tFIXASSET\t',
  'ACCNT\tVisa\tCCARD\t',
  'ACCNT\tAccounts Payable\tAP\t',
  'ACCNT\tOwner Equity\tEQUITY\t',
  'ACCNT\tConsulting Income\tINC\t',
  'ACCNT\tOffice Supplies\tEXP\t',
].join('\n');

const TRANSACTION_IIF = [
  '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO',
  '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO',
  '!ENDTRNS',
  'TRNS\t1\tCHECK\t1/15/2026\tChecking\t\t\t-100.00\t101\tOffice supplies run',
  'SPL\t1\tCHECK\t1/15/2026\tOffice Supplies\t\t\t100.00\t101\tOffice supplies run',
  'ENDTRNS',
].join('\n');

describe('parseIif', () => {
  it('parses accounts and maps IIF account types onto Asset/Liability/Equity/Revenue/Expense', () => {
    const result = parseIif(CHART_OF_ACCOUNTS_IIF);
    expect(result.accounts).toHaveLength(8);
    expect(result.accounts.find((a) => a.name === 'Checking')).toMatchObject({ accountType: 'Asset', accountSubtype: 'Cash and Bank' });
    expect(result.accounts.find((a) => a.name === 'Accounts Receivable')).toMatchObject({ accountType: 'Asset', accountSubtype: 'Current Asset' });
    expect(result.accounts.find((a) => a.name === 'Office Equipment')).toMatchObject({ accountType: 'Asset', accountSubtype: 'Capital Asset' });
    expect(result.accounts.find((a) => a.name === 'Visa')).toMatchObject({ accountType: 'Liability', accountSubtype: 'Credit Card' });
    expect(result.accounts.find((a) => a.name === 'Accounts Payable')).toMatchObject({ accountType: 'Liability', accountSubtype: 'Current Liability' });
    expect(result.accounts.find((a) => a.name === 'Owner Equity')).toMatchObject({ accountType: 'Equity' });
    expect(result.accounts.find((a) => a.name === 'Consulting Income')).toMatchObject({ accountType: 'Revenue' });
    expect(result.accounts.find((a) => a.name === 'Office Supplies')).toMatchObject({ accountType: 'Expense', accountSubtype: 'Operating Expense' });
  });

  it('parses a balanced TRNS/SPL/ENDTRNS transaction with correct debit/credit signs', () => {
    const result = parseIif(TRANSACTION_IIF);
    expect(result.transactions).toHaveLength(1);
    const txn = result.transactions[0];
    expect(txn.date).toBe('2026-01-15');
    expect(txn.balanced).toBe(true);
    expect(txn.lines).toEqual([
      { accountName: 'Checking', debitCents: 0, creditCents: 10000, memo: 'Office supplies run' },
      { accountName: 'Office Supplies', debitCents: 10000, creditCents: 0, memo: 'Office supplies run' },
    ]);
  });

  it('flags a transaction as unbalanced when debits and credits do not match', () => {
    const unbalanced = [
      '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT',
      '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT',
      '!ENDTRNS',
      'TRNS\t1\tCHECK\t2/1/2026\tChecking\t-50.00',
      'SPL\t1\tCHECK\t2/1/2026\tOffice Supplies\t40.00',
      'ENDTRNS',
    ].join('\n');
    const result = parseIif(unbalanced);
    expect(result.transactions[0].balanced).toBe(false);
  });

  it('handles a two-digit year and skips a transaction with an unparseable date', () => {
    const twoDigitYear = [
      '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT',
      '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT',
      '!ENDTRNS',
      'TRNS\t1\tCHECK\t3/5/26\tChecking\t-10.00',
      'SPL\t1\tCHECK\t3/5/26\tOffice Supplies\t10.00',
      'ENDTRNS',
      'TRNS\t2\tCHECK\tnot-a-date\tChecking\t-5.00',
      'SPL\t2\tCHECK\tnot-a-date\tOffice Supplies\t5.00',
      'ENDTRNS',
    ].join('\n');
    const result = parseIif(twoDigitYear);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].date).toBe('2026-03-05');
    expect(result.warnings.some((w) => w.includes('unparseable date'))).toBe(true);
  });

  it('ignores unrelated record types like CUST/VEND lists', () => {
    const withCustomers = ['!CUST\tNAME\tCONTACT', 'CUST\tAcme Co\tJane Doe', CHART_OF_ACCOUNTS_IIF].join('\n');
    const result = parseIif(withCustomers);
    expect(result.accounts).toHaveLength(8);
  });
});
