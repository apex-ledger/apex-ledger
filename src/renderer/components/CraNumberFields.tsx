import { businessNumberDigits, compactCraNumber, CRA_PROGRAMS, mismatchedBusinessNumber, parseProgramAccount, type CraProgram } from '@shared/domain/company/craAccounts';

/**
 * The Business Number and the company's CRA program accounts, entered the way the CRA writes them.
 *
 * The Business Number box takes nine digits (spaces are ignored and never count against the
 * length, so the last digit is never cut off). Each program account shows those nine digits and its
 * own letters, fixed (RT for GST/HST, RP for payroll, RC for corporate income tax), and only the
 * four-digit reference is typed (usually 0001). A blank reference means the company has no such account.
 */
export interface CraNumbers { businessNumber: string; hstNumber: string; payrollNumber: string; corporateTaxNumber: string }

const digitsOnly = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);
const PROGRAM_KEYS: Array<[CraProgram, keyof Omit<CraNumbers, 'businessNumber'>, string]> = [
  ['RT', 'hstNumber', 'GST/HST account'],
  ['RP', 'payrollNumber', 'Payroll account'],
  ['RC', 'corporateTaxNumber', 'Corporate income tax account'],
];

/** The nine digits a company's numbers are under: the Business Number box, or failing that the first
 * program account already on file (older files kept only the full account). */
export function businessNumberOf(values: CraNumbers): string {
  const own = digitsOnly(businessNumberDigits(values.businessNumber), 9);
  if (own) return own;
  for (const [, key] of PROGRAM_KEYS) {
    const parts = parseProgramAccount(values[key]);
    if (parts) return parts.businessNumber;
  }
  return '';
}

export function CraNumberFields({ values, onChange, compact = false }: { values: CraNumbers; onChange: (next: CraNumbers) => void; compact?: boolean }) {
  const bn = businessNumberOf(values);
  const box = 'rounded border border-gray-300 px-2 py-1.5 font-mono tabular-nums';

  function setBusinessNumber(raw: string) {
    const nextBn = digitsOnly(raw, 9);
    const next: CraNumbers = { ...values, businessNumber: nextBn };
    // Program accounts follow the Business Number: their nine digits are always the company's own.
    for (const [program, key] of PROGRAM_KEYS) {
      const parts = parseProgramAccount(values[key]);
      if (parts) next[key] = nextBn.length === 9 ? `${nextBn}${program}${parts.reference}` : values[key];
    }
    onChange(next);
  }

  function setReference(program: CraProgram, key: keyof Omit<CraNumbers, 'businessNumber'>, raw: string) {
    const reference = digitsOnly(raw, 4);
    onChange({ ...values, businessNumber: values.businessNumber || bn, [key]: reference ? `${bn}${program}${reference}` : '' });
  }

  return (
    <div className={`grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
      <label className="block text-sm">
        <span className="text-gray-600">Business Number (BN)</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label="Business Number"
          className={`mt-1 w-full ${box}`}
          placeholder="123456789"
          value={bn}
          onChange={(e) => setBusinessNumber(e.target.value)}
        />
        <span className="mt-1 block text-xs text-gray-400">Nine digits, from any CRA letter.</span>
      </label>
      {PROGRAM_KEYS.map(([program, key, label]) => {
        const stored = compactCraNumber(values[key]);
        const parts = parseProgramAccount(stored);
        // While the reference is being typed it is shorter than four digits; keep showing it.
        const typing = new RegExp(`^(\\d{9})${program}(\\d{0,4})$`).exec(stored);
        const reference = typing ? typing[2] : '';
        const wrongLetters = !!stored && !typing;
        const mismatch = !wrongLetters ? mismatchedBusinessNumber(bn, stored, program) : null;
        return (
          <label key={key} className="block text-sm">
            <span className="text-gray-600">{label} <span className="text-gray-400">({program}, optional)</span></span>
            <span className="mt-1 flex items-stretch overflow-hidden rounded border border-gray-300 font-mono tabular-nums">
              <span className="flex items-center bg-gray-50 px-2 text-gray-500" aria-hidden="true">{bn || '#########'}</span>
              <span className="flex items-center bg-gray-100 px-1.5 font-semibold text-gray-700" title={`${program} is fixed for the ${CRA_PROGRAMS[program].label}`}>{program}</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${label} reference`}
                disabled={bn.length !== 9}
                className="w-full min-w-[3.5rem] px-2 py-1.5 outline-none disabled:bg-gray-50"
                placeholder="0001"
                value={reference}
                onChange={(e) => setReference(program, key, e.target.value)}
              />
            </span>
            {bn.length !== 9 && <span className="mt-1 block text-xs text-gray-400">Enter the Business Number first.</span>}
            {typing && typing[2].length > 0 && typing[2].length < 4 && <span className="mt-1 block text-xs text-amber-700">The reference is 4 digits, for example 0001.</span>}
            {wrongLetters && <span className="mt-1 block text-xs text-amber-700">On file as {stored}, which is not a {program} account. Enter the 4-digit reference to replace it, or <button type="button" onClick={() => onChange({ ...values, [key]: '' })} className="underline">clear it</button>.</span>}
            {mismatch && <span className="mt-1 block text-xs text-amber-700">{mismatch}</span>}
          </label>
        );
      })}
    </div>
  );
}
