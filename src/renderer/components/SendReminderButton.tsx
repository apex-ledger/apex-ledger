import { useState } from 'react';
import type { ReminderPreview } from '../../main/ipc/paymentReminders.handlers';
import { Modal } from './Modal';
import { Money } from './Money';

const TIER_LABEL: Record<ReminderPreview['tier'], string> = { upcoming: 'Statement', due: 'Friendly reminder', overdue: 'Overdue notice', final: 'Final notice' };
const TIER_STYLE: Record<ReminderPreview['tier'], string> = { upcoming: 'bg-gray-100 text-gray-700', due: 'bg-amber-100 text-amber-800', overdue: 'bg-orange-100 text-orange-800', final: 'bg-rose-100 text-rose-800' };

/** "Send reminder" on a customer with an open balance: shows the email exactly as it will read,
 * with the statement of account it carries, then opens Outlook with everything filled in. The
 * person still presses Send in Outlook — nothing goes out unseen. */
export function SendReminderButton({ customerId, compact = true }: { customerId: number | null; compact?: boolean }) {
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [open, setOpen] = useState(false);
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
    setOpen(true);
  }

  async function send() {
    if (customerId === null) return;
    setBusy(true); setStatus(null);
    const result = await window.api.paymentReminders.emailViaOutlook({ customerId });
    setBusy(false);
    if (!result.ok) return setStatus(result.error);
    setStatus('Opened in Outlook — review and press Send there.');
    setOpen(false);
  }

  if (customerId === null) return null;
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void load()} className={compact ? 'whitespace-nowrap text-xs font-medium text-brand-600 hover:underline disabled:opacity-50' : 'rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50'} title="Email this customer a reminder with a statement of account attached">
        {busy ? 'Preparing…' : 'Send reminder'}
      </button>
      {status && <span className="ml-2 text-[11px] text-gray-500">{status}</span>}
      {preview && (
        <Modal open={open} onClose={() => setOpen(false)} title={`Reminder to ${preview.customerName}`} wide footer={<>
          <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" disabled={busy || !preview.customerEmail} onClick={() => void send()} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">Open in Outlook</button>
        </>}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[preview.tier]}`}>{TIER_LABEL[preview.tier]}</span>
              <span className="text-gray-600">To: {preview.customerEmail ?? <span className="text-rose-700">no email on file — add one in Customers</span>}</span>
              <span className="ml-auto text-gray-600">Outstanding <span className="font-semibold text-gray-900"><Money cents={preview.totalCents} /></span>{preview.overdueCents > 0 && preview.overdueCents !== preview.totalCents && <> · overdue <Money cents={preview.overdueCents} /></>}</span>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="font-medium text-gray-800">{preview.subject}</div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] text-gray-700">{preview.body}</pre>
            </div>
            <p className="text-xs text-gray-500">A one-page statement of account (the invoices above with days overdue and the total) is attached automatically. You can edit the wording in Outlook before sending.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
