/**
 * The CRA's numbers for a business, and the rule that ties each account to its program.
 *
 * A Business Number is nine digits. Each CRA program account adds two letters that name the program
 * and a four-digit reference: RT for GST/HST, RP for payroll deductions, RC for corporate income
 * tax. The letters are not a choice: a GST/HST account that says RP is simply wrong, so the screens
 * fix the letters and the server refuses anything else. The nine digits of every program account
 * must be the company's own Business Number.
 */
export type CraProgram = 'RT' | 'RP' | 'RC';

export const CRA_PROGRAMS: Record<CraProgram, { label: string; field: 'hstNumber' | 'payrollNumber' | 'corporateTaxNumber' }> = {
  RT: { label: 'GST/HST account', field: 'hstNumber' },
  RP: { label: 'Payroll account', field: 'payrollNumber' },
  RC: { label: 'Corporate income tax account', field: 'corporateTaxNumber' },
};

/** Spaces, dashes and case removed: "123 456 789 rt 0001" → "123456789RT0001". */
export function compactCraNumber(value: string | null | undefined): string {
  return String(value ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

/** The nine digits, or null when blank. Anything else is not a Business Number. */
export function businessNumberProblem(value: string | null | undefined): string | null {
  const v = compactCraNumber(value);
  if (!v) return null;
  return /^\d{9}$/.test(v) ? null : 'The Business Number is 9 digits (for example 123456789).';
}

export function programAccountProblem(value: string | null | undefined, program: CraProgram): string | null {
  const v = compactCraNumber(value);
  if (!v) return null;
  if (new RegExp(`^\\d{9}${program}\\d{4}$`).test(v)) return null;
  return `The ${CRA_PROGRAMS[program].label} is the 9-digit Business Number, ${program}, then 4 digits (for example 123456789${program}0001).`;
}

export interface ProgramAccountParts { businessNumber: string; program: string; reference: string }

/** "123456789RT0001" → its parts; null when it is not shaped like a program account. */
export function parseProgramAccount(value: string | null | undefined): ProgramAccountParts | null {
  const m = /^(\d{9})([A-Z]{2})(\d{4})$/.exec(compactCraNumber(value));
  return m ? { businessNumber: m[1], program: m[2], reference: m[3] } : null;
}

/** A program account whose nine digits are not the company's Business Number, or null when they match. */
export function mismatchedBusinessNumber(businessNumber: string | null | undefined, account: string | null | undefined, program: CraProgram): string | null {
  const bn = compactCraNumber(businessNumber);
  const parts = parseProgramAccount(account);
  if (!bn || !parts || parts.businessNumber === bn) return null;
  return `The ${CRA_PROGRAMS[program].label} starts with ${parts.businessNumber}, but the Business Number is ${bn}. They must be the same nine digits.`;
}
