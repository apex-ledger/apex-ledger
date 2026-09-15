import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TaxCode } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import { mapContactRow } from '../db/mappers';
import { generateDocumentPdf, type PrintableDocument, type PrintableLine } from '../forms/generateDocumentPdf';
import { sendPlatformEmailWithAttachment } from '../email/sendEmail';
import { companyGet } from './company.handlers';
import { estimatesGet } from './estimates.handlers';
import { purchaseOrdersGet } from './purchaseOrders.handlers';
import { creditNotesGet } from './creditNotes.handlers';

/**
 * Print, PDF and Email for the documents that go out to a customer or a vendor but are not an
 * invoice or a sales receipt: estimates, purchase orders and credit notes. One set of handlers
 * keyed by kind, all laid out by the same black-and-white generator, so adding a document type is
 * a mapping here rather than another handler file.
 */
export type PrintableKind = 'estimate' | 'purchaseOrder' | 'creditNote';

interface DocumentRequest { kind: PrintableKind; id: number }

function parseRequest(input: unknown): DocumentRequest {
  const { kind, id } = (input ?? {}) as { kind?: unknown; id?: unknown };
  if (kind !== 'estimate' && kind !== 'purchaseOrder' && kind !== 'creditNote') throw new Error('Unknown document type.');
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new Error('Unknown document.');
  return { kind, id };
}

function safeFileNamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim();
}

const toLine = (line: { description: string; quantity: number; unitPriceCents: number; amountCents: number; taxCode: string | null; manualHstCents: number | null }): PrintableLine => ({
  description: line.description,
  quantity: line.quantity,
  unitPriceCents: line.unitPriceCents,
  amountCents: line.amountCents,
  taxCode: line.taxCode as TaxCode | null,
  manualHstCents: line.manualHstCents,
});

async function contact(table: 'customers' | 'vendors', id: number) {
  const row = await getCurrentDb().selectFrom(table).selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) throw new Error(`${table === 'customers' ? 'Customer' : 'Vendor'} ${id} not found.`);
  return mapContactRow(row);
}

