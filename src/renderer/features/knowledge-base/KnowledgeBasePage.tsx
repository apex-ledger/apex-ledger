import { useUiStore } from '../../app/store/uiStore';
import { BackButton } from '../../components/BackButton';
import {
  ALBERTA_BRACKETS_2026,
  BRITISH_COLUMBIA_BRACKETS_2026,
  FEDERAL_BRACKETS_2026,
  MANITOBA_BRACKETS_2026,
  NEW_BRUNSWICK_BRACKETS_2026,
  NOVA_SCOTIA_BRACKETS_2026,
  ONTARIO_BRACKETS_2026,
  SASKATCHEWAN_BRACKETS_2026,
  type TaxBracket,
} from '@shared/domain/payroll/craIncomeTax2026';

// The tax year these figures were pulled for. Bump this (and every figure below) each January
// when CRA publishes the new indexed amounts — the CRA link on every card is the fallback for
// whatever gap exists between a new year starting and this file being updated.
const FIGURES_TAX_YEAR = 2026;

interface FigureItem {
  label: string;
  figure: string;
  figureNote?: string;
}

// Real dollar figures for the current tax year, sourced from CRA's own published numbers.
// Bump FIGURES_TAX_YEAR and every value below each January when CRA publishes new indexed amounts.
const ANNUAL_LIMIT_FIGURES: FigureItem[] = [
  { label: 'RRSP Dollar Limit', figure: '$33,810', figureNote: '2025 was $32,490' },
  { label: 'TFSA Annual Limit', figure: '$7,000', figureNote: 'cumulative room since 2009: $109,000' },
  { label: 'Basic Personal Amount (Federal)', figure: '$16,452', figureNote: 'phases down to $14,829 above $258,482 net income' },
  { label: 'CPP Basic Exemption', figure: '$3,500' },
  { label: 'CPP Maximum Pensionable Earnings (YMPE)', figure: '$74,600', figureNote: '2025 was $71,300' },
  { label: 'CPP Contribution Rate', figure: '5.95%', figureNote: 'employee and employer, each' },
  { label: 'CPP Maximum Contribution', figure: '$4,230.45', figureNote: 'employee and employer, each' },
  { label: 'CPP2 Earnings Ceiling (YAMPE)', figure: '$85,000', figureNote: 'CPP2 applies on earnings from $74,600 to $85,000' },
  { label: 'CPP2 Contribution Rate', figure: '4.00%', figureNote: 'employee and employer, each' },
  { label: 'CPP2 Maximum Contribution', figure: '$416.00', figureNote: 'employee and employer, each' },
  { label: 'EI Maximum Insurable Earnings', figure: '$68,900', figureNote: '2025 was $65,700' },
  { label: 'EI Employee Premium Rate', figure: '1.63%', figureNote: 'Quebec: 1.30%' },
  { label: 'EI Maximum Employee Premium', figure: '$1,123.07', figureNote: 'Quebec: $895.70' },
  { label: 'EI Employer Premium Rate', figure: '2.28%', figureNote: '1.4× employee rate · Quebec: 1.82%' },
  { label: 'EI Maximum Employer Premium', figure: '$1,572.30' },
];

const FIGURE_SOURCE_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html';

const TAX_BRACKET_SOURCE_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html';

// Read straight from the same bracket tables the payroll engine uses to withhold tax
// (craIncomeTax2026.ts), rather than retyped here — so these can never drift out of step with what
// the app actually calculates, and next January's update happens in exactly one place.
const BRACKET_TABLES: { jurisdiction: string; brackets: TaxBracket[] }[] = [
  { jurisdiction: 'Federal', brackets: FEDERAL_BRACKETS_2026 },
  { jurisdiction: 'Ontario', brackets: ONTARIO_BRACKETS_2026 },
  { jurisdiction: 'British Columbia', brackets: BRITISH_COLUMBIA_BRACKETS_2026 },
  { jurisdiction: 'Alberta', brackets: ALBERTA_BRACKETS_2026 },
  { jurisdiction: 'Saskatchewan', brackets: SASKATCHEWAN_BRACKETS_2026 },
  { jurisdiction: 'Manitoba', brackets: MANITOBA_BRACKETS_2026 },
  { jurisdiction: 'New Brunswick', brackets: NEW_BRUNSWICK_BRACKETS_2026 },
  { jurisdiction: 'Nova Scotia', brackets: NOVA_SCOTIA_BRACKETS_2026 },
];

function wholeDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA')}`;
}

/** "Up to $58,523" / "$58,523 – $117,045" / "Over $258,482" — each bracket runs from its own
 * threshold up to the next one's, and the top bracket has no ceiling. */
function bracketRange(brackets: TaxBracket[], i: number): string {
  const from = brackets[i].thresholdCents;
  const next = brackets[i + 1];
  if (i === 0) return `Up to ${wholeDollars(next ? next.thresholdCents : from)}`;
  if (!next) return `Over ${wholeDollars(from)}`;
  return `${wholeDollars(from)} – ${wholeDollars(next.thresholdCents)}`;
}

