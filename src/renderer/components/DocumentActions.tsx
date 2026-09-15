import { useState } from 'react';
import { EmailComposeModal } from './EmailComposeModal';
import { printPdfFromBase64 } from '../utils/printPdf';
import { webContext } from '../features/company-settings/WebOrganisationSection';
import { IconFilePdf, IconMail, IconPrinter } from './icons';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Print, PDF and Email on a document that has been saved — always the same three buttons, always
 * on screen rather than behind a Share menu, on every document that goes out to a customer or a
 * vendor. They were buried in a dropdown at the foot of the invoice page, which is why nobody
 * found them. Any document type plugs in by handing over the three calls its own handlers expose. */
export function DocumentActions({
  documentLabel,
  partyName,
  partyEmail,
  emailSubject,
  emailBody,
  fetchPdfBytes,
  saveToDownloads,
  sendEmail,
  unavailableReason,
}: {
  /** What this document is called in messages, e.g. "invoice INV-2026-0002". */
  documentLabel: string;
  partyName: string | null;
  partyEmail: string | null;
  emailSubject: string;
  emailBody: string;
  fetchPdfBytes: () => Promise<Result<{ fileName: string; base64: string }>>;
  saveToDownloads: () => Promise<Result<{ filePath: string }>>;
  sendEmail: (fields: { to: string; subject: string; body: string; replyTo: string }) => Promise<Result<unknown>>;
  /** Why the three buttons cannot act yet — an unsaved document has no PDF to print or send. They
   * stay in the row and grey out rather than disappearing, so nobody has to discover that they
   * exist only after saving. */
  unavailableReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  async function print() {
    setBusy(true); setError(null); setNotice(null);
    const r = await fetchPdfBytes();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    printPdfFromBase64(r.data.base64);
  }

  async function savePdf() {
    setBusy(true); setError(null); setNotice(null);
    const r = await saveToDownloads();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNotice(`Saved to ${r.data.filePath}`);
  }

  const off = Boolean(unavailableReason);
  const buttonClass = 'flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

  return (
    <>
      <div className="flex items-center gap-1.5" data-export-skip>
        <button type="button" disabled={busy || off} onClick={() => void print()} className={buttonClass} title={unavailableReason ?? `Print ${documentLabel}`}>
          <IconPrinter width={16} height={16} /> Print
        </button>
        <button type="button" disabled={busy || off} onClick={() => void savePdf()} className={buttonClass} title={unavailableReason ?? `Save ${documentLabel} as a PDF`}>
          <IconFilePdf width={16} height={16} /> PDF
        </button>
        <button type="button" disabled={busy || off} onClick={() => setComposeOpen(true)} className={buttonClass} title={unavailableReason ?? `Email ${documentLabel}`}>
          <IconMail width={16} height={16} /> Email
        </button>
      </div>
      {error && <div className="mt-2 w-full rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-2 w-full rounded bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}
      <EmailComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title={`Email ${documentLabel}`}
        defaultTo={partyEmail ?? ''}
        defaultSubject={emailSubject}
        defaultBody={emailBody}
        defaultReplyTo={webContext()?.user.email}
        onSend={sendEmail}
      />
    </>
  );
}

/** The default note that goes out with a document — named after whoever it is addressed to. */
export function defaultEmailBody(partyName: string | null, sentence: string): string {
  return `Hi${partyName ? ` ${partyName}` : ''},\n\n${sentence}\n\nThanks!`;
}
