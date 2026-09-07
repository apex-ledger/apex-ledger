import { describe, expect, it } from 'vitest';
import type { Account } from '../types';
import { buildAccountTree, rollUpBalances } from './accountTree';

function acct(id: number, code: string, name: string, parentId: number | null = null): Account {
  return {
    id,
    code,
    name,
    accountType: 'Asset',
    accountSubtype: 'Cash and Bank',
    normalBalance: 'Debit',
    parentId,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  } as Account;
}

describe('buildAccountTree', () => {
  it('places children directly under their parent, deepening as it goes', () => {
    const accounts = [acct(1, '1000', 'Cash & Bank'), acct(3, '1002', 'Chequing 8050', 1), acct(2, '1001', 'Chequing 0542', 1)];
    const tree = buildAccountTree(accounts);
    expect(tree.map((n) => [n.account.name, n.depth])).toEqual([
      ['Cash & Bank', 0],
      ['Chequing 0542', 1],
      ['Chequing 8050', 1],
    ]);
    expect(tree[0].hasChildren).toBe(true);
    expect(tree[1].hasChildren).toBe(false);
  });

  it('treats an account whose parent is missing as top level rather than dropping it', () => {
    // The parent is filtered out (inactive, say). Losing the child from the chart entirely would be
    // a silent failure; showing it at the root is recoverable and visible.
    const tree = buildAccountTree([acct(2, '1001', 'Orphan', 99)]);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(0);
  });

  it('still lists every account when the parent chain forms a cycle', () => {
    const a = acct(1, '1000', 'A', 2);
    const b = acct(2, '1001', 'B', 1);
    const tree = buildAccountTree([a, b]);
    expect(tree).toHaveLength(2);
  });
});

describe('rollUpBalances', () => {
  it('adds every descendant into the parent while leaving leaves alone', () => {
    const accounts = [
      acct(1, '1000', 'Cash & Bank'),
      acct(2, '1001', 'Chequing 0542', 1),
      acct(3, '1002', 'Chequing 8050', 1),
      acct(4, '1003', 'Sub of a sub', 2),
    ];
    const own = new Map([[1, 100], [2, 250], [3, 400], [4, 50]]);
    const rolled = rollUpBalances(accounts, own);
    expect(rolled.get(4)).toBe(50);
    expect(rolled.get(3)).toBe(400);
    expect(rolled.get(2)).toBe(300); // own 250 + child 50
    expect(rolled.get(1)).toBe(800); // own 100 + 300 + 400
  });

  it('treats a missing balance as zero rather than NaN', () => {
    const accounts = [acct(1, '1000', 'Parent'), acct(2, '1001', 'Child', 1)];
    const rolled = rollUpBalances(accounts, new Map([[2, 75]]));
    expect(rolled.get(1)).toBe(75);
  });

  it('does not loop forever on a cyclic parent chain', () => {
    const accounts = [acct(1, '1000', 'A', 2), acct(2, '1001', 'B', 1)];
    const rolled = rollUpBalances(accounts, new Map([[1, 10], [2, 20]]));
    expect(rolled.size).toBe(2);
  });
});

describe("the shape a bookkeeper describes it in", () => {
  it('a main Cash account shows 1000 when its two sub-accounts hold 500 each', () => {
    // "main Cash acct $1000 -- Cash acct 101 $500 -- cash acct 2 $500": the parent carries nothing
    // of its own, every posting went to a child, and the parent reports the sum.
    const accounts = [
      acct(1, '1000', 'Cash'),
      acct(2, '1001', 'Cash acct 101', 1),
      acct(3, '1002', 'Cash acct 2', 1),
    ];
    const own = new Map([[2, 50000], [3, 50000]]); // cents
    const rolled = rollUpBalances(accounts, own);

    expect(rolled.get(1)).toBe(100000); // main Cash = 1,000.00
    expect(rolled.get(2)).toBe(50000);  // child unchanged
    expect(rolled.get(3)).toBe(50000);

    const tree = buildAccountTree(accounts);
    expect(tree.map((n) => [n.account.name, n.depth])).toEqual([
      ['Cash', 0],
      ['Cash acct 101', 1],
      ['Cash acct 2', 1],
    ]);
  });

  it('adds the parent own postings on top of its children rather than replacing them', () => {
    // If someone posts straight to the parent as well, that must not be lost — the page shows the
    // rolled figure with the parent's own amount beneath it.
    const accounts = [acct(1, '1000', 'Cash'), acct(2, '1001', 'Cash acct 101', 1)];
    const rolled = rollUpBalances(accounts, new Map([[1, 20000], [2, 50000]]));
    expect(rolled.get(1)).toBe(70000); // 200.00 own + 500.00 child
  });
});
