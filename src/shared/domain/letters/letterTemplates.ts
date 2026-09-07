/**
 * Standard-form letters that accompany a set of financial statements or a year-end file — the
 * equivalent of QuickBooks Online Accountant's "Add a letter" library.
 *
 * IMPORTANT on the compilation report: QBO's library still lists a "Notice to Reader", but that
 * communication was retired in Canada. CSRS 4200 Compilation Engagements is effective for compiled
 * financial information for periods ending on or after December 14, 2021 and replaced the old
 * Section 9200 Notice to Reader with a Compilation Engagement Report — which, unlike its
 * predecessor, must state the basis of accounting applied and set out both management's and the
 * practitioner's responsibilities. This library therefore ships the current report, and deliberately
 * does not offer a Notice to Reader for a current-year engagement.
 *
 * The wording below is standard-form drafting written for this app, not a verbatim copy of any
 * publisher's template. It captures the elements each communication is required to cover, and every
 * letter is a starting point the practitioner is expected to read, tailor, and take responsibility
 * for — see `practitionerReviewRequired`.
 */

export type LetterFieldKey =
  | 'clientName'
  | 'periodEnd'
  | 'periodStart'
  | 'firmName'
  | 'practitionerName'
  | 'letterDate'
  | 'basisOfAccounting'
  | 'city';

export interface LetterField {
  key: LetterFieldKey;
  label: string;
  /** Prefilled from the company file where possible; the rest the practitioner types once. */
  placeholder?: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  description: string;
  /** The authority this communication comes from, shown so the user knows what they're sending. */
  standard: string | null;
  fields: LetterFieldKey[];
  /** Paragraphs. `{{fieldKey}}` placeholders are substituted by renderLetter. A blank string is a
   * deliberate paragraph break; a line starting with '# ' is a heading. */
  body: string[];
  /** True for anything that carries professional responsibility and must not be sent as-is. */
  practitionerReviewRequired: boolean;
}

