/** Builds "Northwind Bookkeeping Test Co." — a fictitious company with every flow exercised.
 *
 * Nothing here writes SQL. Every record goes through the same handler the screen would call, so
 * each invoice, payment, bill, credit note, pay run and filing obeys every rule the app enforces
 * (posting gate, filed-return lock, seat and date checks, inventory valuation, credit
 * applications). What comes out is a company file whose numbers the app produced itself — which
 * is the only kind worth checking a screen against.
 *
 * Dates run January to August 2026 so the first two GST/HST quarters can be filed and the second
 * half of the year still shows open items. Amounts are round, so a wrong figure on a screen is
 * obvious at a glance.
 */
import { closeCompany, createCompanyAt, getCurrentDb } from '../companyFile';
import { ensureAccountByName } from '../db/ensureAccount';
import { getAllAccounts } from '../db/queries';
import { COA_TEMPLATES } from '../db/seeds/coaTemplates';
import { seedFirmServices } from '../db/seeds/firmServices.seed';
import { companyUpdate } from '../ipc/company.handlers';
import { customersSave, vendorsSave } from '../ipc/contacts.handlers';
import { productsCreate, productsList, productsUpdate, inventoryStatusReport } from '../ipc/inventory.handlers';
import { depositsCreate, invoicesCreate, invoicesList, invoicesPayments, invoicesReceivePayment } from '../ipc/invoices.handlers';
import { salesReceiptsCreate, salesReceiptsUndepositedFundsAccountId } from '../ipc/salesReceipts.handlers';
import { creditNotesApply, creditNotesCreate, creditNotesRefund } from '../ipc/creditNotes.handlers';
import { billsCreate, billsList, billsPay, billsSetApproval } from '../ipc/bills.handlers';
import { purchaseOrdersConvertToBill, purchaseOrdersCreate, purchaseOrdersMatchSupplierBill, purchaseOrdersReceive } from '../ipc/purchaseOrders.handlers';
import { estimatesConvertToInvoice, estimatesCreate } from '../ipc/estimates.handlers';
import { employeesCreate, payrollRunsCreate, payrollRunsList, payrollRunsPost } from '../ipc/payroll.handlers';
import { mileageCreate, mileagePostClaim } from '../ipc/mileage.handlers';
import { hstFilingsCreate } from '../ipc/hstFilings.handlers';
import { recurringTemplatesCreate } from '../ipc/recurringTemplates.handlers';
import { tagGroupsCreate, tagsCreate } from '../ipc/tags.handlers';
import { accessSetupThreeUserDemo } from '../ipc/accessUsers.handlers';
import { journalCreateAndPost } from '../ipc/journal.handlers';
import { reportsHandlers } from './reportsForSeed';

export const FICTITIOUS_COMPANY_NAME = 'Northwind Bookkeeping Test Co.';

