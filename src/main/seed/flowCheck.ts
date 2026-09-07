/** End-to-end data-flow check: every input added recently, pushed through the real handlers into
 * a fresh company file, and followed to where it ends up — the journal, the balances, the lists
 * and the reports. Runs inside the app (see scripts/check-data-flow.mjs); nothing is mocked.
 *
 * Each check records what it expected and what it found, so a failure says which step of the
 * flow broke rather than just "something is wrong". */
import { closeCompany, createCompanyAt, getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { ensureAccountByName } from '../db/ensureAccount';
import { COA_TEMPLATES } from '../db/seeds/coaTemplates';
import { companyUpdate } from '../ipc/company.handlers';
import { customersSave, vendorsSave } from '../ipc/contacts.handlers';
import { productsCreate, movementsCreate, movementsList, inventoryStatusReport } from '../ipc/inventory.handlers';
import { invoicesCreate, invoicesGet, invoicesNextNumber, invoicesReceivePayment } from '../ipc/invoices.handlers';
import { hstFilingsCreate, hstFilingsList } from '../ipc/hstFilings.handlers';
import { billsCreate, billsGet, billsList, billsPay } from '../ipc/bills.handlers';
import { estimatesCreate, estimatesConvertToInvoice, estimatesConvertToPurchaseOrder, estimatesGet, estimatesSetFulfillment, estimatesSetRequiredBy, estimatesSetStatus } from '../ipc/estimates.handlers';
import { purchaseOrdersGet } from '../ipc/purchaseOrders.handlers';
import { journalGet, journalCreateAndPost } from '../ipc/journal.handlers';
import { clientOverviewGet } from '../ipc/clientOverview.handlers';
import { trialBalance } from '@shared/domain/ledger/trialBalance';

export interface FlowCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface FlowCheckReport {
  ok: boolean;
  checks: FlowCheck[];
  error?: string;
}

export async function runDataFlowCheck(filePath: string): Promise<FlowCheckReport> {
  const checks: FlowCheck[] = [];
  const check = (name: string, pass: boolean, detail?: string) => {
    checks.push({ name, pass, detail });
  };
  const expectEqual = (name: string, actual: unknown, expected: unknown) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    check(name, pass, pass ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const expectRefusal = async (name: string, fn: () => Promise<unknown>, pattern: RegExp) => {
    try {
      await fn();
      check(name, false, 'was accepted, should have been refused');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(name, pattern.test(message), pattern.test(message) ? undefined : `refused with an unexpected reason: ${message}`);
    }
  };

  try {
    await createCompanyAt(filePath, {
      legalName: 'Flow Check Co.',
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      baseCurrency: 'CAD',
      businessNumber: '987654321RC0001',
      businessType: 'general',
      coaTemplateId: COA_TEMPLATES[0]?.id ?? 'general_services',
    });
    await companyUpdate({ hstNumber: '987654321RT0001', businessProvince: 'ON', businessCity: 'Toronto' });
    const db = getCurrentDb();
    const accounts = await getAllAccounts(db);
    const byName = (name: string) => {
      const account = accounts.find((row) => row.name.toLowerCase() === name.toLowerCase());
      if (!account) throw new Error(`Template account missing: ${name}`);
      return account.id;
    };
    const chequing = byName('Chequing Account');
    const officeSupplies = accounts.find((a) => /office supplies/i.test(a.name))?.id ?? accounts.find((a) => a.accountType === 'Expense')!.id;
    const freight = accounts.find((a) => /freight|shipping|delivery/i.test(a.name) && a.accountType === 'Expense')?.id ?? accounts.filter((a) => a.accountType === 'Expense')[1].id;
    const revenue = accounts.find((a) => /service revenue|sales revenue/i.test(a.name))?.id ?? accounts.find((a) => a.accountType === 'Revenue')!.id;
    // The services template has no stock account; a business that starts tracking stock gets one the
    // same way the app creates it on first use.
    const inventoryAsset = accounts.find((a) => /^inventory$/i.test(a.name))?.id ?? (await ensureAccountByName(db, 'Inventory', 'Asset', '1300', '1120', 'Current Asset'));
    const cogs = accounts.find((a) => /cost of goods sold/i.test(a.name))?.id ?? null;
    const arId = byName('Accounts Receivable');

    const vendor = (await vendorsSave({ name: 'Staples Business Depot', defaultExpenseAccountId: officeSupplies })).id;
    const vendorNoDefault = (await vendorsSave({ name: 'Bell Canada' })).id;
    const customer = (await customersSave({ name: 'Maple Consulting Group' })).id;

    // ---- opening cash so payments can be made ----
    await journalCreateAndPost({
      entryDate: '2026-01-02',
      memo: 'Opening cash',
      lines: [
        { accountId: chequing, debitCents: 1_000_000, creditCents: 0, description: 'Opening' },
        { accountId: accounts.find((a) => a.accountType === 'Equity')!.id, debitCents: 0, creditCents: 1_000_000, description: 'Opening' },
      ],
    });

    // ---- 1. multi-line bill ----
    const splitBill = await billsCreate({
      vendorId: vendor,
      billNumber: 'STP-1001',
      billDate: '2026-03-10',
      dueDate: '2026-04-09',
      paymentTerms: 'net30',
      lines: [
        { categoryAccountId: officeSupplies, description: 'Paper and toner', baseCents: 10000, taxCode: 'HST', taxCents: 1300, productId: null, quantity: null },
        { categoryAccountId: freight, description: 'Delivery', baseCents: 5000, taxCode: 'NonHST', taxCents: 0, productId: null, quantity: null },
      ],
      memo: 'March supplies',
    });
    expectEqual('Split bill: two lines saved', splitBill.lines?.length, 2);
    expectEqual('Split bill: total = 100 + 13 + 50', splitBill.amountCents, 16300);
    expectEqual('Split bill: header category is the first line', splitBill.categoryAccountId, officeSupplies);
    const splitEntry = await journalGet(splitBill.billJournalEntryId as number);
    const apId = byName('Accounts Payable');
    const apCredit = splitEntry.lines.filter((l) => l.accountId === apId).reduce((s, l) => s + l.creditCents, 0);
    expectEqual('Split bill: one Accounts Payable credit for the total', [splitEntry.lines.filter((l) => l.accountId === apId).length, apCredit], [1, 16300]);
    expectEqual('Split bill: office supplies debited 100.00', splitEntry.lines.find((l) => l.accountId === officeSupplies)?.debitCents, 10000);
    expectEqual('Split bill: freight debited 50.00', splitEntry.lines.find((l) => l.accountId === freight)?.debitCents, 5000);
    const gstRecoverable = accounts.find((a) => /gst\/hst recoverable/i.test(a.name))?.id ?? (await getAllAccounts(db)).find((a) => /gst\/hst recoverable/i.test(a.name))?.id;
    expectEqual('Split bill: GST/HST Recoverable debited 13.00', splitEntry.lines.find((l) => l.accountId === gstRecoverable)?.debitCents, 1300);
    const balanced = splitEntry.lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0);
    expectEqual('Split bill: journal balances', balanced, 0);
    const listed = (await billsList()).find((b) => b.id === splitBill.id);
    expectEqual('Split bill: list carries the lines', listed?.lines?.length, 2);

    // ---- 2. single-field bill (receipt review / PO match still send one line) ----
    const oldStyle = await billsCreate({ vendorId: vendor, billNumber: 'STP-1002', billDate: '2026-03-12', dueDate: '2026-04-11', categoryAccountId: officeSupplies, baseCents: 2000, taxCode: 'HST', taxCents: 260, memo: 'Pens' });
    expectEqual('Single-field bill: one line synthesised', [oldStyle.lines?.length, oldStyle.amountCents], [1, 2260]);

    // ---- 3. refusals ----
    await expectRefusal('Bill line to a bank account is refused', () => billsCreate({ vendorId: vendor, billDate: '2026-03-13', dueDate: '2026-03-13', lines: [{ categoryAccountId: chequing, description: 'x', baseCents: 100, taxCode: null, taxCents: 0, productId: null, quantity: null }] }), /bank account/i);
    await expectRefusal('Bill with an empty line is refused by line number', () => billsCreate({ vendorId: vendor, billDate: '2026-03-13', dueDate: '2026-03-13', lines: [{ categoryAccountId: officeSupplies, description: 'x', baseCents: 0, taxCode: null, taxCents: 0, productId: null, quantity: null }] }), /Line 1 has no amount/);
    await expectRefusal('Invoice line to Accounts Receivable is refused', () => invoicesCreate({ customerId: customer, invoiceNumber: 'INV-BAD', invoiceDate: '2026-03-01', dueDate: '2026-03-31', lines: [{ description: 'x', quantity: 1, unitPriceCents: 100, revenueAccountId: arId, taxCode: null, manualHstCents: null, productId: null }] }), /control account/i);

    // ---- 4. paying the split bill settles it ----
    await billsPay({ id: splitBill.id, bankAccountId: chequing, paymentDate: '2026-04-01', amountCents: 16300 });
    expectEqual('Split bill: paid in full, balance zero', (await billsGet(splitBill.id)).balanceDueCents, 0);

    // ---- 5. stock received on a bill line ----
    if (cogs !== null) {
      const kit = await productsCreate({ sku: 'KIT-1', barcode: null, name: 'Receipt Scanner Kit', description: null, unit: 'each', salePriceCents: 25000, purchasePriceCents: 12000, incomeAccountId: revenue, cogsAccountId: cogs, assetAccountId: inventoryAsset, trackQuantity: true, defaultTaxCode: 'HST', reorderPoint: 2 });
      const stockBill = await billsCreate({ vendorId: vendor, billNumber: 'STP-1003', billDate: '2026-03-15', dueDate: '2026-04-14', lines: [{ categoryAccountId: inventoryAsset, description: 'Kits', baseCents: 36000, taxCode: 'HST', taxCents: 4680, productId: kit.id, quantity: 3 }] });
      const status = await inventoryStatusReport({ asOfDate: '2026-03-31' });
      expectEqual('Stock bill: 3 kits on hand', status.rows.find((r) => r.productId === kit.id)?.quantityOnHand, 3);
      const movement = (await movementsList({ productId: kit.id })).find((m) => m.sourceDocumentId === stockBill.id);
      expectEqual('Stock bill: movement points at the bill line', [movement?.sourceDocumentType, movement?.sourceLineId !== null && movement?.sourceLineId !== undefined], ['bill', true]);
      await movementsCreate({ productId: kit.id, movementDate: '2026-03-20', quantityDelta: -1, unitCostCents: null, kind: 'adjustment', note: 'Damaged', counterAccountId: null });
      const adjustments = (await movementsList({})).filter((m) => m.kind === 'adjustment');
      expectEqual('Adjustments tab: the adjustment is listed across products', adjustments.length, 1);
      expectEqual('Adjustment: 2 kits left', (await inventoryStatusReport({ asOfDate: '2026-03-31' })).rows.find((r) => r.productId === kit.id)?.quantityOnHand, 2);
    } else {
      check('Stock bill flow', false, 'template has no Inventory / Cost of Goods Sold accounts');
    }

    // ---- 6. invoice numbering continues the file's own pattern ----
    await invoicesCreate({ customerId: customer, invoiceNumber: 'INV-0025', invoiceDate: '2026-02-01', dueDate: '2026-03-03', lines: [{ description: 'Bookkeeping', quantity: 1, unitPriceCents: 40000, revenueAccountId: revenue, taxCode: 'HST', manualHstCents: null, productId: null }] });
    expectEqual('Invoice numbering continues INV-0025 → INV-0026', await invoicesNextNumber({ invoiceDate: '2026-02-15' }), 'INV-0026');

    // ---- 7. tax-inclusive invoice line: base + exact manual tax ----
    const inclusive = await invoicesCreate({ customerId: customer, invoiceNumber: 'INV-0026', invoiceDate: '2026-02-15', dueDate: '2026-03-17', lines: [{ description: 'Package (tax in $113.00)', quantity: 1, unitPriceCents: 10000, revenueAccountId: revenue, taxCode: 'Manual', manualHstCents: 1300, productId: null }] });
    expectEqual('Inclusive invoice: total equals what was typed', (await invoicesGet(inclusive.id)).totalCents, 11300);

    // ---- 8. sales order flow ----
    const estimate = await estimatesCreate({ customerId: customer, estimateNumber: 'EST-0001', estimateDate: '2026-05-01', expiryDate: null, memo: null, lines: [{ description: 'Conveyor rebuild', quantity: 1, unitPriceCents: 500000, revenueAccountId: revenue, taxCode: 'HST', manualHstCents: null, productId: null }] });
    await estimatesSetStatus({ id: estimate.id, status: 'accepted' });
    expectEqual('Sales order: accepted estimate is pending fulfilment', (await estimatesGet(estimate.id)).fulfillmentStatus, 'pending');
    await estimatesSetRequiredBy({ id: estimate.id, requiredByDate: '2026-06-15' });
    await estimatesSetFulfillment({ id: estimate.id, fulfillmentStatus: 'shipped', shipDate: '2026-06-10' });
    const shipped = await estimatesGet(estimate.id);
    expectEqual('Sales order: shipped with dates', [shipped.fulfillmentStatus, shipped.shipDate, shipped.requiredByDate], ['shipped', '2026-06-10', '2026-06-15']);
    const po = await estimatesConvertToPurchaseOrder({ id: estimate.id, vendorId: vendor, orderDate: '2026-05-02' });
    const poDoc = await purchaseOrdersGet(po.purchaseOrder.id);
    expectEqual('Sales order → purchase order: same lines, expected date = required by', [poDoc.lines.length, poDoc.expectedDate], [1, '2026-06-15']);
    expectEqual('Sales order: linked to its purchase order', (await estimatesGet(estimate.id)).convertedPurchaseOrderId, po.purchaseOrder.id);
    await expectRefusal('Sales order → second purchase order is refused', () => estimatesConvertToPurchaseOrder({ id: estimate.id, vendorId: vendor }), /already been raised/);
    const converted = await estimatesConvertToInvoice({ id: estimate.id, invoiceDate: '2026-06-12' });
    expectEqual('Sales order → invoice: invoiced, invoice total 5,650.00', [converted.estimate.status, converted.invoice.totalCents], ['converted', 565000]);

    const closedOrder = await estimatesCreate({ customerId: customer, estimateNumber: 'EST-0002', estimateDate: '2026-05-03', expiryDate: null, memo: null, lines: [{ description: 'Spare belt', quantity: 2, unitPriceCents: 10000, revenueAccountId: revenue, taxCode: 'HST', manualHstCents: null, productId: null }] });
    await estimatesSetStatus({ id: closedOrder.id, status: 'accepted' });
    await expectRefusal('Sales order → purchase order needs a purchase account on the vendor or product', () => estimatesConvertToPurchaseOrder({ id: closedOrder.id, vendorId: vendorNoDefault }), /no purchase account/);
    await estimatesSetStatus({ id: closedOrder.id, status: 'closed' });
    await expectRefusal('Closed order cannot be invoiced', () => estimatesConvertToInvoice({ id: closedOrder.id }), /Reopen/);
    await estimatesSetStatus({ id: closedOrder.id, status: 'accepted' });
    expectEqual('Closed order reopened', (await estimatesGet(closedOrder.id)).status, 'accepted');

    // ---- 9. client overview reads the state of the file ----
    const overview = await clientOverviewGet({ asOf: '2026-08-31' });
    const chequingRow = overview.banking.find((r) => r.accountId === chequing);
    expectEqual('Client overview: chequing listed, never reconciled', [chequingRow !== undefined, chequingRow?.reconciledThrough], [true, null]);
    expectEqual('Client overview: chequing book balance = 10,000 − 163.00', chequingRow?.bookBalanceCents, 1_000_000 - 16300);
    check('Client overview: flags the never-reconciled account', overview.issues.some((i) => i.key === `never-reconciled-${chequing}`), overview.issues.map((i) => i.key).join(', '));
    check('Client overview: flags the overdue March bills', overview.issues.some((i) => i.key === 'ap-90'), overview.issues.map((i) => i.key).join(', '));
    check('Client overview: flags the unfiled Q1 GST/HST', overview.issues.some((i) => i.key === 'hst-2026-Q1'), overview.issues.map((i) => i.key).join(', '));
    expectEqual('Client overview: company setup read', [overview.setup.hstNumber, overview.setup.province], ['987654321RT0001', 'ON']);

    // ---- 9b. money in, and a filed return, both reach the overview ----
    await invoicesReceivePayment({ id: inclusive.id, paymentDate: '2026-03-01', bankAccountId: chequing, amountCents: 11300, memo: null });
    expectEqual('Receive payment: inclusive invoice settled in full', (await invoicesGet(inclusive.id)).balanceDueCents, 0);
    const filed = await hstFilingsCreate({ periodStart: '2026-01-01', periodEnd: '2026-03-31', filingDate: '2026-04-20', paymentAccountId: chequing, memo: 'Q1' });
    expectEqual('HST filing: Q1 recorded with the period figures', [filed.periodStart, filed.periodEnd, (await hstFilingsList()).length], ['2026-01-01', '2026-03-31', 1]);
    const afterFiling = await clientOverviewGet({ asOf: '2026-08-31' });
    check('Client overview: Q1 no longer flagged once filed, Q2 still is', !afterFiling.issues.some((i) => i.key === 'hst-2026-Q1') && afterFiling.issues.some((i) => i.key === 'hst-2026-Q2'), afterFiling.issues.map((i) => i.key).join(', '));

    // ---- 10. the books still balance ----
    const tb = trialBalance(await getAllAccounts(db), await getAllJournalEntriesWithLines(db), '2026-12-31');
    expectEqual('Trial balance: debits equal credits after everything', tb.totalDebitCents === tb.totalCreditCents, true);

    closeCompany();
    return { ok: true, checks };
  } catch (error) {
    try {
      closeCompany();
    } catch {
      // nothing to close
    }
    return { ok: false, checks, error: error instanceof Error ? (error.stack ?? error.message) : String(error) };
  }
}