export const LETTER_FIELDS: Record<LetterFieldKey, LetterField> = {
  clientName: { key: 'clientName', label: 'Client / company name' },
  periodStart: { key: 'periodStart', label: 'Period start' },
  periodEnd: { key: 'periodEnd', label: 'Period end' },
  firmName: { key: 'firmName', label: 'Your firm name' },
  practitionerName: { key: 'practitionerName', label: 'Practitioner name' },
  letterDate: { key: 'letterDate', label: 'Letter date' },
  basisOfAccounting: {
    key: 'basisOfAccounting',
    label: 'Basis of accounting',
    placeholder: 'e.g. the historical cost basis, on an accrual basis',
  },
  city: { key: 'city', label: 'City' },
};

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: 'compilation-engagement-report',
    name: 'Compilation Engagement Report',
    description:
      'The report that accompanies compiled financial information under CSRS 4200 — replaced the old Notice to Reader for periods ending on or after December 14, 2021.',
    standard: 'CSRS 4200',
    fields: ['clientName', 'periodEnd', 'basisOfAccounting', 'firmName', 'practitionerName', 'city', 'letterDate'],
    practitionerReviewRequired: true,
    body: [
      '# COMPILATION ENGAGEMENT REPORT',
      'To Management of {{clientName}}',
      'On the basis of information provided by management, we have compiled the balance sheet of {{clientName}} as at {{periodEnd}} and the statements of income and retained earnings for the period then ended, and a summary of significant accounting policies.',
      'Management is responsible for the accompanying financial information, including determining that the basis of accounting used is acceptable for its intended purpose. The financial information has been compiled using {{basisOfAccounting}}. We have applied our expertise in accounting and financial reporting to assist management in the preparation of this financial information.',
      'We performed this engagement in accordance with Canadian Standard on Related Services (CSRS) 4200, Compilation Engagements, which requires us to comply with relevant ethical requirements. Our responsibility is to assist management in the preparation of the financial information.',
      'We have not performed an audit engagement or a review engagement on the financial information and, accordingly, we express no assurance on it.',
      'Readers are cautioned that the financial information may not be appropriate for their purposes.',
      '',
      '{{firmName}}',
      '{{practitionerName}}',
      '{{city}}',
      '{{letterDate}}',
    ],
  },
  {
    id: 'engagement-letter-compilation',
    name: 'Engagement Letter — Compilation',
    description: 'Sets out the scope, the basis of accounting, and who is responsible for what, before the work begins.',
    standard: 'CSRS 4200',
    fields: ['clientName', 'periodStart', 'periodEnd', 'basisOfAccounting', 'firmName', 'practitionerName', 'letterDate'],
    practitionerReviewRequired: true,
    body: [
      '# ENGAGEMENT LETTER',
      '{{letterDate}}',
      'To Management of {{clientName}}',
      'This letter confirms the terms of our engagement to compile the financial information of {{clientName}} for the period from {{periodStart}} to {{periodEnd}}.',
      '# Our responsibilities',
      'We will compile the financial information on the basis of information you provide, applying our expertise in accounting and financial reporting to assist you in its preparation. We will perform the engagement in accordance with CSRS 4200, Compilation Engagements, and will comply with relevant ethical requirements. We will not perform an audit or a review, and will express no assurance on the financial information.',
      'Our report will state that the financial information was compiled using {{basisOfAccounting}}, and will include a caution that the financial information may not be appropriate for the reader’s purposes.',
      '# Your responsibilities',
      'You are responsible for the financial information, for the completeness and accuracy of the records and information you provide to us, and for determining that {{basisOfAccounting}} is an acceptable basis of accounting for the intended use of the financial information. You are also responsible for identifying any third party who will be using the financial information, and for the accuracy of the underlying records.',
      '# Fees and other terms',
      'Our fees will be based on the time required at our standard rates, plus disbursements. Either party may terminate this engagement on written notice.',
      'Please confirm your agreement with these terms by signing below.',
      '',
      '{{firmName}}',
      '{{practitionerName}}',
      '',
      'Agreed on behalf of {{clientName}}:',
      'Signature: ______________________________    Date: ______________',
    ],
  },
  {
    id: 'management-representation-letter',
    name: 'Management Representation Letter',
    description: 'The written confirmations management provides at the end of the engagement — records provided, completeness, subsequent events.',
    standard: null,
    fields: ['clientName', 'periodStart', 'periodEnd', 'firmName', 'letterDate'],
    practitionerReviewRequired: true,
    body: [
      '# MANAGEMENT REPRESENTATION LETTER',
      '{{letterDate}}',
      'To {{firmName}}',
      'This representation letter is provided in connection with your compilation of the financial information of {{clientName}} for the period from {{periodStart}} to {{periodEnd}}.',
      'We confirm, to the best of our knowledge and belief, the following:',
      '1. We have provided you with all of the accounting records and supporting information relevant to the period, and access to all relevant personnel.',
      '2. All transactions of the period have been recorded in the accounting records and are reflected in the financial information.',
      '3. We are responsible for the financial information, and we have determined that the basis of accounting used is acceptable for its intended purpose.',
      '4. All liabilities, whether actual or contingent, and all commitments and guarantees, have been disclosed to you.',
      '5. Related party transactions and balances have been disclosed to you.',
      '6. No events have occurred after the period end that would require adjustment to, or disclosure in, the financial information, other than those already disclosed to you.',
      '7. We are not aware of any fraud, suspected fraud, or non-compliance with laws and regulations affecting the entity.',
      '',
      'On behalf of {{clientName}}:',
      'Signature: ______________________________    Position: ______________    Date: ______________',
    ],
  },
  {
    id: 'notes-to-financial-statements',
    name: 'Notes to the Financial Statements',
    description: 'A skeleton of the disclosure notes, with the headings a compiled or review-level set of statements normally carries.',
    standard: null,
    fields: ['clientName', 'periodEnd', 'basisOfAccounting'],
    practitionerReviewRequired: true,
    body: [
      '# NOTES TO THE FINANCIAL STATEMENTS',
      '{{clientName}} — for the period ended {{periodEnd}}',
      '# 1. Basis of accounting',
      'These financial statements have been prepared using {{basisOfAccounting}}. They may not be appropriate for purposes other than those for which they were prepared.',
      '# 2. Nature of operations',
      '[Describe what the entity does, where it operates, and its date and jurisdiction of incorporation.]',
      '# 3. Significant accounting policies',
      '[Revenue recognition; measurement of accounts receivable; inventory basis; amortization methods and rates by asset class; income taxes; use of estimates.]',
      '# 4. Capital assets',
      '[Cost, accumulated amortization, and net book value by class.]',
      '# 5. Long-term debt',
      '[Terms, interest rates, maturity, security given, and principal repayments due in each of the next five years.]',
      '# 6. Related party transactions',
      '[Nature of the relationship, the amounts, and the measurement basis. Include shareholder loan balances and terms.]',
      '# 7. Income taxes',
      '[Amounts payable or recoverable; any losses carried forward and their expiry.]',
      '# 8. Commitments and contingencies',
      '[Leases, guarantees, and any claims outstanding.]',
      '# 9. Subsequent events',
      '[Events between the period end and the date the statements were available to be issued.]',
      '',
      '[Delete any heading that does not apply, and add disclosures specific to this client. This is a starting skeleton, not a complete set of disclosures.]',
    ],
  },
  {
    id: 'client-year-end-letter',
    name: 'Client Year-End Letter',
    description: 'The covering letter that goes to the client with the finished statements, listing what is enclosed and what they need to do next.',
    standard: null,
    fields: ['clientName', 'periodEnd', 'firmName', 'practitionerName', 'letterDate'],
    practitionerReviewRequired: false,
    body: [
      '{{letterDate}}',
      'Dear {{clientName}},',
      'Enclosed are the financial statements for the period ended {{periodEnd}}, together with our compilation engagement report.',
      'Please review the statements. If anything does not agree with your understanding of the business, let us know before we file anything on your behalf.',
      '# What we need from you',
      '• Confirmation that you have reviewed and approved the enclosed statements',
      '• The signed management representation letter',
      '• Any documents still outstanding from our request list',
      '# Upcoming deadlines',
      '• Corporate tax return: due six months after the period end',
      '• Any balance of tax owing: due two or three months after the period end depending on the corporation — we will confirm which applies',
      'Please get in touch if you would like to go through any of this together.',
      '',
      'Yours truly,',
      '{{firmName}}',
      '{{practitionerName}}',
    ],
  },
];

export function findLetterTemplate(id: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.id === id);
}

/**
 * Substitutes `{{field}}` placeholders. Any field left blank renders as a visible underscore blank
 * rather than an empty gap or a stray `{{clientName}}` — a letter with an obvious blank to fill in
 * is safe to print; one with template syntax showing, or a silently missing name, is not.
 */
export function renderLetter(template: LetterTemplate, values: Partial<Record<LetterFieldKey, string>>): string[] {
  return template.body.map((paragraph) =>
    paragraph.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = values[key as LetterFieldKey];
      return value && value.trim() !== '' ? value.trim() : '____________';
    }),
  );
}

/** Fields a letter still needs before it reads as finished — drives the "N blanks remaining" hint. */
export function missingLetterFields(template: LetterTemplate, values: Partial<Record<LetterFieldKey, string>>): LetterFieldKey[] {
  return template.fields.filter((key) => {
    const value = values[key];
    return !value || value.trim() === '';
  });
}
