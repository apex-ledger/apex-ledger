import { afterEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn(async () => undefined);
const values = vi.fn(() => ({ execute }));
const insertInto = vi.fn(() => ({ values }));

vi.mock('./companyFile', () => ({ getCurrentDb: () => ({ insertInto }) }));

import { setAccessIdentity } from './accessSession';
import { recordUserActivity } from './userActivity';

describe('user activity audit log', () => {
  afterEach(() => {
    vi.clearAllMocks();
    setAccessIdentity({ key: 'local:administrator', name: 'Local Administrator', email: null });
  });

  it('records the signed-in actor and the changed document reference', async () => {
    setAccessIdentity({ key: 'user:42', name: 'Morgan Lee', email: 'morgan@example.ca' });
    await recordUserActivity('invoices', { id: 9, invoiceNumber: 'INV-2026-0009' });

    expect(insertInto).toHaveBeenCalledWith('userActivityLog');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      actorKey: 'user:42',
      actorName: 'Morgan Lee',
      actorEmail: 'morgan@example.ca',
      topic: 'invoices',
      targetReference: 'INV-2026-0009',
    }));
    expect(execute).toHaveBeenCalledOnce();
  });
});