function BracketTable({ jurisdiction, brackets }: { jurisdiction: string; brackets: TaxBracket[] }) {
  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">{jurisdiction}</div>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {brackets.map((bracket, i) => (
            <tr key={bracket.thresholdCents} className={i > 0 ? 'border-t border-gray-100' : ''}>
              <td className="px-3 py-1.5 text-gray-700">{bracketRange(brackets, i)}</td>
              <td className="px-3 py-1.5 text-right font-semibold text-brand-700">{(bracket.rate * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GST_HST_REFERENCE_LINKS: { label: string; description: string; url: string }[] = [
  {
    label: 'GST/HST Exempt Supplies (Definitions)',
    description: "CRA's own definition of an exempt supply, and how it differs from zero-rated",
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/definitions-gst-hst.html',
  },
  {
    label: 'RC4022 — General Information for GST/HST Registrants',
    description: 'The full guide, including the complete list of exempt and zero-rated goods and services',
    url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html',
  },
];

// A quick-reference summary of expense categories that commonly carry NO GST/HST — cross-checked
// against CRA's RC4022 guide and the GST/HST definitions page above (both linked, since this is
// the kind of list that has real edge cases an accountant should verify against the source, not
// just trust a summary card for). This is the "why does this app's HST calculation show $0 tax on
// this expense" answer for the categories that come up most in day-to-day bookkeeping — not
// exhaustive coverage of every exempt/zero-rated supply CRA recognizes.
const HST_EXEMPT_EXPENSE_CATEGORIES: { category: string; note: string }[] = [
  { category: 'Bank charges & financial services', note: 'Account fees, interest charged, loan arrangement — most financial services are GST/HST-exempt.' },
  { category: 'Insurance premiums', note: 'Business, life, and most other insurance premiums (insurance is a financial service, not a taxable supply).' },
  { category: 'Residential rent', note: 'Long-term residential rent (one month or more) and residential condo fees — commercial rent IS taxable.' },
  { category: 'Most health, medical & dental services', note: 'Services from a licensed physician, dentist, or nurse — but medical supplies/equipment can still be taxable.' },
  { category: 'Basic groceries', note: 'Unprocessed/basic food items — prepared food, snacks, and restaurant meals ARE taxable.' },
  { category: 'Childcare services', note: 'Regulated childcare, primarily for children 14 and under.' },
  { category: 'Most educational services', note: "Tuition leading to a certificate/diploma from a school authority — professional development courses often ARE taxable." },
  { category: 'Legal aid services', note: 'Legal aid specifically — ordinary legal fees from a private lawyer ARE taxable.' },
  { category: 'Municipal public transit', note: 'Bus, subway, and other municipal transit fares.' },
];

function LinkCard({ link }: { link: { label: string; description: string; url: string } }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="rounded border border-gray-200 bg-white p-3 text-sm hover:border-brand-300 hover:bg-brand-50"
    >
      <div className="font-medium text-brand-700">{link.label}</div>
      <div className="mt-0.5 text-xs text-gray-500">{link.description}</div>
    </a>
  );
}

export function KnowledgeBasePage() {
  const setView = useUiStore((s) => s.setView);
  return (
    <div className="max-w-5xl space-y-3">
      <BackButton fallback={{ kind: 'companySettings' }} fallbackLabel="Settings" />
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-brand-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500">Quick answers, with real {FIGURES_TAX_YEAR} figures from CRA.</p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Annual Limits &amp; Thresholds ({FIGURES_TAX_YEAR})</h2>
          <a href={FIGURE_SOURCE_URL} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
            Verify on CRA →
          </a>
        </div>
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {ANNUAL_LIMIT_FIGURES.map((item, i) => (
                <tr key={item.label} className={i > 0 ? 'border-t border-gray-100' : ''}>
                  <td className="px-3 py-2 text-gray-700">{item.label}</td>
                  <td className="px-3 py-2 text-right font-semibold text-brand-700">{item.figure}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{item.figureNote ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Income Tax Brackets ({FIGURES_TAX_YEAR})</h2>
          <a href={TAX_BRACKET_SOURCE_URL} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
            Verify on CRA →
          </a>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BRACKET_TABLES.map((table) => (
            <BracketTable key={table.jurisdiction} jurisdiction={table.jurisdiction} brackets={table.brackets} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-900">Which Expenses Don't Have GST/HST</h2>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="mb-3 text-xs text-gray-500">
            A quick-reference summary of common expense categories that carry no GST/HST, so a $0 tax amount on one of these in Quick Entry, Bills, or
            Bank Import is expected — not a bug. Real classification has edge cases (e.g. commercial vs. residential rent), so verify against CRA's own
            guide below before relying on it for a filing.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {HST_EXEMPT_EXPENSE_CATEGORIES.map((item) => (
              <div key={item.category} className="rounded border border-gray-100 bg-gray-50 p-2.5">
                <div className="text-sm font-medium text-gray-800">{item.category}</div>
                <div className="mt-0.5 text-xs text-gray-500">{item.note}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GST_HST_REFERENCE_LINKS.map((link) => (
            <LinkCard key={link.url} link={link} />
          ))}
        </div>
      </section>
    </div>
  );
}
