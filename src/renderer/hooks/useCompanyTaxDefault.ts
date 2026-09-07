import { useEffect, useState } from 'react';
import type { TaxCode } from '@shared/domain/types';
import { defaultTaxCodeForProvince } from '@shared/domain/ledger/taxCodes';
import { useDataChangeStore } from '../app/store/dataChangeStore';

interface CompanyTaxDefault {
  /** The company's business province, straight from its address. Null until loaded. */
  province: string | null;
  /** The tax code a business in that province normally charges, or null if the province is blank
   * or unrecognised — in which case nothing is pre-selected and the user picks. */
  defaultTaxCode: TaxCode | null;
  /** The business type chosen in company setup — what decides whether the firm's service rail is
   * shown on an invoice. Null until loaded. */
  businessType: string | null;
  loaded: boolean;
}

/** The tax code to pre-select, based on where the company actually is.
 *
 * Every entry screen previously started with no tax code, so an Ontario bookkeeper picked "HST 13%"
 * on every single line — and with thirteen codes in the list now, hunting for the right one each
 * time would have been worse still. The company's own province is known, so it is used.
 *
 * Deliberately not cached across the app: a company file can be closed and a different one opened
 * in the same session, and a stale province would silently put the wrong tax on new entries.
 */
export function useCompanyTaxDefault(): CompanyTaxDefault {
  const [province, setProvince] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dataVersion = useDataChangeStore((s) => s.version);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    window.api.company.get().then((r) => {
      if (cancelled) return;
      setProvince(r.ok ? r.data?.businessProvince ?? null : null);
      setBusinessType(r.ok ? r.data?.businessType ?? null : null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return { province, defaultTaxCode: defaultTaxCodeForProvince(province), businessType, loaded };
}
