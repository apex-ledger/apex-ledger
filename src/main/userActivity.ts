import { getCurrentDb } from './companyFile';
import { getAccessIdentity } from './accessSession';

function targetReference(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  for (const key of ['invoiceNumber', 'billNumber', 'receiptNumber', 'estimateNumber', 'purchaseOrderNumber', 'name', 'id']) {
    const candidate = row[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 180);
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return `${key} ${candidate}`;
  }
  return null;
}

/** Records successful mutations without ever putting the accounting write at risk. */
export async function recordUserActivity(topic: string, result: unknown): Promise<void> {
  try {
    const actor = getAccessIdentity();
    await getCurrentDb().insertInto('userActivityLog').values({
      actorKey: actor.key,
      actorName: actor.name,
      actorEmail: actor.email,
      topic,
      action: `Changed ${topic}`,
      targetReference: targetReference(result),
    }).execute();
  } catch (error) {
    // Opening/closing a company can legitimately leave no current database. Audit logging must
    // never turn a successful accounting operation into a failure after it has committed.
    console.warn('[activity-log]', error instanceof Error ? error.message : String(error));
  }
}
