/** The three editions of this app, what each one includes, and the limits that go with it.
 *
 * Two things are being expressed here at once, deliberately:
 *   - which FEATURES an edition contains (payroll, CRM, inventory, and so on), and
 *   - what LIMITS it carries (how many companies, whether cloud backup is available).
 *
 * Both live in one table so there is a single place to answer "what does this customer get", rather
 * than a feature check in one file and a company-count check in another that drift apart the first
 * time an edition changes.
 *
 * Everything is pure data plus two lookups. No UI, no IPC, no licence-key parsing — so the mapping
 * can be read, argued with, and tested on its own, and moving a feature between editions is a
 * one-line change here rather than a hunt through the screens.
 */

export type Edition = 'full' | 'booksInventory' | 'booksPayroll';

/** Every gateable capability. Kept coarse on purpose: gating individual screens produces a licence
 * matrix nobody can reason about, and a customer who paid for payroll expects all of payroll. */
export type Feature =
  | 'bookkeeping'
  | 'payroll'
  | 'crm'
  | 'inventory'
  | 'invoicing'
  | 'accountantTools'
  | 'multiCompany'
  | 'cloudBackup';

export interface EditionLimits {
  /** How many company files can be opened. null means no limit. */
  maxCompanies: number | null;
}

export interface EditionDefinition {
  edition: Edition;
  label: string;
  /** One line for the licence screen and the upgrade prompt. */
  summary: string;
  features: Feature[];
  limits: EditionLimits;
}

export const EDITIONS: EditionDefinition[] = [
  {
    edition: 'full',
    label: 'Full',
    summary: 'Everything: bookkeeping, payroll, inventory, invoicing, client management, and the accountant tools.',
    features: [
      'bookkeeping',
      'payroll',
      'crm',
      'inventory',
      'invoicing',
      'accountantTools',
      'multiCompany',
      'cloudBackup',
    ],
    limits: { maxCompanies: null },
  },
  {
    edition: 'booksInventory',
    label: 'Books & Inventory',
    summary: 'Bookkeeping, inventory, and invoicing. No payroll and no client management.',
    // Invoicing stays: billing a customer is accounts receivable, which is core bookkeeping, not
    // the client-relationship module. 'crm' here means the Client Management side — tracking
    // clients, their deadlines and reminders — which is what this edition leaves out.
    features: ['bookkeeping', 'inventory', 'invoicing', 'accountantTools', 'cloudBackup'],
    limits: { maxCompanies: 3 },
  },
  {
    edition: 'booksPayroll',
    label: 'Books & Payroll',
    summary: 'Bookkeeping and payroll, including T4s and source deductions. No inventory and no client management.',
    features: ['bookkeeping', 'payroll', 'invoicing', 'accountantTools', 'cloudBackup'],
    limits: { maxCompanies: 3 },
  },
];

const BY_EDITION = new Map(EDITIONS.map((e) => [e.edition, e]));

/** Falls back to the most restricted edition for anything unrecognised, so a corrupt or future
 * licence value fails closed rather than unlocking the lot. */
const FALLBACK: Edition = 'booksPayroll';

export function editionDefinition(edition: Edition | null | undefined): EditionDefinition {
  return BY_EDITION.get(edition ?? FALLBACK) ?? BY_EDITION.get(FALLBACK)!;
}

export function hasFeature(edition: Edition | null | undefined, feature: Feature): boolean {
  return editionDefinition(edition).features.includes(feature);
}

export function editionLimits(edition: Edition | null | undefined): EditionLimits {
  return editionDefinition(edition).limits;
}

/** Resolves the edition named in a licence key.
 *
 * Two different unknowns, treated differently on purpose:
 *   - No edition at all means the key was issued before editions existed. Those customers bought
 *     the app when it was one product with everything in it, so they keep everything.
 *   - An edition string that is not recognised means a corrupt key, or one from a newer version.
 *     That fails closed to the most restricted edition rather than unlocking the lot.
 */
export function editionFromLicense(value: string | null | undefined): Edition {
  if (value == null || value === '') return 'full';
  return BY_EDITION.has(value as Edition) ? (value as Edition) : FALLBACK;
}

/** The editions that would give access to a feature the current one lacks — what an upgrade prompt
 * should offer, rather than a bare "not available". */
export function editionsWith(feature: Feature): EditionDefinition[] {
  return EDITIONS.filter((e) => e.features.includes(feature));
}

/** Human wording for a blocked feature, used wherever something is gated. */
export const FEATURE_LABELS: Record<Feature, string> = {
  bookkeeping: 'Bookkeeping',
  payroll: 'Payroll',
  crm: 'Client management',
  inventory: 'Inventory',
  invoicing: 'Invoicing',
  accountantTools: 'Accountant tools',
  multiCompany: 'Unlimited companies',
  cloudBackup: 'Cloud backup',
};
