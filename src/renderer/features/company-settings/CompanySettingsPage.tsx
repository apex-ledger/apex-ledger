import { useEffect, useState } from 'react';
import type { AiKeyStatus } from '../../../preload/index';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { FiscalPeriodsPanel } from './FiscalPeriodsPanel';
import { InstallationSettingsSection } from './InstallationSettingsSection';
import { SelfTutorialSection } from './SelfTutorialSection';
import { WebOrganisationSection } from './WebOrganisationSection';
import { ALL_SUGGESTED_CATEGORIES, BUSINESS_TYPES, suggestedCategoriesForBusinessType, type SuggestedCategory } from '@shared/domain/businessTypes';
import { currentFiscalYearDates, fiscalYearEndFromStart, fiscalYearEndParts } from '@shared/domain/company/fiscalYearDates';
import { WSIB_RATE_CLASSES_2026, wsibRateForClass } from '@shared/domain/payroll/wsibRates2026';
import { COLOR_SCHEMES } from '../../theme';
import { FONT_SIZES } from '../../utils/fontSize';
import { useUiStore } from '../../app/store/uiStore';
import { Combobox } from '../../components/Combobox';
import { IconCalculator, IconHelp, IconLock, IconShieldCheck } from '../../components/icons';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { provinceToFill, recordSuggestion, rememberCityProvince, suggestionListId } from '../../utils/textSuggestions';
import { craHstAccountNumber } from '@shared/domain/company/craAccountNumber';
import { DATE_MAX, DATE_MIN, clampIsoDate, maskCanadianPostalCode } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

interface CoaTemplateOption {
  id: string;
  label: string;
  description: string;
}

const PROVINCES = ['ON', 'BC', 'AB', 'SK', 'MB', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];

/** Provider key here matches the field-name prefix in AiKeyStatus/saveAiKeys exactly
 * (`${key}Configured`, `${key}Model`, `${key}ApiKey`) so the whole grid below can be generated
 * from this one list instead of a hand-copied block per provider. */
const AI_PROVIDERS: { key: 'anthropic' | 'openai' | 'gemini' | 'qwen' | 'deepseek' | 'groq'; label: string; placeholder: string; free?: boolean }[] = [
  { key: 'anthropic', label: 'Claude (Anthropic)', placeholder: 'sk-ant-...' },
  { key: 'openai', label: 'ChatGPT (OpenAI)', placeholder: 'sk-...' },
  { key: 'gemini', label: 'Gemini (Google)', placeholder: 'AIza...' },
  { key: 'qwen', label: 'Qwen (Alibaba)', placeholder: 'sk-...' },
  { key: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  { key: 'groq', label: 'Groq', placeholder: 'gsk_...', free: true },
];
const DEFAULT_AI_MODELS: Record<(typeof AI_PROVIDERS)[number]['key'], string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  qwen: 'qwen-plus',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
};

