import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { Modal } from '../../components/Modal';
import { BUSINESS_TYPES, suggestedCategoriesForBusinessType } from '@shared/domain/businessTypes';
import { fiscalYearEndFromStart, fiscalYearEndParts } from '@shared/domain/company/fiscalYearDates';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

interface CoaTemplateOption {
  id: string;
  label: string;
  description: string;
}

/** Rendered once at the app root so it's reachable both from the Welcome screen and from
 * File > New Company… while a different company is already open. */
export function NewCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setCompany = useUiStore((s) => s.setCompany);
  const setView = useUiStore((s) => s.setView);
  const prefill = useUiStore((s) => s.newCompanyPrefill);
  const setNewCompanyPrefill = useUiStore((s) => s.setNewCompanyPrefill);
  const [templates, setTemplates] = useState<CoaTemplateOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [legalName, setLegalName] = useState('');
  const [fiscalStartDate, setFiscalStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [fiscalEndDate, setFiscalEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [baseCurrency, setBaseCurrency] = useState('CAD');
  const [businessNumber, setBusinessNumber] = useState('');
  const [businessType, setBusinessType] = useState('general');
  const [templateId, setTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLegalName('');
    const year = new Date().getFullYear();
    setFiscalStartDate(`${year}-01-01`);
    setFiscalEndDate(`${year}-12-31`);
    setBaseCurrency('CAD');
    setBusinessNumber('');
    setBusinessType('general');
    setTemplateId(null);
    setError(null);
    if (prefill) {
      // The voice agent heard these; show them and let the reviewer correct anything before Create.
      setLegalName(prefill.legalName);
      if (prefill.businessType) setBusinessType(prefill.businessType);
      if (prefill.businessNumber) setBusinessNumber(prefill.businessNumber);
      if (prefill.fiscalYearEnd) {
        const end = new Date(Date.UTC(year, prefill.fiscalYearEnd.month - 1, prefill.fiscalYearEnd.day));
        const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1));
        setFiscalStartDate(start.toISOString().slice(0, 10));
        setFiscalEndDate(end.toISOString().slice(0, 10));
      }
      setNewCompanyPrefill(null);
    }
    window.api.accounts.listTemplates().then((r) => {
      if (!r.ok) return;
      setTemplates(r.data);
      // Default to the first real template rather than "Blank" — starting a company with zero
      // expense accounts is a trap (Quick Entry has nothing to categorize into).
      setTemplateId((current) => current ?? r.data[0]?.id ?? null);
    });
  }, [open]);

  async function addSuggestedCategoriesForNewCompany() {
    const categories = suggestedCategoriesForBusinessType(businessType);
    if (!categories.length) return;
    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) return;
    const existingNames = new Set(existingResult.data.map((a) => a.name.toLowerCase()));
    const existingCodes = new Set(existingResult.data.map((a) => a.code));
    let nextCode = 5200;
    function nextFreeCode(): string {
      while (existingCodes.has(String(nextCode))) nextCode++;
      const code = String(nextCode);
      existingCodes.add(code);
      return code;
    }
    for (const category of categories) {
      if (existingNames.has(category.name.toLowerCase())) continue;
      await window.api.accounts.create({
        code: nextFreeCode(),
        name: category.name,
        accountType: 'Expense',
        accountSubtype: category.accountSubtype,
        gifiCode: category.gifiCode,
      });
    }
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const fiscalEnd = fiscalYearEndParts(fiscalStartDate, fiscalEndDate);
    if (!fiscalEnd) {
      setBusy(false);
      setError('Enter a valid fiscal year start and an end date on or after the start date.');
      return;
    }
    // Capitalized here (not just onBlur) so Create right after typing the name still saves the
    // capitalized value — see the note in AccountFormModal.handleSave for why.
    const result = await window.api.company.create({
      legalName: capitalizeWords(legalName),
      fiscalYearEndMonth: fiscalEnd.month,
      fiscalYearEndDay: fiscalEnd.day,
      baseCurrency,
      businessNumber: businessNumber || null,
      businessType,
      coaTemplateId: templateId,
    });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    if (result.data.created) {
      if (businessType !== 'general') await addSuggestedCategoriesForNewCompany();
      setBusy(false);
      onClose();
      setCompany(result.data.filePath, result.data.company.legalName);
      // setCompany lands on Dashboard by default — for a brand-new company, go straight to Chart
      // of Accounts with opening balances already prompted instead, so every starter account the
      // template above just created (bank accounts, credit cards, Common Shares, Dividends Paid,
      // etc.) gets its starting balance filled in before the reviewer starts entering current
      // transactions.
      setView({ kind: 'chartOfAccounts', openOpeningBalances: true });
    } else {
      setBusy(false);
    }
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title="Create New Company"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !legalName.trim()}
            onClick={handleCreate}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Create
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-sm">
          <span className="text-gray-600">Legal Name</span>
          <input
            list={suggestionListId('company-legal-name')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            onBlur={suggestOnBlur('company-legal-name', setLegalName)}
            placeholder="Acme Consulting Inc."
          />
          <SuggestionDatalist fieldKey="company-legal-name" />
          <p className="mt-1 text-xs text-gray-400">A folder named after this client will be created under Documents\Ledgerly Books Clients\.</p>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Fiscal Year Start</span>
            <input
              type="date" min={DATE_MIN} max={DATE_MAX}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={fiscalStartDate}
              onChange={(e) => {
                const start = clampIsoDate(e.target.value);
                setFiscalStartDate(start);
                const automaticEnd = fiscalYearEndFromStart(start);
                if (automaticEnd) setFiscalEndDate(automaticEnd);
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Fiscal Year End</span>
            <input
              type="date"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={fiscalEndDate}
              min={fiscalStartDate}
              onChange={(e) => setFiscalEndDate(clampIsoDate(e.target.value))}
            />
          </label>
        </div>
        <p className="-mt-1 text-xs text-gray-400">Changing the start automatically selects the day before its anniversary. Example: July 1, 2026 → June 30, 2027. The end remains editable for a short first fiscal year.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Base Currency</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={baseCurrency}
              readOnly
              aria-readonly="true"
              maxLength={3}
            />
            <span className="mt-1 block text-xs text-gray-400">CAD stays the accounting and reporting base. Select foreign currencies on individual transactions.</span>
            <SuggestionDatalist fieldKey="company-base-currency" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Business Number (optional)</span>
            <input
              list={suggestionListId('company-business-number')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              onBlur={(e) => recordSuggestion('company-business-number', e.target.value)}
            />
            <SuggestionDatalist fieldKey="company-business-number" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Business Type</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
          >
            {BUSINESS_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Adds trade-specific expense categories to the Chart of Accounts automatically (e.g. Fuel, Truck Insurance for a trucking company).
            You can change this later in Company Settings.
          </p>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Starting Chart of Accounts</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
            value={templateId ?? ''}
            onChange={(e) => setTemplateId(e.target.value || null)}
          >
            <option value="">Blank (no starter accounts)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {templateId && (
            <p className="mt-1 text-xs text-gray-400">{templates.find((t) => t.id === templateId)?.description}</p>
          )}
        </label>
      </div>
    </Modal>
  );
}
