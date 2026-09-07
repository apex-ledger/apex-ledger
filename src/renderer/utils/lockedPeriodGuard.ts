import { isDateInLockedPeriod, postingLockWithReason } from '@shared/domain/ledger/postJournalEntry';
import { confirmDialog } from '../app/store/confirmStore';

/**
 * Double-verification for changing an entry that falls in a fiscal period deliberately locked by
 * an accountant. A filed GST/HST return is an advisory marker, not a posting lock.
 * If the entry's date is NOT in a locked period, returns { proceed: true, override: false } and the
 * caller does its own normal flow. If it IS locked, pops a strong confirmation warning that the
 * change may affect a filed HST return, and returns override:true only when the user confirms — so
 * the backend lock can be deliberately overridden but never bypassed by accident.
 */
export async function confirmLockedOverride(
  entryDate: string,
  verb: string,
  /** The entry's lines, when known. With them, an entry that carries GST/HST inside a FILED return
   * gets the same deliberate-override confirmation an accountant lock does — the main process
   * refuses it otherwise, since voiding it restates figures already sent to the CRA. */
  lines: { accountId: number }[] = [],
): Promise<{ proceed: boolean; override: boolean }> {
  const result = await window.api.fiscalPeriods.list();
  const periods = result.ok ? result.data : [];
  const locked = isDateInLockedPeriod(entryDate, periods);
  if (!locked) {
    if (lines.length === 0) return { proceed: true, override: false };
    const accountsResult = await window.api.accounts.list();
    const accounts = accountsResult.ok ? accountsResult.data : [];
    const filed = postingLockWithReason({ entryDate, lines: lines.map((line) => ({ accountId: line.accountId, debitCents: 0, creditCents: 0 })) }, accounts, periods);
    if (filed?.kind !== 'hstFiling') return { proceed: true, override: false };
    const ok = await confirmDialog(
      `This entry carries GST/HST inside the FILED Sales Tax return “${filed.period.label}”. ` +
        `To ${verb} it changes the tax already reported to the CRA. The safer path is to void that return from GST/HST Centre first. ` +
        `Override and ${verb} it anyway?`,
    );
    return { proceed: ok, override: ok };
  }

  const ok = await confirmDialog(
    `This entry is dated ${entryDate}, inside the LOCKED period “${locked.label}”. ` +
      `Only an accountant-created fiscal lock reaches this confirmation. ` +
      `Are you sure you want to override the lock and ${verb} it?`,
  );
  return { proceed: ok, override: ok };
}
