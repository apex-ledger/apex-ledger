import { describe, expect, it } from 'vitest';
import type { Account } from '../types';
import { BUSINESS_TYPES } from '../businessTypes';
import { describeCommand, extractAmountCents, extractDate, parseLessonControl, parseVoiceCommand, type VoiceContext } from './voiceCommands';

const acct = (id: number, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account => ({ id, code: String(1000 + id), name, accountType, accountSubtype, normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: false });
const accounts = [
  acct(1, 'Chequing Account', 'Asset', 'Cash and Bank'), acct(2, 'Savings Account', 'Asset', 'Cash and Bank'), acct(3, 'Cash Account', 'Asset', 'Cash and Bank'),
  acct(4, 'Visa', 'Liability', 'Credit Card'), acct(5, 'Mastercard', 'Liability', 'Credit Card'),
  acct(6, 'Motor Vehicle Expenses', 'Expense'), acct(7, 'Office Supplies', 'Expense'), acct(8, 'Meals & Entertainment', 'Expense'), acct(9, 'Insurance', 'Expense'), acct(10, 'Telephone', 'Expense'),
  acct(11, 'Service Revenue', 'Revenue'), acct(12, 'Other Revenue', 'Revenue'),
];
const ctx: VoiceContext = { today: '2026-09-06', accounts, businessTypes: BUSINESS_TYPES, vendorNames: ['Shell Canada', 'Bell Canada'], customerNames: ['Maple Ridge Condominium Corp'] };

describe('voice grammar: amounts and dates', () => {
  it('reads digits, dollar words and number words', () => {
    expect(extractAmountCents('$85.50 fuel')?.cents).toBe(8550);
    expect(extractAmountCents('85 dollars 50 fuel')?.cents).toBe(8550);
    expect(extractAmountCents('1,250 dollars')?.cents).toBe(125000);
    expect(extractAmountCents('eighty-five dollars and fifty cents')?.cents).toBe(8550);
    expect(extractAmountCents('two hundred dollars')?.cents).toBe(20000);
    expect(extractAmountCents('no money here')).toBeNull();
  });
  it('reads today, yesterday, month names and day-of-month', () => {
    expect(extractDate('paid yesterday', '2026-09-06')?.date).toBe('2026-09-05');
    expect(extractDate('on June 14', '2026-09-06')?.date).toBe('2026-06-14');
    expect(extractDate('on the 14th of June', '2026-09-06')?.date).toBe('2026-06-14');
    expect(extractDate('on the 3rd', '2026-09-06')?.date).toBe('2026-09-03');
    expect(extractDate('2026-02-01 rent', '2026-09-06')?.date).toBe('2026-02-01');
  });
});

describe('voice grammar: quick entries', () => {
  it('expense with HST on top, paid by card, category by synonym, vendor from the list', () => {
    const cmd = parseVoiceCommand('Expense 85 dollars 50 fuel at Shell on Visa with HST', ctx);
    expect(cmd.kind).toBe('quickEntry');
    if (cmd.kind !== 'quickEntry') return;
    expect(cmd.type).toBe('expense');
    expect(cmd.baseCents).toBe(8550);
    expect(cmd.taxCode).toBe('HST');
    expect(cmd.taxCents).toBe(1112);
    expect(cmd.categoryAccountId).toBe(6);
    expect(cmd.moneyAccountId).toBe(4);
    expect(cmd.entryDate).toBe('2026-09-06');
    expect(cmd.description).toContain('Shell Canada');
    expect(cmd.missing).toEqual([]);
  });
  it('tax included splits the total back to base and tax', () => {
    const cmd = parseVoiceCommand('Paid 113 for office supplies from chequing, tax included, yesterday', ctx);
    if (cmd.kind !== 'quickEntry') throw new Error('expected quick entry');
    expect(cmd.taxIncluded).toBe(true);
    expect(cmd.baseCents).toBe(10000);
    expect(cmd.taxCents).toBe(1300);
    expect(cmd.categoryAccountId).toBe(7);
    expect(cmd.moneyAccountId).toBe(1);
    expect(cmd.entryDate).toBe('2026-09-05');
  });
  it('meals use the half-claim code, insurance says no tax', () => {
    const meal = parseVoiceCommand('spent 24 dollars coffee for the crew on Mastercard', ctx);
    if (meal.kind !== 'quickEntry') throw new Error('expected quick entry');
    expect(meal.taxCode).toBe('MealsHST');
    expect(meal.categoryAccountId).toBe(8);
    expect(meal.moneyAccountId).toBe(5);
    const ins = parseVoiceCommand('expense 310 insurance instalment on Visa no HST', ctx);
    if (ins.kind !== 'quickEntry') throw new Error('expected quick entry');
    expect(ins.taxCode).toBe('NonHST');
    expect(ins.taxCents).toBe(0);
    expect(ins.categoryAccountId).toBe(9);
  });
  it('income lands on a revenue account and a bank', () => {
    const cmd = parseVoiceCommand('Income 200 scrap copper into cash with HST', ctx);
    if (cmd.kind !== 'quickEntry') throw new Error('expected quick entry');
    expect(cmd.type).toBe('income');
    expect(cmd.categoryAccountId).toBe(12);
    expect(cmd.moneyAccountId).toBe(3);
    expect(cmd.taxCents).toBe(2600);
  });
  it('reports what is missing rather than guessing', () => {
    const cmd = parseVoiceCommand('expense fuel', ctx);
    if (cmd.kind !== 'quickEntry') throw new Error('expected quick entry');
    expect(cmd.missing).toEqual(['amount', 'moneyAccount']);
    expect(describeCommand(cmd, accounts)).toContain('the amount');
  });
});

describe('voice grammar: company, navigation, confirmation', () => {
  it('creates a company with type and year end', () => {
    const cmd = parseVoiceCommand('New company Lakeshore Plumbing Inc, plumber, year end December 31', ctx);
    expect(cmd).toMatchObject({ kind: 'createCompany', legalName: 'Lakeshore Plumbing Inc', businessType: 'plumber', fiscalYearEnd: { month: 12, day: 31 } });
  });
  it('opens pages by name', () => {
    expect(parseVoiceCommand('open payroll', ctx)).toMatchObject({ kind: 'navigate', view: { kind: 'payroll' } });
    expect(parseVoiceCommand('Go to the trial balance report', ctx)).toMatchObject({ kind: 'navigate', view: { report: 'trialBalance' } });
    expect(parseVoiceCommand('show me sales tax', ctx)).toMatchObject({ kind: 'navigate', view: { kind: 'hstCentre' } });
  });
  it('answers how-do-I questions with the steps and the screen', () => {
    // A how-to on a screen with a lesson becomes the lesson; one without gets the short answer.
    expect(parseVoiceCommand('How do I file the HST return?', ctx)).toMatchObject({ kind: 'teach', lessonId: 'hstReturn' });
    expect(parseVoiceCommand('what is a credit note', ctx)).toMatchObject({ kind: 'help', topic: 'Credit notes', view: { tab: 'creditNotes' } });
    expect(parseVoiceCommand('what can you do', ctx)).toMatchObject({ kind: 'help', topic: 'What I can do' });
    expect(parseVoiceCommand('help me', ctx)).toMatchObject({ kind: 'help', topic: 'What I can do' });
    expect(parseVoiceCommand('how do I juggle', ctx)).toMatchObject({ kind: 'help', topic: 'User Guide' });
  });
  it('turns questions about the books into queries', () => {
    expect(parseVoiceCommand('How much does Maple Ridge owe?', ctx)).toMatchObject({ kind: 'query', question: 'customerOwes', subjectName: 'Maple Ridge Condominium Corp' });
    expect(parseVoiceCommand('what do we owe Bell', ctx)).toMatchObject({ kind: 'query', question: 'vendorOwed', subjectName: 'Bell Canada' });
    expect(parseVoiceCommand('What is the balance of chequing?', ctx)).toMatchObject({ kind: 'query', question: 'accountBalance', subjectAccountId: 1 });
    expect(parseVoiceCommand('how much HST do I owe this quarter', ctx)).toMatchObject({ kind: 'query', question: 'hstOwing', periodLabel: 'this quarter', from: '2026-07-01' });
    expect(parseVoiceCommand('what were sales last month', ctx)).toMatchObject({ kind: 'query', question: 'sales', from: '2026-08-01', to: '2026-08-31' });
    expect(parseVoiceCommand('who owes me money', ctx)).toMatchObject({ kind: 'query', question: 'receivables' });
    expect(parseVoiceCommand('what is the net income this year', ctx)).toMatchObject({ kind: 'query', question: 'netIncome' });
  });
  it('starts a lesson for teach-me and how-to on a screen it can teach', () => {
    expect(parseVoiceCommand('Teach me quick entry', ctx)).toMatchObject({ kind: 'teach', lessonId: 'quickEntry' });
    expect(parseVoiceCommand('how to create an invoice', ctx)).toMatchObject({ kind: 'teach', lessonId: 'invoice' });
    expect(parseVoiceCommand('walk me through running payroll', ctx)).toMatchObject({ kind: 'teach', lessonId: 'payroll' });
    // Plain topic words after "teach me" find the lesson by its title.
    expect(parseVoiceCommand('teach me payroll', ctx)).toMatchObject({ kind: 'teach', lessonId: 'payroll' });
    expect(parseVoiceCommand('Teach me the CRM', ctx)).toMatchObject({ kind: 'teach', lessonId: 'crm' });
    expect(parseVoiceCommand('teach me reports', ctx)).toMatchObject({ kind: 'teach', lessonId: 'reports' });
    expect(parseVoiceCommand('payroll lesson please', ctx)).toMatchObject({ kind: 'teach', lessonId: 'payroll' });
    expect(parseVoiceCommand('teach me bank reconciliation', ctx)).toMatchObject({ kind: 'teach', lessonId: 'reconcile' });
    expect(parseVoiceCommand('teach me action centre', ctx)).toMatchObject({ kind: 'teach', lessonId: 'actionCentre' });
    expect(parseVoiceCommand('teach me year end', ctx)).toMatchObject({ kind: 'teach', lessonId: 'yearEnd' });
    expect(parseVoiceCommand('how do I add a vendor', ctx)).toMatchObject({ kind: 'teach', lessonId: 'contacts' });
    // A how-to with no lesson still gets the short answer.
    expect(parseVoiceCommand('how do I merge duplicates', ctx)).toMatchObject({ kind: 'help', topic: 'Merging duplicates' });
  });
  it('reads the words that steer a lesson', () => {
    expect(parseLessonControl('Next.')).toBe('next');
    expect(parseLessonControl('go back')).toBe('back');
    expect(parseLessonControl('say that again')).toBe('repeat');
    expect(parseLessonControl('stop')).toBe('stop');
    expect(parseLessonControl('expense 40 dollars')).toBeNull();
  });
  it('hears yes and no', () => {
    expect(parseVoiceCommand('Confirm.', ctx).kind).toBe('confirm');
    expect(parseVoiceCommand('post it', ctx).kind).toBe('confirm');
    expect(parseVoiceCommand('cancel', ctx).kind).toBe('cancel');
    expect(parseVoiceCommand('banana socks', ctx).kind).toBe('unknown');
    expect(parseVoiceCommand('what is the weather', ctx)).toMatchObject({ kind: 'help', topic: 'User Guide' });
  });
});
