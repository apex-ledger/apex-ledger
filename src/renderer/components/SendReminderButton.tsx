import { useState } from 'react';
import type { ReminderPreview } from '../../main/ipc/paymentReminders.handlers';
import { Money } from './Money';
import { EmailComposeModal } from './EmailComposeModal';
import { webContext } from '../features/company-settings/WebOrganisationSection';

const TIER_LABEL: Record<ReminderPreview['tier'], string> = { upcoming: 'Statement', due: 'Friendly reminder', overdue: 'Overdue notice', final: 'Final notice' };
const TIER_STYLE: Record<ReminderPreview['tier'], string> = { upcoming: 'bg-gray-100 text-gray-700', due: 'bg-amber-100 text-amber-800', overdue: 'bg-orange-100 text-orange-800', final: 'bg-rose-100 text-rose-800' };

/** "Send reminder" on a customer with an open balance: opens the send box with the reminder already
 * written for how late the balance is, the customer's address, and their statement of account
 * attached. Every word can be changed before Send — nothing goes out unseen — and it sends through
 * the platform's own mail server, so it works in the web app, where there is no Outlook to open. */
export function SendReminderButton({ customerId, compact = true }: { customerId: number | null; compact?: boolean }) {
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    if (customerId === null) return;
    setBusy(true); setStatus(null);
    const result = await window.api.paymentReminders.preview({ customerId });
    setBusy(false);
    if (!result.ok) return setStatus(result.error);
    if (!result.data) return setStatus('Nothing outstanding.');
    setPreview(result.data);
  }

  if (customerId === null) return null;
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void load()} className={compact ? 'whitespace-nowrap text-xs font-medium text-brand-600 hover:underline disabled:opacity-50' : 'rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50'} title="Email this customer a reminder with a statement of account attached">
        {busy ? 'Preparing…' : 'Send reminder'}
      </button>
      {status && <span className="ml-2 text-[11px] text-gray-500">{status}</span>}
      {preview && (
        <EmailComposeModal
          open
          onClose={() => setPreview(null)}
          title={`Reminder to ${preview.customerName}`}
          defaultTo={preview.customerEmail ?? ''}
          defaultSubject={preview.subject}
          defaultBody={preview.body}
          defaultReplyTo={webContext()?.user.email}
          attachmentNote="A one-page statement of account — the open invoices with days overdue and the total — is attached automatically."
          summary={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[preview.tier]}`}>{TIER_LABEL[preview.tier]}</span>
              {!preview.customerEmail && <span className="text-xs text-rose-700">No email on file — type one below, and add it to the customer record for next time.</span>}
              <span className="ml-auto text-gray-600">Outstanding <span className="font-semibold text-gray-900"><Money cents={preview.totalCents} /></span>{preview.overdueCents > 0 && preview.overdueCents !== preview.totalCents && <> · overdue <Money cents={preview.overdueCents} /></>}</span>
            </div>
          }
          onSend={async (fields) => {
            const result = await window.api.paymentReminders.sendDirect({ customerId, ...fields });
            if (result.ok) setStatus(`Reminder sent to ${fields.to}.`);
            return result;
          }}
        />
      )}
    </>
  );
}
