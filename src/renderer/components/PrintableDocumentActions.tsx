import { useEffect, useState } from 'react';
import { DocumentActions, defaultEmailBody } from './DocumentActions';

type PrintableKind = 'estimate' | 'purchaseOrder' | 'creditNote';

const NOUN: Record<PrintableKind, string> = { estimate: 'estimate', purchaseOrder: 'purchase order', creditNote: 'credit note' };

/** Print, PDF and Email for an estimate, purchase order or credit note — the same three buttons the
 * invoice has, always on screen, greyed with the reason until the document has been saved. The
 * addressee, subject and message come from the server, which already knows the party and number,
 * so every page that shows one of these documents needs only its kind and id. */
export function PrintableDocumentActions({
  kind,
  id,
  known,
}: {
  kind: PrintableKind;
  id: number | null;
  /** The addressee and wording, when the caller already has them — a list of fifty credit notes
   * should not send fifty requests to learn names it is already showing. */
  known?: { partyName: string; partyEmail: string | null; subject: string; sentence: string };
}) {
  const [fetched, setFetched] = useState<{ partyName: string; partyEmail: string | null; subject: string; sentence: string } | null>(null);
  const defaults = known ?? fetched;

  useEffect(() => {
    setFetched(null);
    if (id === null || known) return;
    let cancelled = false;
    window.api.documentPdf.emailDefaults({ kind, id }).then((r) => {
      if (!cancelled && r.ok) setFetched(r.data);
    });
    return () => { cancelled = true; };
    // `known` is compared by presence only; its fields are read at render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, Boolean(known)]);

  return (
    <DocumentActions
      documentLabel={defaults?.subject.toLowerCase() ?? `this ${NOUN[kind]}`}
      partyName={defaults?.partyName ?? null}
      partyEmail={defaults?.partyEmail ?? null}
      emailSubject={defaults?.subject ?? ''}
      emailBody={defaultEmailBody(defaults?.partyName ?? null, defaults?.sentence ?? '')}
      unavailableReason={id === null ? `Save the ${NOUN[kind]} first — an unsaved ${NOUN[kind]} has no PDF yet.` : undefined}
      fetchPdfBytes={() => window.api.documentPdf.bytes({ kind, id: id! })}
      saveToDownloads={() => window.api.documentPdf.saveToDownloads({ kind, id: id! })}
      sendEmail={(fields) => window.api.documentPdf.sendDirect({ kind, id: id!, ...fields })}
    />
  );
}
