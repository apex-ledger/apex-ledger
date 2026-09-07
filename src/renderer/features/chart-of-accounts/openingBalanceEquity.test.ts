import { afterEach, describe, expect, it, vi } from 'vitest';
import { postOpeningBalance } from './openingBalanceEquity';

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe('contact opening balances', () => {
  it('tags a customer on the A/R line without tagging Opening Balance Equity', async () => {
    const createAndPost = vi.fn().mockResolvedValue({ ok: true, data: {} });
    (globalThis as { window?: unknown }).window = {
      api: {
        accounts: {
          list: vi.fn().mockResolvedValue({
            ok: true,
            data: [{ id: 99, code: '3900', name: 'Opening Balance Equity' }],
          }),
          create: vi.fn(),
        },
        journal: { createAndPost },
      },
    };

    await expect(
      postOpeningBalance({
        accountId: 12,
        accountName: 'Acme — Accounts Receivable',
        accountType: 'Asset',
        amountCents: 125_00,
        asOfDate: '2026-01-01',
        customerId: 7,
      }),
    ).resolves.toEqual({ ok: true });

    expect(createAndPost).toHaveBeenCalledWith({
      entryDate: '2026-01-01',
      memo: 'Opening balance — Acme — Accounts Receivable',
      reference: null,
      lines: [
        { accountId: 12, debitCents: 125_00, creditCents: 0, customerId: 7, vendorId: null },
        { accountId: 99, debitCents: 0, creditCents: 125_00 },
      ],
    });
  });

  it('tags a vendor on the A/P credit line', async () => {
    const createAndPost = vi.fn().mockResolvedValue({ ok: true, data: {} });
    (globalThis as { window?: unknown }).window = {
      api: {
        accounts: {
          list: vi.fn().mockResolvedValue({
            ok: true,
            data: [{ id: 99, code: '3900', name: 'Opening Balance Equity' }],
          }),
          create: vi.fn(),
        },
        journal: { createAndPost },
      },
    };

    await postOpeningBalance({
      accountId: 22,
      accountName: 'Staples — Accounts Payable',
      accountType: 'Liability',
      amountCents: 80_00,
      asOfDate: '2026-01-01',
      vendorId: 9,
    });

    expect(createAndPost.mock.calls[0][0].lines[0]).toEqual({
      accountId: 22,
      debitCents: 0,
      creditCents: 80_00,
      customerId: null,
      vendorId: 9,
    });
  });
});
