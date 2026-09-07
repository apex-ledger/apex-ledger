import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '@shared/domain/types';
import { ContactFormModal } from './ContactFormModal';
import { toTelUrl, toWhatsAppUrl } from '../../utils/phone';
import { IconWhatsApp } from '../../components/icons';
import { buttonClass } from '../../components/Button';
import { useDataChangeStore } from '../../app/store/dataChangeStore';
import { useUiStore } from '../../app/store/uiStore';
import { Modal } from '../../components/Modal';
import { ContactPaymentHistory } from '../../components/ContactPaymentHistory';
import { ReceivePaymentModal } from '../invoices/ReceivePaymentModal';
import { PayBillModal } from '../purchases/PayBillModal';

export function ContactsPage({ kind, embedded = false }: { kind: 'customer' | 'vendor'; embedded?: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  /** The contact whose invoices/bills and payments are open in the drawer. */
  const [historyFor, setHistoryFor] = useState<Contact | null>(null);
  const [payingDocumentId, setPayingDocumentId] = useState<number | null>(null);
  const api = kind === 'customer' ? window.api.customers : window.api.vendors;
  const title = kind === 'customer' ? 'Customers' : 'Vendors';
  const dataVersion = useDataChangeStore((state) => state.version);
  const pendingSearchTerm = useUiStore((s) => s.pendingSearchTerm);
  const setPendingSearchTerm = useUiStore((s) => s.setPendingSearchTerm);
  // A name chosen in the quick search arrives here as the filter, then is cleared so it does not
  // follow the user to the next screen.
  useEffect(() => {
    if (!pendingSearchTerm) return;
    setSearch(pendingSearchTerm);
    setPendingSearchTerm(null);
  }, [pendingSearchTerm, setPendingSearchTerm]);

  async function refresh() {
    const result = await api.list();
    if (result.ok) setContacts(result.data);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, dataVersion]);

  async function handleDeactivate(id: number) {
    await api.deactivate(id);
    refresh();
  }

  const filteredContacts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) => [
      contact.name,
      contact.companyName,
      contact.contactName,
      contact.email,
      contact.phone,
      contact.website,
      contact.address,
      contact.shippingAddress,
    ].some((value) => value?.toLowerCase().includes(needle)));
  }, [contacts, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {embedded ? (
            <h2 className="text-lg font-semibold text-brand-900">{kind === 'customer' ? 'Customer List' : 'Vendor List'}</h2>
          ) : (
            <h1 className="text-lg font-semibold text-brand-900">{title}</h1>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {kind === 'customer'
              ? 'Customers stored in the company file currently open.'
              : 'Vendors stored in the company file currently open — pick one when entering a bill in Purchases.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowModal(true);
            }}
            className={buttonClass('primary')}
          >
            + Add {kind === 'customer' ? 'Customer' : 'Vendor'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-[260px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={`Search ${title.toLowerCase()} by name, company, contact, phone, email or address`} />
          <span className="text-xs text-gray-500">{filteredContacts.length} shown</span>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">No {title.toLowerCase()} yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-800">
                    <div className="font-medium">{c.name}</div>
                    {(c.companyName || c.contactName) && <div className="text-xs text-gray-500">{[c.companyName, c.contactName].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="py-2 text-gray-600">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 text-gray-600">
                    {c.phone ? (
                      <span className="flex items-center gap-2">
                        <a href={toTelUrl(c.phone)} className="hover:underline">
                          {c.phone}
                        </a>
                        <a href={toWhatsAppUrl(c.phone, `Hi ${c.name}, `)} target="_blank" rel="noreferrer" title="WhatsApp">
                          <IconWhatsApp className="h-4 w-4" />
                        </a>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${c.isActive ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : 'bg-gray-200 text-gray-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => setHistoryFor(c)} className="mr-2 text-xs font-medium text-brand-600 hover:underline">
                      {kind === 'customer' ? 'Invoices & payments' : 'Bills & payments'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(c);
                        setShowModal(true);
                      }}
                      className="mr-2 text-xs font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    {c.isActive && (
                      <button type="button" onClick={() => handleDeactivate(c.id)} className="text-xs font-medium text-gray-400 hover:underline">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ContactFormModal open={showModal} onClose={() => setShowModal(false)} onSaved={refresh} editing={editing} kind={kind} />
      <Modal
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? `${historyFor.name} — ${kind === 'customer' ? 'invoices and payments' : 'bills and payments'}` : ''}
        wide
        footer={<button type="button" onClick={() => setHistoryFor(null)} className={buttonClass('secondary')}>Close</button>}
      >
        {historyFor && <ContactPaymentHistory kind={kind} contactId={historyFor.id} contactName={historyFor.name} onPay={(id) => setPayingDocumentId(id)} />}
      </Modal>
      {kind === 'customer' ? (
        <ReceivePaymentModal open={payingDocumentId !== null} onClose={() => setPayingDocumentId(null)} onReceived={refresh} invoiceId={payingDocumentId} />
      ) : (
        <PayBillModal open={payingDocumentId !== null} onClose={() => setPayingDocumentId(null)} onPaid={refresh} billId={payingDocumentId} />
      )}
    </div>
  );
}
