import {
  addAuditReviewNoteSchema,
  auditEngagementQuerySchema,
  lockAuditEngagementSchema,
  resolveAuditReviewNoteSchema,
  saveAuditDocumentSchema,
  saveAuditMaterialitySchema,
  setAuditEngagementStatusSchema,
  signAuditDocumentSchema,
} from '@shared/validation/schemas';
import {
  CORE_AUDIT_DOCUMENTS,
  type AuditDocument,
  type AuditDocumentStatus,
  type AuditEngagement,
  type AuditReviewNote,
} from '@shared/domain/audit/auditEngagement';
import { getCurrentDb } from '../companyFile';

async function ensureEngagement(periodEnd: string): Promise<number> {
  const db = getCurrentDb();
  const existing = await db.selectFrom('auditEngagements').select('id').where('periodEnd', '=', periodEnd).executeTakeFirst();
  if (existing) return existing.id;

  return db.transaction().execute(async (trx) => {
    const created = await trx.insertInto('auditEngagements').values({ periodEnd }).returning('id').executeTakeFirstOrThrow();
    await trx.insertInto('auditDocuments').values(CORE_AUDIT_DOCUMENTS.map((document) => ({ engagementId: created.id, ...document }))).execute();
    return created.id;
  });
}

async function assertEngagementOpen(engagementId: number): Promise<void> {
  const row = await getCurrentDb().selectFrom('auditEngagements').select(['status', 'lockedAt']).where('id', '=', engagementId).executeTakeFirst();
  if (!row) throw new Error('Audit engagement not found.');
  if (row.status === 'locked' || row.lockedAt) throw new Error('This audit engagement is locked. Its final file cannot be changed.');
}

async function engagementIdForDocument(documentId: number): Promise<number> {
  const row = await getCurrentDb().selectFrom('auditDocuments').select('engagementId').where('id', '=', documentId).executeTakeFirst();
  if (!row) throw new Error('Audit document not found.');
  return row.engagementId;
}

async function loadEngagement(id: number): Promise<AuditEngagement> {
  const db = getCurrentDb();
  const engagement = await db.selectFrom('auditEngagements').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  const rows = await db.selectFrom('auditDocuments').selectAll().where('engagementId', '=', id).orderBy('indexCode').execute();
  const ids = rows.map((row) => row.id);
  const noteRows = ids.length
    ? await db.selectFrom('auditReviewNotes').selectAll().where('documentId', 'in', ids).orderBy('createdAt').execute()
    : [];
  const documents: AuditDocument[] = rows.map((row) => ({
    ...row,
    status: row.status as AuditDocumentStatus,
    reviewNotes: noteRows.filter((note) => note.documentId === row.id) as AuditReviewNote[],
  }));
  const statuses = documents.map((document) => document.status);
  return {
    ...engagement,
    documents,
    progress: {
      notStarted: statuses.filter((status) => status === 'not_started').length,
      inProgress: statuses.filter((status) => status === 'in_progress').length,
      prepared: statuses.filter((status) => status === 'prepared').length,
      reviewed: statuses.filter((status) => status === 'reviewed').length,
      queries: statuses.filter((status) => status === 'query').length,
      total: statuses.length,
    },
  } as AuditEngagement;
}

export async function auditEngagementGet(input: unknown): Promise<AuditEngagement> {
  const { periodEnd } = auditEngagementQuerySchema.parse(input);
  return loadEngagement(await ensureEngagement(periodEnd));
}

export async function auditEngagementSaveMateriality(input: unknown): Promise<AuditEngagement> {
  const value = saveAuditMaterialitySchema.parse(input);
  await assertEngagementOpen(value.engagementId);
  const now = new Date().toISOString();
  const db = getCurrentDb();
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('auditEngagements').set({
      materialityBasis: value.materialityBasis,
      materialityBasisCents: value.materialityBasisCents,
      materialityPercent: value.materialityPercent,
      overallMaterialityCents: value.overallMaterialityCents,
      performanceMaterialityCents: value.performanceMaterialityCents,
      trivialMisstatementCents: value.trivialMisstatementCents,
      materialityRationale: value.materialityRationale || null,
      updatedAt: now,
    }).where('id', '=', value.engagementId).execute();
    const materiality = await trx.selectFrom('auditDocuments').selectAll().where('engagementId', '=', value.engagementId).where('indexCode', '=', 'A-400').executeTakeFirst();
    if (materiality && materiality.status !== 'query') {
      await trx.updateTable('auditDocuments').set({ status: 'in_progress', preparedBy: null, preparedAt: null, reviewedBy: null, reviewedAt: null, updatedAt: now }).where('id', '=', materiality.id).execute();
    }
  });
  return loadEngagement(value.engagementId);
}

