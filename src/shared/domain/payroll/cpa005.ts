/**
 * CPA Standard 005 — the Canadian bank file for direct deposits (AFT credits).
 *
 * The file a payroll is uploaded to the bank as: one logical record per line, 1,464 characters,
 * fixed width. Record A opens the file with the originator's ID, file creation number and the
 * bank's data centre; each record C carries up to six credit segments (one employee each); record
 * Z closes with counts and totals. Amounts are cents, dates are Julian "0YYDDD", and every
 * number field is zero-padded on the left while text is space-padded on the right — the rules
 * the banks' validators actually enforce. Bank portals differ only in what they call the header
 * fields, so those are settings the firm copies from its bank's EFT setup letter.
 */
export interface Cpa005Originator {
  /** 10-character originator ID from the bank's EFT agreement. */
  originatorId: string;
  /** Up to 30 characters — the name the payee sees on their statement. */
  originatorShortName: string;
  originatorLongName: string;
  /** 5-digit data centre code assigned by the bank. */
  dataCentre: string;
  /** Sequential file number, 0001–9999, must increase with each file the bank receives. */
  fileCreationNumber: number;
  /** Where the bank takes the money from: 3-digit institution, 5-digit transit, account. */
  settlementInstitution: string;
  settlementTransit: string;
  settlementAccount: string;
  /** 3-character CAD; USD files need a USD settlement account. */
  currency?: 'CAD' | 'USD';
}

export interface Cpa005Credit {
  payeeName: string;
  institution: string;
  transit: string;
  account: string;
  amountCents: number;
  /** Value date, YYYY-MM-DD — the pay date. */
  dueDate: string;
  /** Up to 19 characters printed on the payee's statement. */
  crossReference: string;
}

export const CPA005_RECORD_LENGTH = 1464;
const SEGMENT_LENGTH = 240;
const SEGMENTS_PER_RECORD = 6;
/** CPA transaction code for payroll deposits. */
export const CPA005_PAYROLL_CODE = '200';

function num(value: number | string, width: number): string {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length > width) throw new Error(`Value ${value} does not fit in ${width} digits.`);
  return digits.padStart(width, '0');
}
function text(value: string, width: number): string {
  const clean = (value ?? '').replace(/[^\x20-\x7E]/g, ' ').toUpperCase().slice(0, width);
  return clean.padEnd(width, ' ');
}

/** "0YYDDD" — the CPA Julian date. */
export function cpaJulianDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const day = Math.floor((Date.UTC(y, m - 1, d) - start) / 86_400_000) + 1;
  return `0${String(y).slice(-2)}${String(day).padStart(3, '0')}`;
}

export interface Cpa005Problem { payee: string; problem: string }

/** Validates what the bank will reject before a file is written. */
export function validateCpa005(originator: Cpa005Originator, credits: Cpa005Credit[]): Cpa005Problem[] {
  const problems: Cpa005Problem[] = [];
  const o = originator;
  if (!/^[A-Za-z0-9]{10}$/.test(o.originatorId)) problems.push({ payee: 'Company', problem: 'Originator ID must be exactly 10 letters/digits (from your bank’s EFT agreement).' });
  if (!/^\d{5}$/.test(o.dataCentre)) problems.push({ payee: 'Company', problem: 'Data centre must be 5 digits.' });
  if (!/^\d{3}$/.test(o.settlementInstitution) || !/^\d{5}$/.test(o.settlementTransit) || !/^\d{1,12}$/.test(o.settlementAccount)) problems.push({ payee: 'Company', problem: 'Settlement account needs a 3-digit institution, 5-digit transit and a numeric account (up to 12 digits).' });
  if (!(o.fileCreationNumber >= 1 && o.fileCreationNumber <= 9999)) problems.push({ payee: 'Company', problem: 'File creation number must be between 1 and 9999.' });
  if (credits.length === 0) problems.push({ payee: 'Payroll', problem: 'No employees to pay.' });
  for (const c of credits) {
    if (!/^\d{3}$/.test(c.institution) || !/^\d{5}$/.test(c.transit) || !/^\d{1,12}$/.test(c.account)) problems.push({ payee: c.payeeName, problem: 'Bank details incomplete: 3-digit institution, 5-digit transit and a numeric account are required.' });
    if (!(c.amountCents > 0) || c.amountCents > 99_999_999_99) problems.push({ payee: c.payeeName, problem: 'Amount must be more than zero.' });
    if (!c.payeeName.trim()) problems.push({ payee: c.payeeName || '(blank)', problem: 'Payee name is blank.' });
  }
  return problems;
}

/** Builds the file. Throws on validation problems — call validateCpa005 first for a friendly list. */
export function buildCpa005File(originator: Cpa005Originator, credits: Cpa005Credit[], fileCreationDate: string): { content: string; recordCount: number; totalCents: number } {
  const problems = validateCpa005(originator, credits);
  if (problems.length > 0) throw new Error(problems.map((p) => `${p.payee}: ${p.problem}`).join('\n'));
  const o = originator;
  const originIdCreation = text(o.originatorId, 10) + num(o.fileCreationNumber, 4);
  const currency = o.currency ?? 'CAD';
  const records: string[] = [];
  let recordCount = 1;

  // A — header
  records.push(('A' + num(recordCount, 9) + originIdCreation + cpaJulianDate(fileCreationDate) + num(o.dataCentre, 5) + ' '.repeat(20) + text(currency, 3)).padEnd(CPA005_RECORD_LENGTH, ' '));

  // C — credits, six per record
  let totalCents = 0;
  for (let i = 0; i < credits.length; i += SEGMENTS_PER_RECORD) {
    recordCount += 1;
    let record = 'C' + num(recordCount, 9) + originIdCreation;
    for (const c of credits.slice(i, i + SEGMENTS_PER_RECORD)) {
      totalCents += c.amountCents;
      const segment =
        CPA005_PAYROLL_CODE +
        num(c.amountCents, 10) +
        cpaJulianDate(c.dueDate) +
        '0' + num(c.institution, 3) + num(c.transit, 5) +
        text(c.account, 12) +
        ' '.repeat(22) + // item trace number — assigned by the bank
        '0'.repeat(3) + // stored transaction type
        text(o.originatorShortName, 15) +
        text(c.payeeName, 30) +
        text(o.originatorLongName, 30) +
        text(o.originatorId, 10) +
        text(c.crossReference, 19) +
        '0' + num(o.settlementInstitution, 3) + num(o.settlementTransit, 5) +
        text(o.settlementAccount, 12) +
        ' '.repeat(15) + // originator sundry
        ' '.repeat(22) + // filler
        ' '.repeat(2) + // settlement code
        '0'.repeat(11); // invalid data element id
      if (segment.length !== SEGMENT_LENGTH) throw new Error(`Internal: segment length ${segment.length}.`);
      record += segment;
    }
    records.push(record.padEnd(CPA005_RECORD_LENGTH, ' '));
  }

  // Z — trailer: debit totals are zero for a credit-only file
  recordCount += 1;
  records.push(('Z' + num(recordCount, 9) + originIdCreation + num(0, 14) + num(0, 8) + num(totalCents, 14) + num(credits.length, 8)).padEnd(CPA005_RECORD_LENGTH, ' '));

  return { content: records.join('\r\n') + '\r\n', recordCount, totalCents };
}