export interface SeedSummary {
  filePath: string;
  company: string;
  counts: Record<string, number>;
  expected: Record<string, unknown>;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function seedFictitiousCompany(filePath: string): Promise<SeedSummary> {
  await createCompanyAt(filePath, {
    legalName: FICTITIOUS_COMPANY_NAME,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    baseCurrency: 'CAD',
    businessNumber: '123456789RC0001',
    businessType: 'bookkeeping_accounting',
    coaTemplateId: COA_TEMPLATES[0]?.id ?? 'general_services',
  });
  await companyUpdate({
    hstNumber: '123456789RT0001',
    payrollNumber: '123456789RP0001',
    numberOfEmployees: 2,
    businessAddressLine1: '200 Test Avenue',
    businessCity: 'Toronto',
    businessProvince: 'ON',
    businessPostalCode: 'M5V 1J2',
    wsibRate: 1.2,
  });
  const db = getCurrentDb();
  await seedFirmServices(db, 'bookkeeping_accounting');

  // ---- accounts, by the names the template gives them ----
  const accounts = await getAllAccounts(db);
  const byName = (name: string) => {
    const account = accounts.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (!account) throw new Error(`Template account missing: ${name}`);
    return account.id;
  };
  const chequing = byName('Chequing Account');
  const savings = byName('Savings Account');
  const serviceRevenue = byName('Service Revenue');
  const consultingFees = byName('Consulting Fees');
  const officeSupplies = byName('Office Supplies');
  const rent = byName('Rent / Lease');
  const software = byName('Software & Subscriptions');
  const meals = byName('Meals & Entertainment');
  const cogs = byName('Cost of Goods Sold');
  const commonShares = byName('Common Shares');
  const inventoryAsset = await ensureAccountByName(db, 'Inventory', 'Asset', '1300', '1120', 'Current Asset');
  const undeposited = await salesReceiptsUndepositedFundsAccountId();

  // ---- opening capital and a transfer to savings ----
  await journalCreateAndPost({
    entryDate: '2026-01-02', memo: 'Opening share capital', reference: 'OPEN-1',
    lines: [{ accountId: chequing, debitCents: 5_000_000, creditCents: 0 }, { accountId: commonShares, debitCents: 0, creditCents: 5_000_000 }],
  });
  await journalCreateAndPost({
    entryDate: '2026-01-15', memo: 'Transfer to savings', reference: 'TRF-1',
    lines: [{ accountId: savings, debitCents: 1_000_000, creditCents: 0 }, { accountId: chequing, debitCents: 0, creditCents: 1_000_000 }],
  });

  // ---- customers and vendors ----
  const customer = async (name: string, extra: Record<string, unknown> = {}) => (await customersSave({ name, ...extra })).id;
  const vendor = async (name: string, extra: Record<string, unknown> = {}) => (await vendorsSave({ name, ...extra })).id;
  const maple = await customer('Maple Consulting Group', { email: 'ap@maple.example', phone: '(416) 555-0101', address: '25 King Street West, Toronto, ON, M5H 1A1, Canada', paymentTerms: 'net30' });
  const birch = await customer('Birch & Co. Dental', { email: 'office@birch.example', phone: '(905) 555-0142', paymentTerms: 'net15' });
  const cedar = await customer('Cedar Landscaping Ltd', { email: 'sam@cedar.example', phone: '(647) 555-0177', paymentTerms: 'net30' });
  const willow = await customer('Willow Community Non-Profit', { email: 'treasurer@willow.example', paymentTerms: 'dueOnReceipt' });
  const spruce = await customer('Spruce Retail Inc', { email: 'owner@spruce.example', paymentTerms: 'net30' });
  const bell = await vendor('Bell Canada', { email: 'billing@bell.example', phone: '1-800-555-0199', paymentTerms: 'net30', defaultExpenseAccountId: software });
  const staples = await vendor('Staples Business', { paymentTerms: 'net30', defaultExpenseAccountId: officeSupplies });
  const hydro = await vendor('Toronto Hydro', { paymentTerms: 'net30' });
  const landlord = await vendor('Harbourfront Properties (Landlord)', { paymentTerms: 'net15', defaultExpenseAccountId: rent });
  const amazon = await vendor('Amazon Business', { paymentTerms: 'net30' });

  // ---- services get prices; one stock product exists to exercise inventory ----
  const products = await productsList({ activeOnly: true });
  const priceService = async (name: string, cents: number) => {
    const product = products.find((row) => row.name === name);
    if (!product) throw new Error(`Seeded service missing: ${name}`);
    await productsUpdate({ id: product.id, patch: { salePriceCents: cents, incomeAccountId: serviceRevenue, defaultTaxCode: 'HST' } });
    return product.id;
  };
  const t1 = await priceService('T1 Personal Tax Return', 25_000);
  const monthly = await priceService('Monthly Bookkeeping', 40_000);
  const t2 = await priceService('T2 Corporate Tax Return', 150_000);
  const hstReturn = await priceService('GST/HST Return — Quarterly', 15_000);
  const kit = await productsCreate({
    sku: 'RSK-100', barcode: null, name: 'Receipt Scanner Kit', description: 'Desk receipt scanner with software', unit: 'each',
    salePriceCents: 15_000, purchasePriceCents: 8_000, incomeAccountId: serviceRevenue, cogsAccountId: cogs, assetAccountId: inventoryAsset,
    trackQuantity: true, defaultTaxCode: 'HST', reorderPoint: 3,
  });

  // ---- purchases: bills through every state ----
  const bill = async (input: Record<string, unknown>) => billsCreate(input);
  const approveAndPay = async (billId: number, paymentDate: string, amountCents?: number) => {
    const current = (await billsList()).find((row) => row.id === billId)!;
    if (current.approvalStatus !== 'approved') {
      try { await billsSetApproval({ id: billId, approvalStatus: 'approved', approvedBy: 'Alex Admin' }); } catch { /* already payable */ }
    }
    const fresh = (await billsList()).find((row) => row.id === billId)!;
    return billsPay({ id: billId, bankAccountId: chequing, paymentDate, amountCents: amountCents ?? fresh.balanceDueCents });
  };
  // Stock arrives first so it can be sold later.
  const kitBill = await bill({ vendorId: amazon, billNumber: 'AMZ-77120', billDate: '2026-01-10', dueDate: '2026-02-09', categoryAccountId: inventoryAsset, baseCents: 80_000, taxCode: 'HST', taxCents: 10_400, memo: '10 receipt scanner kits', productId: kit.id, quantity: 10, paymentTerms: 'net30' });
  await approveAndPay(kitBill.id, '2026-02-05');
  const rentBills: number[] = [];
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    const created = await bill({ vendorId: landlord, billNumber: `RENT-2026-${mm}`, billDate: `2026-${mm}-01`, dueDate: `2026-${mm}-15`, categoryAccountId: rent, baseCents: 200_000, taxCode: 'HST', taxCents: 26_000, memo: `Office rent — 2026-${mm}`, paymentTerms: 'net15' });
    rentBills.push(created.id);
    if (month <= 7) await approveAndPay(created.id, `2026-${mm}-10`);
  }
  const bellBill = await bill({ vendorId: bell, billNumber: 'BELL-2026-01', billDate: '2026-01-20', dueDate: '2026-02-19', categoryAccountId: software, baseCents: 12_000, taxCode: 'HST', taxCents: 1_560, memo: 'Internet and phone — January' });
  await approveAndPay(bellBill.id, '2026-02-15');
  const staplesBill = await bill({ vendorId: staples, billNumber: 'STP-44810', billDate: '2026-02-12', dueDate: '2026-03-14', categoryAccountId: officeSupplies, baseCents: 30_000, taxCode: 'HST', taxCents: 3_900, memo: 'Toner and paper' });
  const hydroBill = await bill({ vendorId: hydro, billNumber: 'HYD-2026-Q2', billDate: '2026-05-04', dueDate: '2026-06-03', categoryAccountId: byName('Utilities'), baseCents: 45_000, taxCode: 'HST', taxCents: 5_850, memo: 'Electricity — spring quarter' });
  await approveAndPay(hydroBill.id, '2026-05-20', 20_000); // partial — 30,850 stays open
  const mealsBill = await bill({ vendorId: staples, billNumber: 'STP-MEAL-1', billDate: '2026-07-08', dueDate: '2026-08-07', categoryAccountId: meals, baseCents: 8_000, taxCode: 'MealsHST', taxCents: 1_040, memo: 'Client lunch' });
  await approveAndPay(mealsBill.id, '2026-07-20');