export async function auditEngagementSaveDocument(input: unknown): Promise<AuditEngagement> {
  const { documentId, content } = saveAuditDocumentSchema.parse(input);
  const engagementId = await engagementIdForDocument(documentId);
  await assertEngagementOpen(engagementId);
  const now = new Date().toISOString();
  await getCurrentDb().updateTable('auditDocuments').set({ content, status: 'in_progress', preparedBy: null, preparedAt: null, reviewedBy: null, reviewedAt: null, updatedAt: now }).where('id', '=', documentId).execute();
  return loadEngagement(engagementId);
}

export async function auditEngagementSignDocument(input: unknown): Promise<AuditEngagement> {
  const { documentId, role, name } = signAuditDocumentSchema.parse(input);
  const engagementId = await engagementIdForDocument(documentId);
  await assertEngagementOpen(engagementId);
  const db = getCurrentDb();
  const document = await db.selectFrom('auditDocuments').selectAll().where('id', '=', documentId).executeTakeFirstOrThrow();
  const openNotes = await db.selectFrom('auditReviewNotes').select(({ fn }) => fn.countAll<number>().as('count')).where('documentId', '=', documentId).where('status', '=', 'open').executeTakeFirstOrThrow();
  if (Number(openNotes.count) > 0) throw new Error('Resolve the open review notes before signing this document.');
  const now = new Date().toISOString();
  if (role === 'preparer') {
    await db.updateTable('auditDocuments').set({ status: 'prepared', preparedBy: name, preparedAt: now, reviewedBy: null, reviewedAt: null, updatedAt: now }).where('id', '=', documentId).execute();
  } else {
    if (document.status !== 'prepared') throw new Error('The preparer must sign this document before reviewer sign-off.');
    if (document.preparedBy?.trim().toLowerCase() === name.trim().toLowerCase()) throw new Error('The reviewer must be different from the preparer.');
    await db.updateTable('auditDocuments').set({ status: 'reviewed', reviewedBy: name, reviewedAt: now, updatedAt: now }).where('id', '=', documentId).execute();
  }
  return loadEngagement(engagementId);
}

export async function auditEngagementAddReviewNote(input: unknown): Promise<AuditEngagement> {
  const { documentId, note, createdBy } = addAuditReviewNoteSchema.parse(input);
  const engagementId = await engagementIdForDocument(documentId);
  await assertEngagementOpen(engagementId);
  const db = getCurrentDb();
  const now = new Date().toISOString();
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('auditReviewNotes').values({ documentId, note, createdBy }).execute();
    await trx.updateTable('auditDocuments').set({ status: 'query', reviewedBy: null, reviewedAt: null, updatedAt: now }).where('id', '=', documentId).execute();
  });
  return loadEngagement(engagementId);
}

export async function auditEngagementResolveReviewNote(input: unknown): Promise<AuditEngagement> {
  const { noteId, resolvedBy } = resolveAuditReviewNoteSchema.parse(input);
  const db = getCurrentDb();
  const note = await db.selectFrom('auditReviewNotes').selectAll().where('id', '=', noteId).executeTakeFirst();
  if (!note) throw new Error('Review note not found.');
  const engagementId = await engagementIdForDocument(note.documentId);
  await assertEngagementOpen(engagementId);
  await db.updateTable('auditReviewNotes').set({ status: 'resolved', resolvedBy, resolvedAt: new Date().toISOString() }).where('id', '=', noteId).execute();
  return loadEngagement(engagementId);
}

export async function auditEngagementSetStatus(input: unknown): Promise<AuditEngagement> {
  const { engagementId, status } = setAuditEngagementStatusSchema.parse(input);
  await assertEngagementOpen(engagementId);
  await getCurrentDb().updateTable('auditEngagements').set({ status, updatedAt: new Date().toISOString() }).where('id', '=', engagementId).execute();
  return loadEngagement(engagementId);
}

export async function auditEngagementLock(input: unknown): Promise<AuditEngagement> {
  const { engagementId, confirmedBy } = lockAuditEngagementSchema.parse(input);
  await assertEngagementOpen(engagementId);
  const db = getCurrentDb();
  const incomplete = await db.selectFrom('auditDocuments').select(({ fn }) => fn.countAll<number>().as('count')).where('engagementId', '=', engagementId).where('status', '!=', 'reviewed').executeTakeFirstOrThrow();
  if (Number(incomplete.count) > 0) throw new Error(`${incomplete.count} audit documents are not reviewer-signed. Complete them before locking the final file.`);
  const now = new Date().toISOString();
  await db.updateTable('auditEngagements').set({ status: 'locked', lockedAt: now, lockedBy: confirmedBy, updatedAt: now }).where('id', '=', engagementId).execute();
  return loadEngagement(engagementId);
}
