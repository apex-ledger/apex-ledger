import { PAYMENT_TERMS, dueDateFor, type PaymentTerm } from '@shared/domain/contacts/paymentTerms';

/** The terms dropdown, used on invoices, bills, customers and vendors alike.
 *
 * Picking a term moves the due date with it, which is the entire point — terms that do not drive
 * the date are just a label, and the ageing report would keep using whatever date was typed.
 *
 * "Custom date" leaves the date alone so a one-off arrangement can still be typed by hand. Without
 * it, any date that does not match a term would be silently overwritten the next time the form
 * re-rendered.
 */
export function PaymentTermsSelect({
  value,
  documentDate,
  onChange,
  disabled,
  /** Shown when nothing is chosen — for a contact, where null means "no default set". */
  emptyLabel,
  className,
}: {
  value: PaymentTerm | null;
  /** The invoice/bill date the due date is counted from. Omitted on a contact, where terms are
   * only a default and there is no date to count from yet. */
  documentDate?: string;
  onChange: (term: PaymentTerm, dueDate: string | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <select
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        const next = e.target.value as PaymentTerm | '';
        if (next === '') return onChange('custom', null);
        onChange(next, documentDate ? dueDateFor(documentDate, next) : null);
      }}
      className={className ?? 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100'}
    >
      {emptyLabel && <option value="">{emptyLabel}</option>}
      {PAYMENT_TERMS.map((term) => (
        <option key={term.term} value={term.term} title={term.description}>
          {term.label}
        </option>
      ))}
    </select>
  );
}