  // Vendor credit from Staples, applied to its open bill.
  const staplesCredit = await creditNotesCreate({ kind: 'vendor', contactId: staples, creditNoteNumber: 'VC-0001', creditNoteDate: '2026-02-20', memo: 'Returned damaged toner', lines: [{ description: 'Toner returned', quantity: 1, unitPriceCents: 5_000, categoryAccountId: officeSupplies, taxCode: 'HST' }] });
  await creditNotesApply({ id: staplesCredit.id, targetId: staplesBill.id, amountCents: 5_650 });

  // ---- sales: invoices in every state ----
  const invoice = async (customerId: number, number: string, date: string, due: string, lines: { productId?: number | null; description: string; quantity: number; unitPriceCents: number; taxCode?: 'HST' | 'NonHST' | null; revenueAccountId?: number }[], extra: Record<string, unknown> = {}) =>
    invoicesCreate({ customerId, invoiceNumber: number, invoiceDate: date, dueDate: due, lines: lines.map((line) => ({ productId: line.productId ?? null, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents, revenueAccountId: line.revenueAccountId ?? serviceRevenue, taxCode: line.taxCode === undefined ? 'HST' : line.taxCode })), ...extra });
  const receive = async (invoiceId: number, paymentDate: string, amountCents: number, bankAccountId: number | null) => invoicesReceivePayment({ id: invoiceId, paymentDate, amountCents, bankAccountId });

