import { useUiStore } from '../app/store/uiStore';

/**
 * The names on a report are the way in. A customer name opens that customer's page, a vendor
 * name the vendor's page, an account name its General Ledger for the same period. Every report
 * uses these rather than its own idea of a link, so the behaviour is the same everywhere and a
 * name with no record behind it (a total row, "No vendor recorded") stays plain text.
 */
const linkClass = 'text-left text-brand-700 hover:underline';

export function CustomerLink({ id, name, className = '' }: { id: number | null | undefined; name: string; className?: string }) {
  const setView = useUiStore((s) => s.setView);
  if (!id) return <>{name}</>;
  return <button type="button" onClick={() => setView({ kind: 'sales', tab: 'customers', customerId: id })} className={`${linkClass} ${className}`} title="Open this customer">{name}</button>;
}

export function VendorLink({ id, name, className = '' }: { id: number | null | undefined; name: string; className?: string }) {
  const setView = useUiStore((s) => s.setView);
  if (!id) return <>{name}</>;
  return <button type="button" onClick={() => setView({ kind: 'expenses', tab: 'vendors', vendorId: id })} className={`${linkClass} ${className}`} title="Open this vendor">{name}</button>;
}

export function AccountLink({ id, name, dateFrom, dateTo, className = '' }: { id: number | null | undefined; name: string; dateFrom?: string; dateTo?: string; className?: string }) {
  const setView = useUiStore((s) => s.setView);
  if (!id) return <>{name}</>;
  return <button type="button" onClick={() => setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId: id, dateFrom, dateTo } })} className={`${linkClass} ${className}`} title="Open the General Ledger for this account">{name}</button>;
}
