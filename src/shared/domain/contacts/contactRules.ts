/** What may be done to a customer or vendor, and what may be done with one.
 *
 * Deactivating a contact hides them from every picker. Doing that while they still owe money, or
 * are owed it, makes the balance unreachable: the ageing report shows an amount for a name nobody
 * can open. The same in reverse — a new invoice to a deactivated customer resurrects a record that
 * was retired on purpose. And two contacts with the same name are a report that cannot be read.
 */

export type ContactKind = 'customer' | 'vendor';

export interface ContactExposure {
  /** Invoices (customer) or bills (vendor) with a balance still due. */
  openDocumentCount: number;
  /** Credit notes still open — money the contact is owed, or owes back. */
  openCreditCount: number;
}

const DOCUMENT_WORD: Record<ContactKind, string> = { customer: 'invoice', vendor: 'bill' };
const KIND_WORD: Record<ContactKind, string> = { customer: 'customer', vendor: 'vendor' };

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Why this contact cannot be deactivated yet, or null if it can. */
export function deactivationRefusalReason(kind: ContactKind, name: string, exposure: ContactExposure): string | null {
  const parts: string[] = [];
  if (exposure.openDocumentCount > 0) parts.push(`${plural(exposure.openDocumentCount, `unpaid ${DOCUMENT_WORD[kind]}`)}`);
  if (exposure.openCreditCount > 0) parts.push(`${plural(exposure.openCreditCount, 'open credit note')}`);
  if (parts.length === 0) return null;
  return `${name} still has ${parts.join(' and ')}. Settle or reverse them before deactivating this ${KIND_WORD[kind]}, or the balance will have no one to belong to.`;
}

/** Why a new document cannot be raised against this contact, or null if it can. */
export function inactiveContactRefusalReason(
  kind: ContactKind,
  contact: { name: string; isActive: boolean } | undefined,
  documentWord = DOCUMENT_WORD[kind],
): string | null {
  if (!contact) return `That ${KIND_WORD[kind]} no longer exists. Choose another before saving the ${documentWord}.`;
  if (!contact.isActive) return `${contact.name} is inactive. Reactivate this ${KIND_WORD[kind]} first, or choose another, before saving the ${documentWord}.`;
  return null;
}

/** Why this name cannot be saved, or null if it can. Case- and whitespace-insensitive, because
 * "Acme Ltd" and "acme ltd " are the same vendor typed twice, not two vendors. */
export function duplicateNameRefusalReason(
  kind: ContactKind,
  name: string,
  existing: { id: number; name: string }[],
  ownId: number | null = null,
): string | null {
  const wanted = name.trim().toLowerCase();
  const clash = existing.find((contact) => contact.id !== ownId && contact.name.trim().toLowerCase() === wanted);
  if (!clash) return null;
  return `A ${KIND_WORD[kind]} named "${clash.name}" already exists. Open that record instead of creating a second one.`;
}