  const inv1 = await invoice(maple, 'INV-1001', '2026-01-31', '2026-03-02', [{ productId: monthly, description: 'Monthly bookkeeping — January', quantity: 1, unitPriceCents: 40_000 }]);
  await receive(inv1.id, '2026-02-20', 45_200, chequing);                         // paid in full, straight to bank
  const inv2 = await invoice(maple, 'INV-1002', '2026-02-28', '2026-03-30', [{ productId: monthly, description: 'Monthly bookkeeping — February', quantity: 1, unitPriceCents: 40_000 }]);
  await receive(inv2.id, '2026-03-15', 45_200, null);                              // paid into Undeposited Funds
  const inv3 = await invoice(birch, 'INV-1003', '2026-03-10', '2026-03-25', [{ productId: t1, description: 'T1 Personal Tax Return — Dr. Birch', quantity: 2, unitPriceCents: 25_000 }]);
  await receive(inv3.id, '2026-03-20', 30_000, null);                              // partly paid; 26,500 open, overdue
  const inv4 = await invoice(cedar, 'INV-1004', '2026-04-15', '2026-05-15', [{ productId: kit.id, description: 'Receipt Scanner Kit', quantity: 2, unitPriceCents: 15_000 }, { productId: hstReturn, description: 'GST/HST Return — Q1 2026', quantity: 1, unitPriceCents: 15_000 }]);
  await receive(inv4.id, '2026-05-01', 50_850, chequing);                          // paid; sold 2 kits from stock
  const inv5 = await invoice(willow, 'INV-1005', '2026-05-30', '2026-05-30', [{ description: 'Bookkeeping training session', quantity: 3, unitPriceCents: 10_000, taxCode: 'NonHST', revenueAccountId: consultingFees }]);
  // unpaid, exempt from HST, due on receipt — overdue
  const inv6 = await invoice(spruce, 'INV-1006', '2026-06-30', '2026-07-30', [{ productId: t2, description: 'T2 Corporate Tax Return — FY2025', quantity: 1, unitPriceCents: 150_000 }]);
  // Customer credit note against Spruce, applied in part; the remainder refunded.
  const spruceCredit = await creditNotesCreate({ kind: 'customer', contactId: spruce, creditNoteNumber: 'CN-0001', creditNoteDate: '2026-07-05', memo: 'Goodwill on late delivery', lines: [{ description: 'Goodwill credit', quantity: 1, unitPriceCents: 30_000, categoryAccountId: serviceRevenue, taxCode: 'HST' }] });
  await creditNotesApply({ id: spruceCredit.id, targetId: inv6.id, amountCents: 20_000 });
  await creditNotesRefund({ id: spruceCredit.id, bankAccountId: chequing, refundDate: '2026-07-12' });
  await receive(inv6.id, '2026-07-25', 100_000, chequing);                          // partial; 49,500 open, not yet due? due 07-30 → overdue now
  const inv7 = await invoice(maple, 'INV-1007', '2026-08-31', '2026-09-30', [{ productId: monthly, description: 'Monthly bookkeeping — August', quantity: 1, unitPriceCents: 40_000 }]);
  // open, not yet due
  void inv5; void inv7;

  // Sales receipts: one banked directly, one waiting in Undeposited Funds.
  await salesReceiptsCreate({ customerId: cedar, receiptNumber: 'SR-2001', receiptDate: '2026-03-18', depositToAccountId: chequing, lines: [{ description: 'Walk-in T1 return', quantity: 1, unitPriceCents: 25_000, revenueAccountId: serviceRevenue, productId: t1, taxCode: 'HST' }] });
  const sr2 = await salesReceiptsCreate({ customerId: birch, receiptNumber: 'SR-2002', receiptDate: '2026-03-19', depositToAccountId: undeposited, lines: [{ description: 'Notarised copies', quantity: 4, unitPriceCents: 1_500, revenueAccountId: consultingFees, productId: null, taxCode: 'HST' }] });

