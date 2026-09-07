import { useMemo, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { calculatePay, ZERO_YTD_TOTALS } from '@shared/domain/payroll/calculatePay';
import {
  calculateIncomeTaxForSupportedProvince,
  SUPPORTED_AUTO_TAX_PROVINCE_NAMES,
  SUPPORTED_AUTO_TAX_PROVINCES,
  type SupportedAutoTaxProvince,
} from '@shared/domain/payroll/calculateIncomeTax';
import { REGISTERED_PLAN_LIMITS_2026 } from '@shared/domain/payroll/craIncomeTax2026';

// Canada's capital gains inclusion rate is 50% for individuals — the 2024 Budget proposal to raise
// it to 66.67% above a $250,000 annual threshold was deferred, then formally cancelled by the
// government on March 21, 2025, so 50% is the rate for every bracket, with no annual threshold.
const CAPITAL_GAINS_INCLUSION_RATE = 0.5;
import { computeFutureValue, computeRequiredMonthlyContribution } from '@shared/domain/tools/futureValue';
import { computeCmhcPremium, computeMinimumDownPaymentCents, type CmhcDownPaymentType } from '@shared/domain/tools/cmhcInsurance';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';

/** Whole-dollar rendering for the RRSP/FHSA limit hints (e.g. "$33,810"). */
function formatLimit(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA')}`;
}

interface LinkItem {
  label: string;
  description: string;
  url: string;
}

const USEFUL_LINKS: LinkItem[] = [
  { label: 'CRA Sign-In', description: 'My Account, My Business Account & Represent a Client (single sign-in)', url: 'https://www.canada.ca/en/revenue-agency/services/e-services/cra-login-services.html' },
  { label: 'My Account (Individuals)', description: "An individual's own personal tax and benefit information", url: 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-individuals/account-individuals.html' },
  { label: 'NETFILE (Personal T1)', description: 'File a personal income tax return online', url: 'https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/send-return/netfile.html' },
  { label: 'Corporation Internet Filing (T2)', description: 'File a corporate income tax return online', url: 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/corporation-internet-filing/about-corporation-internet-filing-service.html' },
  { label: 'File a GST/HST Return', description: 'How to file, GST/HST NETFILE and related deadlines', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return/how-file.html' },
  { label: 'GST/HST for Businesses', description: 'Registration, rates, and filing overview', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html' },
  { label: 'Record of Employment (ROE Web)', description: 'Create and submit a Record of Employment when an employee stops working or has an interruption of earnings', url: 'https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-roe/access-roe.html' },
  { label: 'CMHC Mortgage Loan Insurance', description: "CMHC's own premium calculator and mortgage loan insurance details", url: 'https://www.cmhc-schl.gc.ca/consumers/home-buying/mortgage-loan-insurance-for-consumers/cmhc-mortgage-loan-insurance-cost' },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-3 text-sm font-bold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

const HST_RATE_PRESETS: { label: string; rate: number }[] = [
  { label: 'HST 13% (ON)', rate: 13 },
  { label: 'US Tax 8%', rate: 8 },
  { label: 'GST 5%', rate: 5 },
];

function HstCalculator() {
  const [mode, setMode] = useState<'add' | 'extract'>('add');
  const [ratePreset, setRatePreset] = useState(13);
  const [customRate, setCustomRate] = useState('');
  const [amountCents, setAmountCents] = useState(0);

  const rate = customRate !== '' ? Number(customRate) : ratePreset;
  const validRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;

  const result = useMemo(() => {
    if (mode === 'add') {
      const tax = Math.round(amountCents * (validRate / 100));
      return { baseCents: amountCents, taxCents: tax, totalCents: amountCents + tax };
    }
    const baseCents = Math.round(amountCents / (1 + validRate / 100));
    return { baseCents, taxCents: amountCents - baseCents, totalCents: amountCents };
  }, [mode, amountCents, validRate]);

  return (
    <Card title="HST / Sales Tax Calculator">
      <div className="space-y-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('add')} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${mode === 'add' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            Add tax to a base amount
          </button>
          <button type="button" onClick={() => setMode('extract')} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${mode === 'extract' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            Extract tax from a total
          </button>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">{mode === 'add' ? 'Base amount (before tax)' : 'Total amount (tax included)'}</span>
          <div className="mt-1 w-40">
            <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
          </div>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {HST_RATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setRatePreset(p.rate);
                setCustomRate('');
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${customRate === '' && ratePreset === p.rate ? 'bg-gold-200 text-gold-800' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              {p.label}
            </button>
          ))}
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Custom %
            <input type="number" min={0} step="0.01" className="w-16 rounded border border-gray-300 px-1.5 py-1" value={customRate} onChange={(e) => setCustomRate(e.target.value)} />
          </label>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Base</span>
            <Money cents={result.baseCents} />
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Tax ({validRate}%)</span>
            <Money cents={result.taxCents} />
          </div>
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-800">
            <span>Total</span>
            <Money cents={result.totalCents} />
          </div>
        </div>
      </div>
    </Card>
  );
}

type EmploymentType = 'employed' | 'self-employed';

interface PersonTaxInputs {
  annualIncomeCents: number;
  capitalGainCents: number;
  employmentType: EmploymentType;
  rrspContributionCents: number;
  fhsaContributionCents: number;
}

interface PersonTaxResult {
  cppCents: number;
  eiCents: number;
  taxableCapitalGainCents: number;
  /** Income subject to tax BEFORE the RRSP/FHSA deduction — employment/business income plus the
   * taxable half of any capital gain. */
  totalTaxableIncomeCents: number;
  /** RRSP + FHSA, i.e. what comes off totalTaxableIncomeCents (never more than that income). */
  deductionCents: number;
  incomeTaxCents: number;
  /** What the tax would have been with no RRSP/FHSA contribution, minus the tax actually payable —
   * the refund/reduction the contribution buys at this person's marginal rate. */
  taxSavedCents: number;
  netCents: number;
  /** netCents less the cash actually put into the RRSP/FHSA — spendable cash left over. */
  netAfterContributionsCents: number;
}

// Canada taxes spouses on separate individual returns — there's no joint filing — so a jointly
// owned investment property's gain is reported as each spouse's own share (typically 50/50, per
// their ownership), each taxed against their own income and bracket. This computes one person's
// full result in isolation; the household total is just the sum of two calls.
function computePersonalTax(person: PersonTaxInputs, province: SupportedAutoTaxProvince): PersonTaxResult {
  const pay = calculatePay({
    profile: {
      payType: 'Salary',
      hourlyRateCents: null,
      annualSalaryCents: person.annualIncomeCents,
      payPeriodsPerYear: 1,
      vacationPayRate: 0,
      province,
      federalTotalClaimCents: null,
      provincialTotalClaimCents: null,
      additionalTaxCents: null,
    },
    ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
  });

  const cppCents =
    person.employmentType === 'self-employed'
      ? pay.cpp1EmployeeCents + pay.cpp1EmployerCents + pay.cpp2EmployeeCents + pay.cpp2EmployerCents
      : pay.cpp1EmployeeCents + pay.cpp2EmployeeCents;
  const eiCents = person.employmentType === 'self-employed' ? 0 : pay.eiEmployeeCents;

  // Capital gains are neither pensionable nor insurable — CPP/EI above stay based on employment
  // income alone. Only the 50%-inclusion taxable portion is added to taxable income for the tax
  // brackets; the other 50% is never taxed at all.
  const taxableCapitalGainCents = Math.round(person.capitalGainCents * CAPITAL_GAINS_INCLUSION_RATE);
  const totalTaxableIncomeCents = person.annualIncomeCents + taxableCapitalGainCents;

  // RRSP and FHSA contributions are deductions from net income (T1 lines 20800 / 20805), so they
  // reduce income tax only — CPP and EI above are levied on pensionable/insurable earnings and are
  // unaffected. Capped at total income since a deduction can't push taxable income below zero.
  const deductionCents = Math.min(person.rrspContributionCents + person.fhsaContributionCents, totalTaxableIncomeCents);

  function taxWithDeduction(annualDeductionsCents: number): number {
    const combinedTax = calculateIncomeTaxForSupportedProvince({
      province,
      payPeriodsPerYear: 1,
      periodGrossPayCents: totalTaxableIncomeCents,
      cpp1EmployeeCentsThisPeriod: pay.cpp1EmployeeCents,
      cpp2EmployeeCentsThisPeriod: pay.cpp2EmployeeCents,
      eiEmployeeCentsThisPeriod: pay.eiEmployeeCents,
      federalTotalClaimCents: null,
      provincialTotalClaimCents: null,
      additionalTaxCents: null,
      annualDeductionsCents,
    });
    return combinedTax?.totalTaxCentsThisPeriod ?? pay.incomeTaxCents;
  }

  const incomeTaxCents = taxWithDeduction(deductionCents);
  const taxSavedCents = deductionCents > 0 ? Math.max(0, taxWithDeduction(0) - incomeTaxCents) : 0;
  const netCents = person.annualIncomeCents + person.capitalGainCents - cppCents - eiCents - incomeTaxCents;

  return {
    cppCents,
    eiCents,
    taxableCapitalGainCents,
    totalTaxableIncomeCents,
    deductionCents,
    incomeTaxCents,
    taxSavedCents,
    netCents,
    netAfterContributionsCents: netCents - deductionCents,
  };
}

interface HouseholdPerson {
  id: number;
  label: string;
  annualIncomeCents: number;
  employmentType: EmploymentType;
  /** Share of the single household capital gain figure this person reports on their own return —
   * independently editable so an unequal ownership split (e.g. 70/30) is just as easy as 50/50. */
  gainSharePercent: number;
  rrspContributionCents: number;
  fhsaContributionCents: number;
}

let nextPersonId = 2;

function evenSplitPercents(count: number): number[] {
  const base = Math.floor(100 / count);
  const percents = new Array(count).fill(base);
  percents[count - 1] += 100 - base * count; // remainder to the last person, so it always sums to 100
  return percents;
}

function defaultLabelForIndex(i: number): string {
  if (i === 0) return 'You';
  if (i === 1) return 'Spouse';
  return `Person ${i + 1}`;
}

function PersonCard({
  person,
  showGainShare,
  totalGainCents,
  onChange,
  onRemove,
}: {
  person: HouseholdPerson;
  showGainShare: boolean;
  totalGainCents: number;
  onChange: (patch: Partial<HouseholdPerson>) => void;
  onRemove: (() => void) | null;
}) {
  const shareGainCents = Math.round(totalGainCents * (person.gainSharePercent / 100));
  // Advisory only — real RRSP room comes from the CRA Notice of Assessment (18% of LAST year's
  // earned income plus any carry-forward), so this flags the two obvious over-contribution shapes
  // without ever blocking the entry.
  const rrspOverLimit = person.rrspContributionCents > REGISTERED_PLAN_LIMITS_2026.rrspAnnualDollarLimitCents;
  const rrspOverEighteenPercent =
    person.annualIncomeCents > 0 && person.rrspContributionCents > Math.round(person.annualIncomeCents * REGISTERED_PLAN_LIMITS_2026.rrspEarnedIncomePercent);
  const fhsaOverLimit = person.fhsaContributionCents > REGISTERED_PLAN_LIMITS_2026.fhsaAnnualLimitCents;
  return (
    <div className="space-y-2 rounded border border-gray-100 bg-gray-50/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={person.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-32 rounded border border-transparent bg-transparent px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:border-gray-200 focus:border-gray-300 focus:bg-white"
        />
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-red-600">
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Annual employment/business income</span>
          <div className="mt-1">
            <CurrencyInput valueCents={person.annualIncomeCents} onChange={(cents) => onChange({ annualIncomeCents: cents })} />
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Employed / Self-Employed</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
            value={person.employmentType}
            onChange={(e) => onChange({ employmentType: e.target.value as EmploymentType })}
          >
            <option value="employed">Employed</option>
            <option value="self-employed">Self-Employed</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">RRSP contribution</span>
          <div className="mt-1">
            <CurrencyInput valueCents={person.rrspContributionCents} onChange={(cents) => onChange({ rrspContributionCents: cents })} />
          </div>
          {rrspOverLimit && (
            <span className="mt-1 block text-xs text-amber-600">
              Above the {formatLimit(REGISTERED_PLAN_LIMITS_2026.rrspAnnualDollarLimitCents)} 2026 limit — carried-forward room can allow more; check the Notice of Assessment.
            </span>
          )}
          {!rrspOverLimit && rrspOverEighteenPercent && (
            <span className="mt-1 block text-xs text-amber-600">
              Above 18% of this income — fine if unused room was carried forward, otherwise an over-contribution.
            </span>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">FHSA contribution</span>
          <div className="mt-1">
            <CurrencyInput valueCents={person.fhsaContributionCents} onChange={(cents) => onChange({ fhsaContributionCents: cents })} />
          </div>
          {fhsaOverLimit && (
            <span className="mt-1 block text-xs text-amber-600">
              Above the {formatLimit(REGISTERED_PLAN_LIMITS_2026.fhsaAnnualLimitCents)} annual limit ({formatLimit(REGISTERED_PLAN_LIMITS_2026.fhsaLifetimeLimitCents)} lifetime).
            </span>
          )}
        </label>
      </div>
      {showGainShare && (
        <label className="block text-sm">
          <span className="text-gray-600">Share of capital gain (%)</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              className="w-20 rounded border border-gray-300 px-2 py-1.5"
              value={person.gainSharePercent}
              onChange={(e) => onChange({ gainSharePercent: Number(e.target.value) || 0 })}
            />
            <span className="text-xs text-gray-500">
              = <Money cents={shareGainCents} /> taxable at 50% inclusion
            </span>
          </div>
        </label>
      )}
    </div>
  );
}

function PersonResultBox({ title, person, result }: { title: string; person: PersonTaxInputs; result: PersonTaxResult }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="flex justify-between text-gray-600">
        <span>Employment/business income</span>
        <Money cents={person.annualIncomeCents} />
      </div>
      {person.capitalGainCents > 0 && (
        <>
          <div className="flex justify-between text-gray-600">
            <span>Capital gain (this person's share)</span>
            <Money cents={person.capitalGainCents} />
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Taxable portion (50% inclusion)</span>
            <Money cents={result.taxableCapitalGainCents} />
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Total taxable income</span>
            <Money cents={result.totalTaxableIncomeCents} />
          </div>
        </>
      )}
      <div className="flex justify-between text-gray-600">
        <span>CPP {person.employmentType === 'self-employed' && '(both portions)'}</span>
        <Money cents={-result.cppCents} />
      </div>
      {person.employmentType === 'employed' && (
        <div className="flex justify-between text-gray-600">
          <span>EI</span>
          <Money cents={-result.eiCents} />
        </div>
      )}
      {result.deductionCents > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>Less RRSP/FHSA deduction</span>
          <Money cents={-result.deductionCents} />
        </div>
      )}
      <div className="flex justify-between text-gray-600">
        <span>Estimated income tax</span>
        <Money cents={-result.incomeTaxCents} />
      </div>
      {result.deductionCents > 0 && (
        <div className="flex justify-between text-emerald-700">
          <span>Tax saved by contributing</span>
          <Money cents={result.taxSavedCents} />
        </div>
      )}
      <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-800">
        <span>Estimated net</span>
        <Money cents={result.netCents} />
      </div>
      {result.deductionCents > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>Net after contributions</span>
          <Money cents={result.netAfterContributionsCents} />
        </div>
      )}
    </div>
  );
}

function TaxCalculator() {
  const [province, setProvince] = useState<SupportedAutoTaxProvince>('ON');
  const [totalGainCents, setTotalGainCents] = useState(0);
  const [people, setPeople] = useState<HouseholdPerson[]>([{ id: 1, label: 'You', annualIncomeCents: 0, employmentType: 'employed', gainSharePercent: 100, rrspContributionCents: 0, fhsaContributionCents: 0 }]);

  const multiPerson = people.length > 1;

  function addPerson() {
    setPeople((prev) => {
      const next = [...prev, { id: nextPersonId++, label: defaultLabelForIndex(prev.length), annualIncomeCents: 0, employmentType: 'employed' as EmploymentType, gainSharePercent: 0, rrspContributionCents: 0, fhsaContributionCents: 0 }];
      const shares = evenSplitPercents(next.length);
      return next.map((p, i) => ({ ...p, gainSharePercent: shares[i] }));
    });
  }

  function removePerson(id: number) {
    setPeople((prev) => {
      const next = prev.filter((p) => p.id !== id);
      const shares = evenSplitPercents(next.length);
      return next.map((p, i) => ({ ...p, gainSharePercent: shares[i] }));
    });
  }

  function updatePerson(id: number, patch: Partial<HouseholdPerson>) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  const totalSharePercent = people.reduce((sum, p) => sum + p.gainSharePercent, 0);

  const results = useMemo(
    () =>
      people.map((p) => {
        const capitalGainCents = multiPerson ? Math.round(totalGainCents * (p.gainSharePercent / 100)) : totalGainCents;
        const personInput: PersonTaxInputs = {
          annualIncomeCents: p.annualIncomeCents,
          capitalGainCents,
          employmentType: p.employmentType,
          rrspContributionCents: p.rrspContributionCents,
          fhsaContributionCents: p.fhsaContributionCents,
        };
        return { person: p, personInput, result: computePersonalTax(personInput, province) };
      }),
    // people is replaced (not mutated) on every change, so referencing it directly keeps this in sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, totalGainCents, province, multiPerson],
  );

  const householdNetCents = results.reduce((sum, r) => sum + r.result.netCents, 0);
  const householdTaxCents = results.reduce((sum, r) => sum + r.result.incomeTaxCents, 0);

  return (
    <Card title="Personal Income Tax Estimate">
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-gray-600">Capital gain (sale of property/stock) — total realized</span>
          <div className="mt-1 w-40">
            <CurrencyInput valueCents={totalGainCents} onChange={setTotalGainCents} />
          </div>
        </label>

        <div className="space-y-2">
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              showGainShare={multiPerson}
              totalGainCents={totalGainCents}
              onChange={(patch) => updatePerson(p.id, patch)}
              onRemove={people.length > 1 ? () => removePerson(p.id) : null}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={addPerson} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">
            + Add person
          </button>
          {multiPerson && totalSharePercent !== 100 && (
            <span className="text-xs text-amber-600">Gain shares total {totalSharePercent}%, not 100% — adjust so they add up.</span>
          )}
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Province</span>
          <select className="mt-1 w-40 rounded border border-gray-300 bg-white px-2 py-1.5" value={province} onChange={(e) => setProvince(e.target.value as SupportedAutoTaxProvince)}>
            {SUPPORTED_AUTO_TAX_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {SUPPORTED_AUTO_TAX_PROVINCE_NAMES[p]}
              </option>
            ))}
          </select>
        </label>

        {multiPerson ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {results.map(({ person, personInput, result }) => (
              <PersonResultBox key={person.id} title={person.label} person={personInput} result={result} />
            ))}
          </div>
        ) : (
          <PersonResultBox title={results[0].person.label} person={results[0].personInput} result={results[0].result} />
        )}

        {multiPerson && (
          <div className="rounded border border-brand-200 bg-brand-50 p-3 text-sm">
            <div className="flex justify-between text-brand-800">
              <span>Household combined income tax</span>
              <span className="font-medium">
                <Money cents={-householdTaxCents} />
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-brand-200 pt-1 font-bold text-brand-900">
              <span>Household combined net</span>
              <Money cents={householdNetCents} />
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400">
          Planning estimate only. Actual tax depends on each person's complete tax situation and may differ from this estimate. Verify the final
          amounts before filing.
        </p>
      </div>
    </Card>
  );
}

function RetirementCalculator() {
  const [mode, setMode] = useState<'futureValue' | 'targetAmount'>('futureValue');
  const [startingAmountCents, setStartingAmountCents] = useState(0);
  const [monthlyContributionCents, setMonthlyContributionCents] = useState(0);
  const [targetAmountCents, setTargetAmountCents] = useState(0);
  const [annualRatePercent, setAnnualRatePercent] = useState('6');
  const [years, setYears] = useState('20');

  const rate = Number(annualRatePercent) || 0;
  const yearsNum = Number(years) || 0;

  const fvResult = useMemo(
    () => computeFutureValue({ startingAmountCents, monthlyContributionCents, annualRatePercent: rate, years: yearsNum }),
    [startingAmountCents, monthlyContributionCents, rate, yearsNum],
  );
  const requiredMonthly = useMemo(
    () => computeRequiredMonthlyContribution({ targetAmountCents, startingAmountCents, annualRatePercent: rate, years: yearsNum }),
    [targetAmountCents, startingAmountCents, rate, yearsNum],
  );

  return (
    <Card title="Retirement / Future Value Calculator">
      <div className="space-y-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('futureValue')} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${mode === 'futureValue' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            What will my savings grow to?
          </button>
          <button type="button" onClick={() => setMode('targetAmount')} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${mode === 'targetAmount' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            What do I need to save monthly for a target?
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Starting amount</span>
            <div className="mt-1">
              <CurrencyInput valueCents={startingAmountCents} onChange={setStartingAmountCents} />
            </div>
          </label>
          {mode === 'futureValue' ? (
            <label className="block text-sm">
              <span className="text-gray-600">Monthly contribution</span>
              <div className="mt-1">
                <CurrencyInput valueCents={monthlyContributionCents} onChange={setMonthlyContributionCents} />
              </div>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600">Target amount</span>
              <div className="mt-1">
                <CurrencyInput valueCents={targetAmountCents} onChange={setTargetAmountCents} />
              </div>
            </label>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Annual growth rate (%)</span>
            <input type="number" min={0} step="0.1" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={annualRatePercent} onChange={(e) => setAnnualRatePercent(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Years</span>
            <input type="number" min={0} step="1" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={years} onChange={(e) => setYears(e.target.value)} />
          </label>
        </div>
        {mode === 'futureValue' ? (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Total contributed</span>
              <Money cents={fvResult.totalContributedCents} />
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Growth</span>
              <Money cents={fvResult.totalGrowthCents} />
            </div>
            <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-800">
              <span>Future value</span>
              <Money cents={fvResult.futureValueCents} />
            </div>
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex justify-between font-bold text-gray-800">
              <span>Required monthly contribution</span>
              <Money cents={requiredMonthly} />
            </div>
            {requiredMonthly === 0 && <p className="mt-1 text-xs text-gray-500">The starting amount alone is projected to reach the target.</p>}
          </div>
        )}
        <p className="text-xs text-gray-400">Standard compound-interest math, monthly compounding — a planning estimate, not investment advice.</p>
      </div>
    </Card>
  );
}

function CmhcCalculator() {
  const [purchasePriceCents, setPurchasePriceCents] = useState(0);
  const [downPaymentCents, setDownPaymentCents] = useState(0);
  const [downPaymentType, setDownPaymentType] = useState<CmhcDownPaymentType>('traditional');
  const [amortizationYears, setAmortizationYears] = useState<25 | 30>(25);
  const [isFirstTimeBuyerOrNewBuild, setIsFirstTimeBuyerOrNewBuild] = useState(false);

  const minimumDownPaymentCents = useMemo(() => computeMinimumDownPaymentCents(purchasePriceCents), [purchasePriceCents]);
  const result = useMemo(
    () => computeCmhcPremium({ purchasePriceCents, downPaymentCents, downPaymentType, amortizationYears, isFirstTimeBuyerOrNewBuild }),
    [purchasePriceCents, downPaymentCents, downPaymentType, amortizationYears, isFirstTimeBuyerOrNewBuild],
  );

  return (
    <Card title="CMHC Mortgage Loan Insurance Calculator">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Purchase price</span>
            <div className="mt-1">
              <CurrencyInput valueCents={purchasePriceCents} onChange={setPurchasePriceCents} />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Down payment</span>
            <div className="mt-1">
              <CurrencyInput valueCents={downPaymentCents} onChange={setDownPaymentCents} />
            </div>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Minimum required down payment: <Money cents={minimumDownPaymentCents} className="font-medium" /> (5% on the first $500,000, 10% on the portion up to $1,500,000)
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Down payment source</span>
            <select className="mt-1 w-48 rounded border border-gray-300 bg-white px-2 py-1.5" value={downPaymentType} onChange={(e) => setDownPaymentType(e.target.value as CmhcDownPaymentType)}>
              <option value="traditional">Traditional (savings, sale proceeds, gift)</option>
              <option value="nonTraditional">Non-traditional (borrowed)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Amortization</span>
            <select className="mt-1 w-32 rounded border border-gray-300 bg-white px-2 py-1.5" value={amortizationYears} onChange={(e) => setAmortizationYears(Number(e.target.value) as 25 | 30)}>
              <option value={25}>25 years</option>
              <option value={30}>30 years</option>
            </select>
          </label>
        </div>
        {amortizationYears === 30 && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={isFirstTimeBuyerOrNewBuild} onChange={(e) => setIsFirstTimeBuyerOrNewBuild(e.target.checked)} />
            First-time buyer or new-build purchase (required for 30-year amortization)
          </label>
        )}
        {result.eligibleForInsurance ? (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Loan amount</span>
              <Money cents={result.loanAmountCents} />
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Loan-to-value</span>
              <span>{result.loanToValuePercent.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>
                Premium rate {result.surchargeApplied && `(${result.baseRatePercent.toFixed(2)}% + ${result.surchargePercent.toFixed(2)}% surcharge)`}
              </span>
              <span>{result.totalRatePercent.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between font-medium text-gray-800">
              <span>Insurance premium</span>
              <Money cents={result.premiumCents} />
            </div>
            <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-800">
              <span>Total mortgage (loan + premium)</span>
              <Money cents={result.totalMortgageCents} />
            </div>
          </div>
        ) : (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{result.ineligibleReason}</div>
        )}
        <p className="text-xs text-gray-400">
          Based on CMHC's published standard premium schedule. Premiums are subject to PST in Ontario, Quebec, and Saskatchewan (charged separately, not
          financed). Confirm final figures with your lender or the{' '}
          <a href="https://www.cmhc-schl.gc.ca/consumers/home-buying/calculators/mortgage-loan-insurance-premium-calculator" target="_blank" rel="noreferrer" className="underline">
            CMHC premium calculator
          </a>
          .
        </p>
      </div>
    </Card>
  );
}

export function ToolsPage() {
  const setView = useUiStore((s) => s.setView);
  return (
    <div className="w-full space-y-3">
      <BackButton fallback={{ kind: 'companySettings' }} fallbackLabel="Settings" />
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-brand-900">Tools &amp; Useful Links</h1>
          <p className="text-sm text-gray-500">Quick calculators and shortcuts to the CRA services you'll use most.</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-900">Useful Links</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {USEFUL_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-gray-200 bg-white p-3 text-sm hover:border-brand-300 hover:bg-brand-50"
            >
              <div className="font-medium text-brand-700">{link.label}</div>
              <div className="mt-0.5 text-xs text-gray-500">{link.description}</div>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-900">Calculators</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <HstCalculator />
          <TaxCalculator />
          <RetirementCalculator />
          <CmhcCalculator />
        </div>
      </section>
    </div>
  );
}
