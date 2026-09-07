import { useEffect, useState } from 'react';
import type { ClientRecord } from '@shared/domain/types';
import { FORM_TEMPLATES, type FormTemplate } from '@shared/domain/forms/formTemplates';
import { toWhatsAppUrl } from '../../utils/phone';
import { IconWhatsApp } from '../../components/icons';
import { loadFavouritePages, toggleFavouritePage, type FavouritePage } from '../../utils/favouritePages';

const CLIENT_COMPLIANCE_FORMS = FORM_TEMPLATES.filter((f) => f.category === 'client_compliance');
const TAX_ACCOUNTING_FORMS = FORM_TEMPLATES.filter((f) => (f.category ?? 'tax_accounting') === 'tax_accounting');

interface FormsPageProps {
  mode?: 'all' | 'compliance';
  embedded?: boolean;
  requestedFormId?: string;
}

export function FormsPage({ mode = 'all', embedded = false, requestedFormId }: FormsPageProps = {}) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Set<FavouritePage>>(() => loadFavouritePages());

  useEffect(() => {
    window.api.clients.list().then((r) => r.ok && setClients(r.data));
  }, []);

  useEffect(() => {
    if (!requestedFormId) return;
    const timeout = window.setTimeout(() => document.getElementById(`form-${requestedFormId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    return () => window.clearTimeout(timeout);
  }, [requestedFormId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  function busyKey(formId: string, action: string): string {
    return `${formId}:${action}`;
  }

  async function handleDownload(formId: string, formTitle: string) {
    const key = busyKey(formId, 'download');
    setBusy(key);
    setError(null);
    setMessage(null);
    const result = await window.api.forms.generatePdf({ formId, clientName: selectedClient?.clientName ?? null });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    if (result.data.saved) setMessage(`Saved "${formTitle}" — opening it now.`);
  }

  function handleMailto(formTitle: string) {
    if (!selectedClient?.email) return;
    const subject = encodeURIComponent(`${formTitle} — please complete`);
    const body = encodeURIComponent(
      `Hi ${selectedClient.clientName},\n\nAttached is the "${formTitle}" — please fill it out and send it back when you have a chance.\n\nThanks!`,
    );
    window.location.href = `mailto:${selectedClient.email}?subject=${subject}&body=${body}`;
  }

  async function handleOutlook(formId: string, formTitle: string) {
    if (!selectedClient?.email) return;
    const key = busyKey(formId, 'outlook');
    setBusy(key);
    setError(null);
    setMessage(null);
    const result = await window.api.forms.emailViaOutlook({ formId, clientName: selectedClient.clientName, clientEmail: selectedClient.email });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setMessage(`Opened in Outlook with "${formTitle}" attached — review and click Send when ready.`);
  }

  async function handleGmail(formId: string, formTitle: string) {
    if (!selectedClient?.email) return;
    const key = busyKey(formId, 'gmail');
    setBusy(key);
    setError(null);
    setMessage(null);
    const result = await window.api.forms.saveToDownloads({ formId, clientName: selectedClient.clientName });
    setBusy(null);
    if (!result.ok) return setError(result.error);

    const subject = encodeURIComponent(`${formTitle} — please complete`);
    const body = encodeURIComponent(
      `Hi ${selectedClient.clientName},\n\nAttached is the "${formTitle}" — please fill it out and send it back when you have a chance.\n\nThanks!`,
    );
    const fileName = result.data.filePath.split(/[\\/]/).pop();
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(selectedClient.email)}&su=${subject}&body=${body}`, '_blank');
    setMessage(`Saved "${fileName}" to your Downloads folder — drag it into the Gmail window that just opened to attach it.`);
  }

  async function handleWhatsApp(formId: string, formTitle: string) {
    if (!selectedClient?.phone) return;
    const key = busyKey(formId, 'whatsapp');
    setBusy(key);
    setError(null);
    setMessage(null);
    const result = await window.api.forms.saveToDownloads({ formId, clientName: selectedClient.clientName });
    setBusy(null);
    if (!result.ok) return setError(result.error);

    const fileName = result.data.filePath.split(/[\\/]/).pop();
    const url = toWhatsAppUrl(
      selectedClient.phone,
      `Hi ${selectedClient.clientName}, could you please fill out the "${formTitle}" and send it back? Attaching the PDF now.`,
    );
    window.open(url, '_blank');
    setMessage(`Saved "${fileName}" to your Downloads folder — drag it into the WhatsApp chat that just opened to attach it.`);
  }

  function renderFormGroup(heading: string, forms: FormTemplate[]) {
    if (forms.length === 0) return null;
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{heading}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {forms.map((form) => (
            <div
              id={`form-${form.id}`}
              key={form.id}
              className={`flex flex-col rounded-lg border bg-white p-3 shadow-sm ${requestedFormId === form.id ? 'border-gold-400 ring-2 ring-gold-200' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-gray-900">{form.title}</h3>
                <button
                  type="button"
                  onClick={() => setFavourites((current) => toggleFavouritePage(current, `form:${form.id}`))}
                  aria-label={`${favourites.has(`form:${form.id}`) ? 'Remove' : 'Add'} ${form.title} ${favourites.has(`form:${form.id}`) ? 'from' : 'to'} favourites`}
                  title={favourites.has(`form:${form.id}`) ? 'Remove from favourites' : 'Add to favourites'}
                  className={`shrink-0 text-xl leading-none ${favourites.has(`form:${form.id}`) ? 'text-gold-500' : 'text-gray-300 hover:text-gold-500'}`}
                >
                  {favourites.has(`form:${form.id}`) ? '★' : '☆'}
                </button>
              </div>
              <p className="mt-1 flex-1 text-sm text-gray-500">{form.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === busyKey(form.id, 'download')}
                  onClick={() => handleDownload(form.id, form.title)}
                  className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
                >
                  {busy === busyKey(form.id, 'download') ? 'Generating…' : 'Download Fillable PDF'}
                </button>
                <button
                  type="button"
                  disabled={!selectedClient?.email || busy === busyKey(form.id, 'outlook')}
                  onClick={() => handleOutlook(form.id, form.title)}
                  title={selectedClient?.email ? 'Opens Outlook with the PDF already attached' : 'Select a client with an email address'}
                  className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-40"
                >
                  {busy === busyKey(form.id, 'outlook') ? 'Opening Outlook…' : '📎 Outlook (attach PDF)'}
                </button>
                <button
                  type="button"
                  disabled={!selectedClient?.email || busy === busyKey(form.id, 'gmail')}
                  onClick={() => handleGmail(form.id, form.title)}
                  title={selectedClient?.email ? 'Saves the PDF to Downloads and opens Gmail — drag the file in to attach' : 'Select a client with an email address'}
                  className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-40"
                >
                  {busy === busyKey(form.id, 'gmail') ? 'Preparing…' : '📎 Gmail (drag to attach)'}
                </button>
                <button
                  type="button"
                  disabled={!selectedClient?.email}
                  onClick={() => handleMailto(form.title)}
                  title={selectedClient?.email ? 'Opens your default email app (no attachment)' : 'Select a client with an email address'}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                >
                  ✉️ Other Email App
                </button>
                <button
                  type="button"
                  disabled={!selectedClient?.phone || busy === busyKey(form.id, 'whatsapp')}
                  onClick={() => handleWhatsApp(form.id, form.title)}
                  title={selectedClient?.phone ? 'Saves the PDF to Downloads and opens WhatsApp — drag the file in to attach' : 'Select a client with a phone number'}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-40"
                >
                  {busy === busyKey(form.id, 'whatsapp') ? (
                    'Preparing…'
                  ) : (
                    <>
                      <IconWhatsApp className="h-4 w-4" /> WhatsApp Client
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!embedded && <div>
        <h1 className="text-lg font-semibold text-brand-900">Forms</h1>
        <p className="mt-1 text-sm text-gray-500">
          Download fillable PDF forms to send to clients — each opens as a real fillable PDF (any PDF reader) once saved.
        </p>
      </div>}

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <label className="block text-sm">
          <span className="text-gray-600">Sending to a client? (optional — pre-fills their name on the form and enables sending)</span>
          <select
            className="mt-1 w-full max-w-sm rounded border border-gray-300 bg-white px-2 py-1.5"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">No client selected</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientName}
              </option>
            ))}
          </select>
        </label>
        {clients.length === 0 && (
          <p className="mt-1 text-xs text-gray-400">No clients yet — add one in Client Reminders to enable Email/WhatsApp sending.</p>
        )}
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-sm">
        <h2 className="font-semibold">Before starting or continuing client work{selectedClient ? ` — ${selectedClient.clientName}` : ''}</h2>
        <p className="mt-1">
          Complete the forms that apply to the engagement. Do not start while an acceptance, conflict, independence, licensing, or client-consent issue remains unresolved.
        </p>
        <ol className="mt-2 grid list-decimal gap-x-6 gap-y-1 pl-5 sm:grid-cols-2">
          <li>Signed engagement letter with a precise scope</li>
          <li>Acceptance / continuance and conflict check</li>
          <li>Privacy and technology consent for systems actually used</li>
          <li>CRA authorization checklist when CRA access is needed</li>
          <li>Management acknowledgement for a compilation engagement</li>
          <li>FINTRAC screen only when a triggering financial activity may occur</li>
        </ol>
        <p className="mt-2 text-xs text-amber-800">
          These templates support documentation; adapt them to the province, firm policies, client facts, engagement type, and current professional requirements. They are not a substitute for professional or legal judgment.
        </p>
      </div>

      {renderFormGroup('Client Acceptance, Engagement & Compliance', CLIENT_COMPLIANCE_FORMS)}
      {mode === 'all' && renderFormGroup('Tax & Accounting Forms', TAX_ACCOUNTING_FORMS)}

      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        <p>
          <strong>Outlook</strong> genuinely attaches the PDF (via Outlook automation) — a draft opens ready to send.
        </p>
        <p className="mt-1">
          <strong>Gmail</strong> can't be auto-attached to from outside the browser (no web email allows that) — the PDF saves to your
          Downloads folder and Gmail opens pre-filled, so it's just one drag-and-drop.
        </p>
        <p className="mt-1">
          <strong>WhatsApp</strong> can't be auto-attached to either (no app allows that from outside itself) — the PDF saves to your
          Downloads folder and WhatsApp opens with your message ready, so it's just one drag-and-drop.
        </p>
        <p className="mt-1">
          <strong>Other Email App</strong> only opens a pre-written message — attach the downloaded file yourself.
        </p>
      </div>
    </div>
  );
}