  // One deposit batches the March undeposited money into the bank; INV-1003's partial stays waiting.
  const inv2Payments = await invoicesPayments(inv2.id);
  await depositsCreate({ invoicePaymentIds: inv2Payments.map((row) => row.id), salesReceiptIds: [sr2.id], bankAccountId: chequing, depositDate: '2026-03-21' });

  // ---- estimates and purchase orders ----
  const est1 = await estimatesCreate({ customerId: cedar, estimateNumber: 'EST-3001', estimateDate: '2026-06-01', expiryDate: '2026-07-01', memo: 'Year-end package', lines: [{ description: 'Year-end working papers', quantity: 1, unitPriceCents: 120_000, revenueAccountId: serviceRevenue, taxCode: 'HST', manualHstCents: null, productId: null }] });
  await estimatesConvertToInvoice({ id: est1.id, invoiceDate: '2026-06-15', paymentTerms: 'net30' });
  await estimatesCreate({ customerId: willow, estimateNumber: 'EST-3002', estimateDate: '2026-08-20', expiryDate: '2026-09-20', memo: 'Grant reporting support', lines: [{ description: 'Grant reporting — 10 hours', quantity: 10, unitPriceCents: 9_000, revenueAccountId: consultingFees, taxCode: 'NonHST', manualHstCents: null, productId: null }] });
  const po1 = await purchaseOrdersCreate({ vendorId: amazon, poNumber: 'PO-4001', orderDate: '2026-06-02', expectedDate: '2026-06-10', memo: 'Restock kits', lines: [{ description: 'Receipt Scanner Kit', quantity: 5, unitPriceCents: 8_000, categoryAccountId: inventoryAsset, taxCode: 'HST', manualHstCents: null, productId: kit.id }] });
  await purchaseOrdersReceive({ id: po1.id, receivedDate: '2026-06-09' });
  await purchaseOrdersMatchSupplierBill({ id: po1.id, billDate: '2026-06-12', billNumber: 'AMZ-80211', paymentTerms: 'net30' });
  const po2 = await purchaseOrdersCreate({ vendorId: staples, poNumber: 'PO-4002', orderDate: '2026-08-05', expectedDate: null, memo: 'Autumn stationery', lines: [{ description: 'Stationery', quantity: 1, unitPriceCents: 22_000, categoryAccountId: officeSupplies, taxCode: 'HST', manualHstCents: null, productId: null }] });
  await purchaseOrdersConvertToBill({ id: po2.id, billDate: '2026-08-11', paymentTerms: 'net30', billNumber: 'STP-51022' });
  await purchaseOrdersCreate({ vendorId: bell, poNumber: 'PO-4003', orderDate: '2026-08-25', expectedDate: '2026-09-15', memo: 'Headsets', lines: [{ description: 'Headsets', quantity: 4, unitPriceCents: 6_000, categoryAccountId: officeSupplies, taxCode: 'HST', manualHstCents: null, productId: null }] });

  // ---- payroll: an hourly and a salaried employee, first quarter posted ----
  const sam = await employeesCreate({ name: 'Sam Patel', province: 'ON', payType: 'Hourly', hourlyRateCents: 2_800, annualSalaryCents: null, payPeriodsPerYear: 26, vacationPayRate: 0.04, sin: '046 454 286', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 1_226_000 });
  const kim = await employeesCreate({ name: 'Kim Nguyen', province: 'ON', payType: 'Salary', hourlyRateCents: null, annualSalaryCents: 6_000_000, payPeriodsPerYear: 12, vacationPayRate: 0.04, sin: '123 456 782', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 1_226_000 });
  const biweekly = [['2026-01-01', '2026-01-14', '2026-01-16'], ['2026-01-15', '2026-01-28', '2026-01-30'], ['2026-01-29', '2026-02-11', '2026-02-13'], ['2026-02-12', '2026-02-25', '2026-02-27'], ['2026-02-26', '2026-03-11', '2026-03-13'], ['2026-03-12', '2026-03-25', '2026-03-27']];
  for (const [start, end, pay] of biweekly) {
    const run = await payrollRunsCreate({ employeeId: sam.id, payPeriodStart: start, payPeriodEnd: end, payDate: pay, regularHours: 75, overtimeHours: 0 });
    await payrollRunsPost({ id: run.id, bankAccountId: chequing });
  }
  for (const [start, end, pay] of [['2026-01-01', '2026-01-31', '2026-01-30'], ['2026-02-01', '2026-02-28', '2026-02-27'], ['2026-03-01', '2026-03-31', '2026-03-31']]) {
    const run = await payrollRunsCreate({ employeeId: kim.id, payPeriodStart: start, payPeriodEnd: end, payDate: pay });
    await payrollRunsPost({ id: run.id, bankAccountId: chequing });
  }
  // One April run left as a draft, to be posted from the screen.
  await payrollRunsCreate({ employeeId: kim.id, payPeriodStart: '2026-04-01', payPeriodEnd: '2026-04-30', payDate: '2026-04-30' });