export function CompanySettingsPage() {
  const colorScheme = useUiStore((s) => s.colorScheme);
  const setColorScheme = useUiStore((s) => s.setColorScheme);
  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const setView = useUiStore((s) => s.setView);
  const { data: company, reload } = useIpcQuery(() => window.api.company.get(), [], { liveRefresh: false });
  const [legalName, setLegalName] = useState('');
  const [fiscalStartDate, setFiscalStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [fiscalEndDate, setFiscalEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [fiscalDateError, setFiscalDateError] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('CAD');
  const [businessNumber, setBusinessNumber] = useState('');
  const [businessType, setBusinessType] = useState('general');
  const [hstNumber, setHstNumber] = useState('');
  const [payrollNumber, setPayrollNumber] = useState('');
  const [approvals, setApprovals] = useState<{ journal: string; po: string }>({ journal: '', po: '' });
  const [filing, setFiling] = useState<{ hstFilingFrequency: 'Monthly' | 'Quarterly' | 'Annually' | 'None'; payrollRemitterType: 'quarterly' | 'regular' | 'accelerated1' | 'accelerated2' }>({ hstFilingFrequency: 'None', payrollRemitterType: 'regular' });
  const [eft, setEft] = useState({ eftOriginatorId: '', eftOriginatorShortName: '', eftDataCentre: '', eftSettlementInstitution: '', eftSettlementTransit: '', eftSettlementAccount: '' });
  const [numberOfEmployees, setNumberOfEmployees] = useState('');
  const [eht, setEht] = useState<{ eligible: boolean; exemption: string }>({ eligible: true, exemption: '1000000' });
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [wsibClassCode, setWsibClassCode] = useState('');
  const [wsibRate, setWsibRate] = useState('');
  const [businessAddressLine1, setBusinessAddressLine1] = useState('');
  const [businessAddressLine2, setBusinessAddressLine2] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [businessProvince, setBusinessProvince] = useState('ON');
  const [businessProvinceChosen, setBusinessProvinceChosen] = useState(false);
  const [businessPostalCode, setBusinessPostalCode] = useState('');
  const [mailingSameAsBusinessAddress, setMailingSameAsBusinessAddress] = useState(true);
  const [mailingAddressLine1, setMailingAddressLine1] = useState('');
  const [mailingAddressLine2, setMailingAddressLine2] = useState('');
  const [mailingCity, setMailingCity] = useState('');
  const [mailingProvince, setMailingProvince] = useState('ON');
  const [mailingProvinceChosen, setMailingProvinceChosen] = useState(false);
  const [mailingPostalCode, setMailingPostalCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState<CoaTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [aiKeyStatus, setAiKeyStatus] = useState<AiKeyStatus | null>(null);
  const [aiKeyInputs, setAiKeyInputs] = useState<Record<(typeof AI_PROVIDERS)[number]['key'], string>>({
    anthropic: '',
    openai: '',
    gemini: '',
    qwen: '',
    deepseek: '',
    groq: '',
  });
  const [aiModelInputs, setAiModelInputs] = useState(DEFAULT_AI_MODELS);
  const [savingAiKeys, setSavingAiKeys] = useState(false);
  const [aiKeyMessage, setAiKeyMessage] = useState<string | null>(null);

  useEffect(() => {
    window.api.aiAssistant.keysStatus().then((r) => {
      if (!r.ok) return;
      setAiKeyStatus(r.data);
      setAiModelInputs({
        anthropic: r.data.anthropicModel,
        openai: r.data.openaiModel,
        gemini: r.data.geminiModel,
        qwen: r.data.qwenModel,
        deepseek: r.data.deepseekModel,
        groq: r.data.groqModel,
      });
    });
  }, []);

  async function handleSaveAiKey(provider: (typeof AI_PROVIDERS)[number]['key']) {
    setSavingAiKeys(true);
    setAiKeyMessage(null);
    const result = await window.api.aiAssistant.keysSave({
      [`${provider}ApiKey`]: aiKeyInputs[provider].trim(),
      [`${provider}Model`]: aiModelInputs[provider].trim(),
    });
    setSavingAiKeys(false);
    if (!result.ok) return setAiKeyMessage(`Failed to save: ${result.error}`);
    setAiKeyStatus(result.data);
    setAiKeyInputs((prev) => ({ ...prev, [provider]: '' }));
    setAiKeyMessage(`${AI_PROVIDERS.find((p) => p.key === provider)?.label} key saved.`);
  }
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [qbExportBusy, setQbExportBusy] = useState(false);
  const [qbExportMessage, setQbExportMessage] = useState<string | null>(null);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [addingCategories, setAddingCategories] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [addingCustomCategory, setAddingCustomCategory] = useState(false);
  const [catalogSearchValue, setCatalogSearchValue] = useState<string | null>(null);
  const [quickMethodEnabled, setQuickMethodEnabled] = useState(false);
  const [quickMethodRate, setQuickMethodRate] = useState(8.5);

  useEffect(() => {
    if (!company) return;
    setLegalName(company.legalName);
    const dates = currentFiscalYearDates(company.fiscalYearEndMonth, company.fiscalYearEndDay, localIsoDate());
    setFiscalStartDate(dates.startDate);
    setFiscalEndDate(dates.endDate);
    setFiscalDateError(null);
    setBaseCurrency(company.baseCurrency);
    setBusinessNumber(company.businessNumber ?? '');
    setBusinessType(company.businessType ?? 'general');
    setQuickMethodEnabled(company.hstQuickMethodEnabled);
    setQuickMethodRate(company.hstQuickMethodRate ?? 8.5);
    setHstNumber(company.hstNumber ?? '');
    setPayrollNumber(company.payrollNumber ?? '');
    setApprovals({ journal: company.approvalJournalThresholdCents != null ? String(company.approvalJournalThresholdCents / 100) : '', po: company.approvalPoThresholdCents != null ? String(company.approvalPoThresholdCents / 100) : '' });
    setFiling({ hstFilingFrequency: company.hstFilingFrequency ?? 'None', payrollRemitterType: company.payrollRemitterType ?? 'regular' });
    setEft({ eftOriginatorId: company.eftOriginatorId ?? '', eftOriginatorShortName: company.eftOriginatorShortName ?? '', eftDataCentre: company.eftDataCentre ?? '', eftSettlementInstitution: company.eftSettlementInstitution ?? '', eftSettlementTransit: company.eftSettlementTransit ?? '', eftSettlementAccount: company.eftSettlementAccount ?? '' });
    setNumberOfEmployees(company.numberOfEmployees != null ? String(company.numberOfEmployees) : '');
    setEht({ eligible: company.ehtExemptionEligible ?? true, exemption: String((company.ehtExemptionCents ?? 100000000) / 100) });
    setLogoDataUrl(company.logoDataUrl ?? null);
    setWsibClassCode(company.wsibClassCode ?? '');
    setWsibRate(company.wsibRate != null ? String(company.wsibRate) : '');
    setBusinessAddressLine1(company.businessAddressLine1 ?? '');
    setBusinessAddressLine2(company.businessAddressLine2 ?? '');
    setBusinessCity(company.businessCity ?? '');
    setBusinessProvince(company.businessProvince ?? 'ON');
    setBusinessProvinceChosen(Boolean(company.businessProvince));
    setBusinessPostalCode(company.businessPostalCode ?? '');
    setMailingSameAsBusinessAddress(company.mailingSameAsBusinessAddress);
    setMailingAddressLine1(company.mailingAddressLine1 ?? '');
    setMailingAddressLine2(company.mailingAddressLine2 ?? '');
    setMailingCity(company.mailingCity ?? '');
    setMailingProvince(company.mailingProvince ?? 'ON');
    setMailingProvinceChosen(Boolean(company.mailingProvince));
    setMailingPostalCode(company.mailingPostalCode ?? '');
  }, [company]);

  function reloadTemplates() {
    window.api.accounts.listTemplates().then((r) => {
      if (!r.ok) return;
      setTemplates(r.data);
      setSelectedTemplateId((current) => (r.data.some((t) => t.id === current) ? current : r.data[0]?.id || ''));
    });
  }

  useEffect(() => {
    reloadTemplates();
  }, []);

  async function handleSave() {
    setSaved(false);
    setFiscalDateError(null);
    const fiscalEnd = fiscalYearEndParts(fiscalStartDate, fiscalEndDate);
    if (!fiscalEnd) {
      setFiscalDateError('Enter a valid fiscal year start and an end date on or after the start date.');
      return;
    }
    // Capitalized here (not just onBlur) so Save right after typing the last field still saves
    // the capitalized value — see the note in AccountFormModal.handleSave for why.
    const result = await window.api.company.update({
      legalName: capitalizeWords(legalName),
      fiscalYearEndMonth: fiscalEnd.month,
      fiscalYearEndDay: fiscalEnd.day,
      baseCurrency,
      businessNumber: businessNumber || null,
      businessType,
      hstQuickMethodEnabled: quickMethodEnabled,
      hstQuickMethodRate: quickMethodRate,
      hstNumber: hstNumber || null,
      payrollNumber: payrollNumber || null,
      approvalJournalThresholdCents: approvals.journal.trim() === '' ? null : Math.round(Number(approvals.journal) * 100),
      approvalPoThresholdCents: approvals.po.trim() === '' ? null : Math.round(Number(approvals.po) * 100),
      hstFilingFrequency: filing.hstFilingFrequency,
      payrollRemitterType: filing.payrollRemitterType,
      ehtExemptionEligible: eht.eligible,
      ehtExemptionCents: Math.round((Number(eht.exemption) || 0) * 100),
      eftOriginatorId: eft.eftOriginatorId || null,
      eftOriginatorShortName: eft.eftOriginatorShortName || null,
      eftDataCentre: eft.eftDataCentre || null,
      eftSettlementInstitution: eft.eftSettlementInstitution || null,
      eftSettlementTransit: eft.eftSettlementTransit || null,
      eftSettlementAccount: eft.eftSettlementAccount || null,
      numberOfEmployees: numberOfEmployees ? Number(numberOfEmployees) : null,
      wsibClassCode: wsibClassCode || null,
      wsibRate: wsibRate ? Number(wsibRate) : null,
      businessAddressLine1: businessAddressLine1 ? capitalizeWords(businessAddressLine1) : null,
      businessAddressLine2: businessAddressLine2 ? capitalizeWords(businessAddressLine2) : null,
      businessCity: businessCity ? capitalizeWords(businessCity) : null,
      businessProvince: businessProvince || null,
      businessPostalCode: businessPostalCode || null,
      mailingSameAsBusinessAddress,
      mailingAddressLine1: mailingSameAsBusinessAddress ? null : mailingAddressLine1 ? capitalizeWords(mailingAddressLine1) : null,
      mailingAddressLine2: mailingSameAsBusinessAddress ? null : mailingAddressLine2 ? capitalizeWords(mailingAddressLine2) : null,
      mailingCity: mailingSameAsBusinessAddress ? null : mailingCity ? capitalizeWords(mailingCity) : null,
      mailingProvince: mailingSameAsBusinessAddress ? null : mailingProvince || null,
      mailingPostalCode: mailingSameAsBusinessAddress ? null : mailingPostalCode || null,
    });
    if (result.ok) {
      setSaved(true);
      reload();
    }
  }

  async function handleAddSuggestedCategories() {
    const categories = suggestedCategoriesForBusinessType(businessType);
    if (!categories.length) return;
    setAddingCategories(true);
    setCategoryMessage(null);
    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) {
      setAddingCategories(false);
      setCategoryMessage(existingResult.error);
      return;
    }
    const existingNames = new Set(existingResult.data.map((a) => a.name.toLowerCase()));
    const existingCodes = new Set(existingResult.data.map((a) => a.code));
    let nextCode = 5200;
    function nextFreeCode(): string {
      while (existingCodes.has(String(nextCode))) nextCode++;
      const code = String(nextCode);
      existingCodes.add(code);
      return code;
    }

    let added = 0;
    for (const category of categories) {
      if (existingNames.has(category.name.toLowerCase())) continue;
      const result = await window.api.accounts.create({
        code: nextFreeCode(),
        name: category.name,
        accountType: category.accountSubtype === 'Revenue' ? 'Revenue' : 'Expense',
        accountSubtype: category.accountSubtype,
        gifiCode: category.gifiCode,
      });
      if (result.ok) added++;
    }
    setAddingCategories(false);
    setCategoryMessage(added > 0 ? `Added ${added} suggested categor${added === 1 ? 'y' : 'ies'} to your Chart of Accounts.` : 'All suggested categories already exist in your Chart of Accounts.');
  }

  /** Adds a single category picked from the full cross-trade catalog (see the search box below the
   * suggested pills) — uses that category's real GIFI code/subtype, same as "Add These Categories",
   * just for a category that belongs to a different trade than the one currently selected. */
  async function handleAddCatalogCategory(category: SuggestedCategory) {
    setAddingCustomCategory(true);
    setCategoryMessage(null);
    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) {
      setAddingCustomCategory(false);
      setCategoryMessage(existingResult.error);
      return;
    }
    if (existingResult.data.some((a) => a.name.toLowerCase() === category.name.toLowerCase())) {
      setAddingCustomCategory(false);
      setCategoryMessage(`"${category.name}" is already in your Chart of Accounts.`);
      return;
    }
    const existingCodes = new Set(existingResult.data.map((a) => a.code));
    let nextCode = 5200;
    while (existingCodes.has(String(nextCode))) nextCode++;
    const result = await window.api.accounts.create({
      code: String(nextCode),
      name: category.name,
      accountType: category.accountSubtype === 'Revenue' ? 'Revenue' : 'Expense',
      accountSubtype: category.accountSubtype,
      gifiCode: category.gifiCode,
    });
    setAddingCustomCategory(false);
    if (!result.ok) return setCategoryMessage(result.error);
    setCategoryMessage(`Added "${category.name}" to your Chart of Accounts.`);
  }

  /** For a category this business needs that isn't in the built-in suggested list — same
   * auto-numbering (starting at 5200) as "Add These Categories", just for one name typed in
   * directly instead of picking from the fixed list. */
  async function handleAddCustomCategory() {
    const name = capitalizeWords(customCategoryName.trim());
    if (!name) return;
    setAddingCustomCategory(true);
    setCategoryMessage(null);
    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) {
      setAddingCustomCategory(false);
      setCategoryMessage(existingResult.error);
      return;
    }
    if (existingResult.data.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      setAddingCustomCategory(false);
      setCategoryMessage(`"${name}" is already in your Chart of Accounts.`);
      return;
    }
    const existingCodes = new Set(existingResult.data.map((a) => a.code));
    let nextCode = 5200;
    while (existingCodes.has(String(nextCode))) nextCode++;
    const result = await window.api.accounts.create({
      code: String(nextCode),
      name,
      accountType: 'Expense',
      accountSubtype: 'Operating Expense',
      gifiCode: null,
    });
    setAddingCustomCategory(false);
    if (!result.ok) return setCategoryMessage(result.error);
    setCustomCategoryName('');
    setCategoryMessage(`Added "${name}" to your Chart of Accounts.`);
  }

  async function handleLoadTemplate() {
    if (!selectedTemplateId) return;
    setLoadingTemplate(true);
    setTemplateMessage(null);
    const result = await window.api.accounts.seedFromTemplate(selectedTemplateId);
    setLoadingTemplate(false);
    const label = templates.find((t) => t.id === selectedTemplateId)?.label ?? selectedTemplateId;
    setTemplateMessage(result.ok ? `Added accounts from the "${label}" template.` : result.error);
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplateId.startsWith('custom-')) return;
    const label = templates.find((t) => t.id === selectedTemplateId)?.label ?? selectedTemplateId;
    if (!window.confirm(`Delete the chart-of-accounts template “${label}”? This does not delete accounts already added to a company, but the saved template cannot be recovered.`)) return;
    setDeletingTemplate(true);
    setTemplateMessage(null);
    const result = await window.api.accounts.deleteTemplate(selectedTemplateId);
    setDeletingTemplate(false);
    if (!result.ok) return setTemplateMessage(result.error);
    setSelectedTemplateId('');
    reloadTemplates();
    setTemplateMessage(`Deleted the "${label}" template.`);
  }

  async function handleQbExport(target: 'quickbooks' | 'xero' | 'sage' = 'quickbooks') {
    setQbExportBusy(true);
    setQbExportMessage(null);
    const result = target === 'xero' ? await window.api.qbExport.toXero() : target === 'sage' ? await window.api.qbExport.toSage() : await window.api.qbExport.toIif();
    setQbExportBusy(false);
    if (!result.ok) return setQbExportMessage(result.error);
    if (!result.data.saved) return;
    setQbExportMessage(
      `Exported ${result.data.accountCount} account${result.data.accountCount === 1 ? '' : 's'} and ${result.data.transactionCount} posted transaction${
        result.data.transactionCount === 1 ? '' : 's'
      } to ${result.data.filePath}.`,
    );
  }

  return (
    <div className="w-full space-y-3">
      <SuggestionDatalist fieldKey="company-legal-name" />
      <SuggestionDatalist fieldKey="company-base-currency" />
      <SuggestionDatalist fieldKey="company-business-number" />
      <SuggestionDatalist fieldKey="company-hst-number" />
      <SuggestionDatalist fieldKey="company-payroll-number" />
      <SuggestionDatalist fieldKey="address-line1" />
      <SuggestionDatalist fieldKey="address-line2" />
      <SuggestionDatalist fieldKey="city" />
      <SuggestionDatalist fieldKey="postal-code" />
      <SuggestionDatalist fieldKey="custom-category-name" />
      <div>
        <h1 className="text-lg font-semibold text-brand-900">Settings</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView({ kind: 'userGuide' })}
            className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <IconHelp width={16} height={16} />
            User Guide
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: 'tools' })}
            className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <IconCalculator width={16} height={16} />
            Tools &amp; Links
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: 'audit' })}
            className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <IconShieldCheck width={16} height={16} />
            Accounting Audit
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: 'about' })}
            className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <IconLock width={16} height={16} />
            About &amp; License
          </button>
        </div>
      </div>

      {company && !craHstAccountNumber(hstNumber, businessNumber) && (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>GST/HST account number missing.</strong> Enter the complete 15-character CRA program account (for example, 123456789RT0001) under Business Details below before filing a sales tax return.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Color Scheme</h2>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="mb-3 text-sm text-gray-500">Changes the sidebar, header, and accent colors for this device — every screen updates instantly.</p>
          <div className="flex flex-wrap gap-3">
            {COLOR_SCHEMES.map((scheme) => (
              <button
                key={scheme.id}
                type="button"
                onClick={() => setColorScheme(scheme.id)}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                  colorScheme === scheme.id ? 'border-gray-400 bg-gray-50' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <span className="flex h-9 w-16 overflow-hidden rounded">
                  <span className="h-full w-1/2" style={{ backgroundColor: scheme.brandSwatch }} />
                  <span className="h-full w-1/2" style={{ backgroundColor: scheme.goldSwatch }} />
                </span>
                <span className={`text-xs font-medium ${colorScheme === scheme.id ? 'text-gray-900' : 'text-gray-600'}`}>
                  {scheme.label}
                  {colorScheme === scheme.id && ' ✓'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Font Size</h2>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="mb-3 text-sm text-gray-500">Changes text size across the whole app for this device.</p>
          <div className="flex gap-2">
            {FONT_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => setFontSize(size.id)}
                className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                  fontSize === size.id ? 'border-gray-400 bg-gray-50 text-gray-900' : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                {size.label}
                {fontSize === size.id && ' ✓'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">AI Assistant</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-500">
            Powers the Claude / ChatGPT / Gemini / Qwen / DeepSeek / Groq chat button in the header. Bring your own API key from each
            provider's own developer console — keys are stored locally on this device only, never sent anywhere except directly to that
            provider's API. This chat is not connected to your company's financial data.{' '}
            <span className="font-medium text-green-700">Groq's key is free to get, no credit card</span> — the rest are paid APIs (some
            with limited free trials), or use the "Open in browser" link in the chat panel for any of them free instead.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {AI_PROVIDERS.map(({ key, label, placeholder, free }) => {
              const configured = aiKeyStatus?.[`${key}Configured` as keyof AiKeyStatus] as boolean | undefined;
              return (
                <div key={key} className="space-y-2">
                  <label className="block text-sm">
                    <span className="text-gray-600">
                      {label} API Key
                      {free && <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">FREE</span>}
                    </span>
                    <input
                      type="password"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                      value={aiKeyInputs[key]}
                      onChange={(e) => setAiKeyInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={configured ? '••••••••••••••••  (saved — enter a new key to replace)' : placeholder}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-600">Model</span>
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                      value={aiModelInputs[key]}
                      onChange={(e) => setAiModelInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingAiKeys || !aiKeyInputs[key].trim()}
                    onClick={() => handleSaveAiKey(key)}
                    className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {configured ? 'Replace Key' : 'Save Key'}
                  </button>
                  {configured && <span className="ml-2 text-xs text-green-700">✓ Key saved</span>}
                </div>
              );
            })}
          </div>
          {aiKeyMessage && <p className="text-xs text-gray-500">{aiKeyMessage}</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Company Information</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <label className="block text-sm">
            <span className="text-gray-600">Legal Name</span>
            <input
              list={suggestionListId('company-legal-name')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              onBlur={suggestOnBlur('company-legal-name', setLegalName)}
            />
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
          <p className="-mt-1 text-xs text-gray-400">Changing the start automatically selects the day before its anniversary. Example: July 1, 2026 → June 30, 2027. You may edit the end for a short first fiscal year.</p>
          {fiscalDateError && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{fiscalDateError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Base Currency</span>
              <input inputMode="text"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={baseCurrency}
              readOnly
              aria-readonly="true"
              maxLength={3}
            />
            <span className="mt-1 block text-xs text-gray-400">CAD is the permanent ledger and final-report base currency.</span>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Business Number (optional)</span>
              <input maxLength={16}
                list={suggestionListId('company-business-number')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                onBlur={(e) => recordSuggestion('company-business-number', e.target.value)}
              />
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
            <span className="mt-1 block text-xs text-gray-400">Surfaces trade-relevant categories first in Quick Entry — every account is always still available.</span>
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
              Save
            </button>
            {saved && <span className="text-sm text-green-600">Saved.</span>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Business Details & Addresses</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">GST/HST Account Number</span>
              <input maxLength={16}
                list={suggestionListId('company-hst-number')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                placeholder="123456789RT0001"
                value={hstNumber}
                onChange={(e) => setHstNumber(e.target.value)}
                onBlur={(e) => recordSuggestion('company-hst-number', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Payroll Account Number (optional)</span>
              <input maxLength={16}
                list={suggestionListId('company-payroll-number')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                placeholder="123456789RP0001"
                value={payrollNumber}
                onChange={(e) => setPayrollNumber(e.target.value)}
                onBlur={(e) => recordSuggestion('company-payroll-number', e.target.value)}
              />
            </label>
            <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3" data-testid="filing-settings">
              <div className="text-sm font-semibold text-gray-800">Filing &amp; remittance schedule</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="block text-sm"><span className="text-gray-600">GST/HST reporting period</span>
                  <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={filing.hstFilingFrequency} onChange={(e) => setFiling({ ...filing, hstFilingFrequency: e.target.value as typeof filing.hstFilingFrequency })}>
                    <option value="None">Not registered / not set</option>
                    <option value="Monthly">Monthly — return due one month after period end</option>
                    <option value="Quarterly">Quarterly — return due one month after quarter end</option>
                    <option value="Annually">Annually — return due three months after year end</option>
                  </select>
                </label>
                <label className="block text-sm"><span className="text-gray-600">CRA payroll remitter type</span>
                  <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={filing.payrollRemitterType} onChange={(e) => setFiling({ ...filing, payrollRemitterType: e.target.value as typeof filing.payrollRemitterType })}>
                    <option value="quarterly">Quarterly remitter (small employer)</option>
                    <option value="regular">Regular — due the 15th of the following month</option>
                    <option value="accelerated1">Threshold 1 — 25th and 10th</option>
                    <option value="accelerated2">Threshold 2 — within 3 working days</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={eht.eligible} onChange={(e) => setEht({ ...eht, eligible: e.target.checked })} /><span className="text-gray-600">Eligible for the Ontario EHT exemption (private sector, under $5M payroll)</span></label>
                <label className="block text-sm"><span className="text-gray-600">EHT exemption claimed by this company ($, share of $1,000,000 if associated)</span><input inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={eht.exemption} onChange={(e) => setEht({ ...eht, exemption: e.target.value })} disabled={!eht.eligible} /></label>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">The Action Centre uses these to warn before GST/HST returns and PD7A remittances fall due; the PD7A panel opens on this remitter type.</p>
            </div>
            <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3" data-testid="approval-settings">
              <div className="text-sm font-semibold text-gray-800">Approvals — a second pair of eyes above a threshold</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="block text-sm"><span className="text-gray-600">Manual journal entries at or above $ (blank = never)</span><input inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={approvals.journal} onChange={(e) => setApprovals({ ...approvals, journal: e.target.value })} placeholder="e.g. 1000" /></label>
                <label className="block text-sm"><span className="text-gray-600">Purchase orders at or above $ (blank = never)</span><input inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={approvals.po} onChange={(e) => setApprovals({ ...approvals, po: e.target.value })} placeholder="e.g. 5000" /></label>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Above the threshold a journal cannot post and a purchase order cannot be sent until an administrator or accountant approves it in Approvals. Bills already have their own approval on the Purchases page.</p>
            </div>
            <InstallationSettingsSection logoDataUrl={logoDataUrl} onLogoChanged={setLogoDataUrl} />
            <WebOrganisationSection />
            <SelfTutorialSection />
            <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-800">Direct deposit (EFT) — from your bank’s EFT agreement</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <label className="block text-sm"><span className="text-gray-600">Originator ID (10 characters)</span><input maxLength={10} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 uppercase" value={eft.eftOriginatorId} onChange={(e) => setEft({ ...eft, eftOriginatorId: e.target.value.toUpperCase().slice(0, 10) })} /></label>
                <label className="block text-sm"><span className="text-gray-600">Short name on statements (15)</span><input maxLength={15} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={eft.eftOriginatorShortName} onChange={(e) => setEft({ ...eft, eftOriginatorShortName: e.target.value.slice(0, 15) })} /></label>
                <label className="block text-sm"><span className="text-gray-600">Data centre (5 digits)</span><input inputMode="numeric" maxLength={5} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={eft.eftDataCentre} onChange={(e) => setEft({ ...eft, eftDataCentre: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></label>
                <label className="block text-sm"><span className="text-gray-600">Settlement institution (3)</span><input inputMode="numeric" maxLength={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={eft.eftSettlementInstitution} onChange={(e) => setEft({ ...eft, eftSettlementInstitution: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                <label className="block text-sm"><span className="text-gray-600">Settlement transit (5)</span><input inputMode="numeric" maxLength={5} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={eft.eftSettlementTransit} onChange={(e) => setEft({ ...eft, eftSettlementTransit: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></label>
                <label className="block text-sm"><span className="text-gray-600">Settlement account</span><input inputMode="numeric" maxLength={12} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={eft.eftSettlementAccount} onChange={(e) => setEft({ ...eft, eftSettlementAccount: e.target.value.replace(/\D/g, '').slice(0, 12) })} /></label>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Used by Payroll → Direct deposit file (CPA-005). The file number counts up automatically with each file saved.</p>
            </div>
            <label className="block text-sm">
              <span className="text-gray-600">Number of Employees (optional)</span>
              <input inputMode="decimal" maxLength={7}
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={numberOfEmployees}
                onChange={(e) => setNumberOfEmployees(e.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-600">Business Address</p>
            <div className="mt-1 space-y-2">
              <input
                list={suggestionListId('address-line1')}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Street number and street address"
                value={businessAddressLine1}
                onChange={(e) => setBusinessAddressLine1(e.target.value)}
                onBlur={suggestOnBlur('address-line1', setBusinessAddressLine1)}
              />
              <input
                list={suggestionListId('address-line2')}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Unit, suite or floor (optional)"
                value={businessAddressLine2}
                onChange={(e) => setBusinessAddressLine2(e.target.value)}
                onBlur={suggestOnBlur('address-line2', setBusinessAddressLine2)}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  list={suggestionListId('city')}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="City"
                  value={businessCity}
                  onChange={(e) => setBusinessCity(e.target.value)}
                  onBlur={(e) => {
                    suggestOnBlur('city', setBusinessCity)(e);
                    if (businessProvinceChosen) rememberCityProvince(e.target.value, businessProvince);
                    else {
                      const province = provinceToFill(e.target.value, businessPostalCode);
                      if (province) setBusinessProvince(province);
                    }
                  }}
                />
                <select
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  value={businessProvince}
                  onChange={(e) => {
                    setBusinessProvince(e.target.value);
                    setBusinessProvinceChosen(true);
                    if (e.target.value) rememberCityProvince(businessCity, e.target.value);
                  }}
                >
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  list={suggestionListId('postal-code')}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Postal Code"
                  value={businessPostalCode}
                  onChange={(e) => setBusinessPostalCode(maskCanadianPostalCode(e.target.value))}
                  onBlur={(e) => {
                    recordSuggestion('postal-code', e.target.value);
                    if (!businessProvinceChosen) {
                      const province = provinceToFill(businessCity, e.target.value);
                      if (province) setBusinessProvince(province);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600">Mailing Address</p>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input type="checkbox" checked={mailingSameAsBusinessAddress} onChange={(e) => setMailingSameAsBusinessAddress(e.target.checked)} />
                Same as business address
              </label>
            </div>
            {!mailingSameAsBusinessAddress && (
              <div className="mt-1 space-y-2">
                <input
                  list={suggestionListId('address-line1')}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Street number and street address"
                  value={mailingAddressLine1}
                  onChange={(e) => setMailingAddressLine1(e.target.value)}
                  onBlur={suggestOnBlur('address-line1', setMailingAddressLine1)}
                />
                <input
                  list={suggestionListId('address-line2')}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Unit, suite or floor (optional)"
                  value={mailingAddressLine2}
                  onChange={(e) => setMailingAddressLine2(e.target.value)}
                  onBlur={suggestOnBlur('address-line2', setMailingAddressLine2)}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    list={suggestionListId('city')}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="City"
                    value={mailingCity}
                    onChange={(e) => setMailingCity(e.target.value)}
                    onBlur={(e) => {
                    suggestOnBlur('city', setMailingCity)(e);
                    if (mailingProvinceChosen) rememberCityProvince(e.target.value, mailingProvince);
                    else {
                      const province = provinceToFill(e.target.value, mailingPostalCode);
                      if (province) setMailingProvince(province);
                    }
                  }}
                  />
                  <select
                    className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                    value={mailingProvince}
                    onChange={(e) => {
                    setMailingProvince(e.target.value);
                    setMailingProvinceChosen(true);
                    if (e.target.value) rememberCityProvince(mailingCity, e.target.value);
                  }}
                  >
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input
                    list={suggestionListId('postal-code')}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Postal Code"
                    value={mailingPostalCode}
                    onChange={(e) => setMailingPostalCode(maskCanadianPostalCode(e.target.value))}
                    onBlur={(e) => {
                      recordSuggestion('postal-code', e.target.value);
                      if (!mailingProvinceChosen) {
                        const province = provinceToFill(mailingCity, e.target.value);
                        if (province) setMailingProvince(province);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
              Save
            </button>
            {saved && <span className="text-sm text-green-600">Saved.</span>}
          </div>
        </div>
      </section>

      {businessProvince === 'ON' && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">WSIB (Ontario)</h2>
          <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
            <p className="text-sm text-gray-500">
              Workplace Safety and Insurance Board premiums — 100% employer-paid, calculated on every pay run once a class is selected.
              Pick your industry classification to auto-fill the 2026 rate, or enter your own rate straight from your WSIB statement (rates
              get reclassified/updated over time, so this always overrides the auto-filled figure).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Industry Classification</span>
                <Combobox
                  options={WSIB_RATE_CLASSES_2026.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}`, sublabel: `$${c.rate.toFixed(2)} per $100` }))}
                  value={wsibClassCode || null}
                  onChange={(v) => {
                    setWsibClassCode(v ?? '');
                    if (v) setWsibRate(String(wsibRateForClass(v) ?? ''));
                  }}
                  placeholder="Not registered for WSIB"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Premium Rate ($ per $100 of insurable earnings)</span>
                <input inputMode="decimal" maxLength={7}
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                  value={wsibRate}
                  onChange={(e) => setWsibRate(e.target.value)}
                  disabled={!wsibClassCode}
                />
              </label>
            </div>
          </div>
        </section>
      )}

      {suggestedCategoriesForBusinessType(businessType).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Suggested Categories for This Business</h2>
          <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
            <p className="text-sm text-gray-500">
              Trade-specific categories for {BUSINESS_TYPES.find((t) => t.id === businessType)?.label}, plus the standard CRA Schedule 125
              expense categories every business can use — add any missing ones to your Chart of Accounts in one click.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedCategoriesForBusinessType(businessType).map((c) => (
                <span key={c.name} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">
                  {c.name}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={addingCategories}
                onClick={handleAddSuggestedCategories}
                className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
              >
                {addingCategories ? 'Adding…' : 'Add These Categories'}
              </button>
              {categoryMessage && <span className="text-sm text-gray-600">{categoryMessage}</span>}
            </div>
            <div className="border-t border-gray-100 pt-3">
              <span className="mb-1 block text-xs font-medium text-gray-500">Search every category across all trades and add one</span>
              <div className="w-72">
                <Combobox
                  options={ALL_SUGGESTED_CATEGORIES.map((c) => ({ value: c.name, label: c.name, sublabel: c.accountSubtype }))}
                  value={catalogSearchValue}
                  allowClear={false}
                  placeholder="Search categories…"
                  onChange={(name) => {
                    setCatalogSearchValue(null);
                    if (!name) return;
                    const category = ALL_SUGGESTED_CATEGORIES.find((c) => c.name === name);
                    if (category) handleAddCatalogCategory(category);
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
              <input
                list={suggestionListId('custom-category-name')}
                className="w-64 rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={customCategoryName}
                onChange={(e) => setCustomCategoryName(e.target.value)}
                onBlur={suggestOnBlur('custom-category-name', setCustomCategoryName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustomCategory();
                }}
                placeholder="Or add a category not listed anywhere…"
              />
              <button
                type="button"
                disabled={addingCustomCategory || !customCategoryName.trim()}
                onClick={handleAddCustomCategory}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {addingCustomCategory ? 'Adding…' : '+ Add Category'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">HST Quick Method</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-500">
            Under CRA's Quick Method, you still charge customers the full HST rate, but remit a flat percentage of your tax-included
            sales instead of tracking input tax credits — you keep the difference. The remittance rate depends on your province and
            business category (there's also a 1% credit on the first $30,000 of eligible sales in your first year) — confirm your exact
            rate with CRA or your accountant before relying on this.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={quickMethodEnabled} onChange={(e) => setQuickMethodEnabled(e.target.checked)} />
            <span className="text-gray-600">Use the Quick Method for this company</span>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Remittance Rate (%)</span>
            <input inputMode="decimal" maxLength={7}
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="mt-1 w-32 rounded border border-gray-300 px-2 py-1.5"
              value={quickMethodRate}
              onChange={(e) => setQuickMethodRate(Number(e.target.value))}
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
              Save
            </button>
            {saved && <span className="text-sm text-green-600">Saved.</span>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Chart of Accounts Templates</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-500">Add a starter set of accounts on top of what you already have. Existing account codes are left untouched.</p>
          <div className="flex items-end gap-3">
            <label className="block flex-1 text-sm">
              <span className="text-gray-600">Template</span>
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedTemplateId || loadingTemplate}
              onClick={handleLoadTemplate}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Load
            </button>
            {selectedTemplateId.startsWith('custom-') && (
              <button
                type="button"
                disabled={deletingTemplate}
                onClick={handleDeleteTemplate}
                className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
          {selectedTemplateId && (
            <p className="text-xs text-gray-400">{templates.find((t) => t.id === selectedTemplateId)?.description}</p>
          )}
          {templateMessage && <p className="text-sm text-gray-600">{templateMessage}</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Data Portability</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-500">
            Take this company's Chart of Accounts, complete posted general ledger, customers and vendors to another system, so a client is never
            locked in. QuickBooks Desktop gets an .iif file (File → Utilities → Import → IIF Files). Xero gets its own CSV import templates
            (chart, manual journals, contacts) zipped with a README. Sage gets the Sage 50 (Canada) general journal text plus account and
            contact CSVs, zipped with a README. Tax is exported as posted, on its own lines, so the other system must not add it again.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={qbExportBusy} onClick={() => void handleQbExport('quickbooks')} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
              {qbExportBusy ? 'Exporting…' : 'Export to QuickBooks (.iif)'}
            </button>
            <button type="button" disabled={qbExportBusy} onClick={() => void handleQbExport('xero')} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50" data-testid="export-xero">
              {qbExportBusy ? 'Exporting…' : 'Export to Xero (.zip)'}
            </button>
            <button type="button" disabled={qbExportBusy} onClick={() => void handleQbExport('sage')} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50" data-testid="export-sage">
              {qbExportBusy ? 'Exporting…' : 'Export to Sage (.zip)'}
            </button>
          </div>
          {qbExportMessage && <p className="text-sm text-gray-600">{qbExportMessage}</p>}

          <div className="border-t border-gray-100 pt-3">
            <p className="text-sm text-gray-500">
              Bringing a client over from QuickBooks (Desktop .IIF, or Online CSV exports) or Xero (CSV exports)? Import their Chart of
              Accounts and transaction history instead of re-entering everything by hand.
            </p>
            <button
              type="button"
              onClick={() => setView({ kind: 'qbImport' })}
              className="mt-3 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Import from QuickBooks / Xero…
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="rounded border border-gray-200 bg-white p-3">
          <FiscalPeriodsPanel />
        </div>
      </section>
    </div>
  );
}