/** The document as it prints, the file name it travels under, and the default email that goes with it. */
export async function resolvePrintableDocument({ kind, id }: DocumentRequest): Promise<{ doc: PrintableDocument; fileName: string; subject: string; sentence: string }> {
  if (kind === 'estimate') {
    const estimate = await estimatesGet(id);
    const party = await contact('customers', estimate.customerId);
    return {
      doc: {
        title: 'ESTIMATE',
        partyHeading: 'Prepared For',
        party,
        fields: [
          { label: 'Estimate #', value: estimate.estimateNumber },
          { label: 'Estimate Date', value: estimate.estimateDate },
          ...(estimate.expiryDate ? [{ label: 'Valid Until', value: estimate.expiryDate }] : []),
        ],
        lines: estimate.lines.map(toLine),
        memo: estimate.memo,
        // An estimate is an offer, not a bill: it says so, and says for how long it stands.
        footer: estimate.expiryDate
          ? `This is an estimate, not an invoice. It is valid until ${estimate.expiryDate}.`
          : 'This is an estimate, not an invoice. Thank you for the opportunity to quote.',
      },
      fileName: `Estimate ${safeFileNamePart(estimate.estimateNumber)}.pdf`,
      subject: `Estimate ${estimate.estimateNumber}`,
      sentence: `Please find attached estimate ${estimate.estimateNumber}${estimate.expiryDate ? `, valid until ${estimate.expiryDate}` : ''}.`,
    };
  }

  if (kind === 'purchaseOrder') {
    const po = await purchaseOrdersGet(id);
    const party = await contact('vendors', po.vendorId);
    return {
      doc: {
        title: 'PURCHASE ORDER',
        partyHeading: 'Vendor',
        party,
        fields: [
          { label: 'PO #', value: po.poNumber },
          { label: 'Order Date', value: po.orderDate },
          ...(po.expectedDate ? [{ label: 'Expected By', value: po.expectedDate }] : []),
        ],
        lines: po.lines.map(toLine),
        memo: po.memo,
        // Quoting the PO number on the vendor's invoice is what lets the bill be matched to it later.
        footer: `Please quote PO ${po.poNumber} on your invoice and delivery documents.`,
      },
      fileName: `Purchase Order ${safeFileNamePart(po.poNumber)}.pdf`,
      subject: `Purchase order ${po.poNumber}`,
      sentence: `Please find attached purchase order ${po.poNumber}${po.expectedDate ? `, needed by ${po.expectedDate}` : ''}. Please quote the PO number on your invoice.`,
    };
  }

  const note = await creditNotesGet(id);
  const isCustomer = note.kind === 'customer';
  const party = await contact(isCustomer ? 'customers' : 'vendors', note.contactId);
  return {
    doc: {
      title: isCustomer ? 'CREDIT NOTE' : 'VENDOR CREDIT',
      partyHeading: isCustomer ? 'Credit To' : 'Vendor',
      party,
      fields: [
        { label: 'Credit Note #', value: note.creditNoteNumber },
        { label: 'Date', value: note.creditNoteDate },
      ],
      lines: note.lines.map((line) => toLine({ ...line, taxCode: line.taxCode })),
      memo: note.memo,
      footer: isCustomer
        ? 'This credit reduces the amount you owe. It can be applied to an open invoice or refunded.'
        : 'Credit received from this vendor, applied against the amount owed to them.',
    },
    fileName: `${isCustomer ? 'Credit Note' : 'Vendor Credit'} ${safeFileNamePart(note.creditNoteNumber)}.pdf`,
    subject: `${isCustomer ? 'Credit note' : 'Vendor credit'} ${note.creditNoteNumber}`,
    sentence: `Please find attached ${isCustomer ? 'credit note' : 'vendor credit'} ${note.creditNoteNumber}, dated ${note.creditNoteDate}.`,
  };
}

async function renderPdf(request: DocumentRequest) {
  const resolved = await resolvePrintableDocument(request);
  const bytes = await generateDocumentPdf(resolved.doc, await companyGet());
  return { ...resolved, bytes };
}

/** The PDF itself, base64 over the wire, so the renderer can print it without a download step. */
export async function documentPdfBytes(input: unknown) {
  const { fileName, bytes } = await renderPdf(parseRequest(input));
  return { fileName, base64: Buffer.from(bytes).toString('base64') };
}

/** Saves the PDF to Downloads. On the web that folder is the one the HTTP layer hands back to the
 * browser as a download, so the same call works on both. */
export async function documentPdfSaveToDownloads(input: unknown) {
  const { fileName, bytes } = await renderPdf(parseRequest(input));
  const filePath = path.join(app.getPath('downloads'), fileName);
  fs.writeFileSync(filePath, bytes);
  return { filePath };
}

/** Sends the PDF through the platform's mail relay, with Reply-To set to whoever sent it. */
export async function documentPdfSendDirect(input: unknown) {
  const request = parseRequest(input);
  const { to, subject, body, replyTo } = input as { to: string; subject: string; body: string; replyTo?: string };
  if (!to || !to.trim()) throw new Error('Enter an email address to send to.');
  const { fileName, bytes } = await renderPdf(request);
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${fileName}`);
  fs.writeFileSync(tempPath, bytes);
  await sendPlatformEmailWithAttachment(tempPath, to.trim(), subject, body, replyTo);
  return { sent: true as const };
}

/** The default subject and message for the send dialog, and who the document is addressed to. */
export async function documentPdfEmailDefaults(input: unknown) {
  const { doc, subject, sentence } = await resolvePrintableDocument(parseRequest(input));
  return { partyName: doc.party.name, partyEmail: doc.party.email ?? null, subject, sentence };
}