  // ---- mileage: a year of trips, first half claimed ----
  for (const [date, km, purpose] of [['2026-01-12', 42, 'Client visit — Maple'], ['2026-02-03', 18, 'Bank and post office'], ['2026-03-22', 120, 'CRA seminar — Mississauga'], ['2026-05-14', 36, 'Client visit — Cedar'], ['2026-08-19', 64, 'Client visit — Spruce']]) {
    await mileageCreate({ tripDate: date, kilometres: km, purpose, vehicle: '2022 Honda Civic', startLocation: 'Office', endLocation: null });
  }
  await mileagePostClaim({ year: 2026, entryDate: '2026-06-30' });

  // ---- GST/HST: the first quarter filed and paid; Q2 ready to file; Q3 in progress ----
  await hstFilingsCreate({ periodStart: '2026-01-01', periodEnd: '2026-03-31', filingDate: '2026-04-20', paymentAccountId: chequing, memo: 'Q1 2026 return' });

  // ---- recurring, tags, users ----
  await recurringTemplatesCreate({ name: 'Office rent', type: 'expense', moneyAccountId: chequing, categoryAccountId: rent, amountCents: 200_000, taxCode: 'HST', manualHstCents: null, description: 'Monthly office rent', scheduleFrequency: 'monthly', nextDueDate: '2026-09-01' });
  const dept = await tagGroupsCreate({ name: 'Department', description: 'Which side of the practice' });
  await tagsCreate({ tagGroupId: dept.id, name: 'Tax' });
  await tagsCreate({ tagGroupId: dept.id, name: 'Bookkeeping' });
  await accessSetupThreeUserDemo();

  // ---- what the screens should show ----
  const invoices = await invoicesList();
  const bills = await billsList();
  const runs = await payrollRunsList();
  const stock = await inventoryStatusReport({ asOfDate: '2026-08-31' });
  const kitOnHand = stock.rows.find((row) => row.productId === kit.id);
  const reports = await reportsHandlers();
  const openInvoices = invoices.filter((row) => row.balanceDueCents > 0);
  const openBills = bills.filter((row) => row.balanceDueCents > 0);
  const expected = {
    accountsReceivable: { count: openInvoices.length, totalCents: openInvoices.reduce((sum, row) => sum + row.balanceDueCents, 0), invoices: openInvoices.map((row) => ({ number: row.invoiceNumber, due: row.dueDate, balance: dollars(row.balanceDueCents) })) },
    accountsPayable: { count: openBills.length, totalCents: openBills.reduce((sum, row) => sum + row.balanceDueCents, 0), bills: openBills.map((row) => ({ number: row.billNumber, due: row.dueDate, balance: dollars(row.balanceDueCents) })) },
    payroll: { postedRuns: runs.filter((row) => row.status === 'posted').length, draftRuns: runs.filter((row) => row.status === 'draft').length, grossPaidCents: runs.filter((row) => row.status === 'posted').reduce((sum, row) => sum + row.grossPayCents, 0) },
    inventory: { receiptScannerKitsOnHand: kitOnHand?.quantityOnHand ?? null },
    ...reports,
  };
  const summary: SeedSummary = {
    filePath,
    company: FICTITIOUS_COMPANY_NAME,
    counts: { customers: 5, vendors: 5, invoices: invoices.length, bills: bills.length, payrollRuns: runs.length, employees: 2, estimates: 2, purchaseOrders: 3, creditNotes: 2, salesReceipts: 2, deposits: 1, hstFilings: 1, mileageTrips: 5, users: 3 },
    expected,
  };
  closeCompany();
  return summary;
}
