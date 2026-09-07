import { useEffect, useState } from 'react';
import { useAppVersion } from '../hooks/useAppVersion';
import { useUiStore } from '../app/store/uiStore';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function StatusBar() {
  const version = useAppVersion();
  useEffect(() => {
    if (version) document.title = `Apex Ledger ${version}`;
  }, [version]);
  const companyLegalName = useUiStore((s) => s.companyLegalName);
  const [fiscalLabel, setFiscalLabel] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    window.api.company.get().then((r) => {
      if (!r.ok) return;
      const { fiscalYearEndMonth, fiscalYearEndDay } = r.data;
      // Fiscal year runs from the day after last year-end through this year's year-end.
      const endMonthName = MONTH_NAMES[fiscalYearEndMonth - 1];
      const startMonthIndex = fiscalYearEndMonth % 12; // month after year-end, 0-indexed into MONTH_NAMES
      const startMonthName = MONTH_NAMES[startMonthIndex];
      const startDay = fiscalYearEndDay >= 28 ? 1 : fiscalYearEndDay + 1;
      setFiscalLabel(`${startMonthName} ${startDay} - ${endMonthName} ${fiscalYearEndDay}`);
      setCurrency(r.data.baseCurrency);
    });
  }, [companyLegalName]);

  return (
    <footer className="flex h-7 flex-shrink-0 items-center justify-between border-t border-gray-200 bg-brand-900 px-4 text-[11px] text-brand-100">
      <div className="flex items-center gap-3">
        {fiscalLabel && <span>Fiscal Year: {fiscalLabel}</span>}
        {companyLegalName && <span>Company: {companyLegalName}</span>}
        {currency && <span>Currency: {currency}</span>}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-brand-300">{version ?? ""}</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Connected
        </span>
      </div>
    </footer>
  );
}
