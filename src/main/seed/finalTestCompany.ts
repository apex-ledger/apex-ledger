/** Builds "Lakeshore Plumbing & Heating Inc." — the final acceptance company.
 *
 * A trades business in Toronto with every kind of record a client file carries: two chequing
 * accounts, savings and a cash box, three credit cards, HST / HST-exempt / GST-only customers and
 * vendors, stock and services, invoices in every state, bills paid from the bank and card spending
 * through Quick Entry, five employees on four pay frequencies in three provinces, EHT, a filed HST
 * quarter — and nine deliberate bookkeeping mistakes left in the books for the reviewer to find and
 * correct. Each mistake and the screen that fixes it is listed in docs/FINAL-TEST-COMPANY.md.
 *
 * Nothing here writes SQL. Every record goes through the same handler the screen would call, so
 * the mistakes are the kind a real user makes, not corrupted rows.
 */
import { closeCompany, createCompanyAt, getCurrentDb } from '../companyFile';
import { ensureAccountByName } from '../db/ensureAccount';
import { getAllAccounts } from '../db/queries';
import { accountsCreate } from '../ipc/accounts.handlers';
import { companyUpdate } from '../ipc/company.handlers';
import { customersSave, vendorsSave } from '../ipc/contacts.handlers';
import { productsCreate, inventoryStatusReport } from '../ipc/inventory.handlers';
import { depositsCreate, invoicesCreate, invoicesList, invoicesPayments, invoicesReceivePayment } from '../ipc/invoices.handlers';
import { salesReceiptsCreate, salesReceiptsUndepositedFundsAccountId } from '../ipc/salesReceipts.handlers';
import { creditNotesApply, creditNotesCreate } from '../ipc/creditNotes.handlers';
import { billsCreate, billsList, billsPay, billsSetApproval } from '../ipc/bills.handlers';
import { estimatesConvertToInvoice, estimatesCreate } from '../ipc/estimates.handlers';
import { employeesCreate, payrollEhtAccrue, payrollRunsCreate, payrollRunsList, payrollRunsPost } from '../ipc/payroll.handlers';
import { hstFilingsCreate } from '../ipc/hstFilings.handlers';
import { journalCreateAndPost } from '../ipc/journal.handlers';
import { quickEntryCreate } from '../ipc/quickEntry.handlers';
import { recurringTemplatesCreate } from '../ipc/recurringTemplates.handlers';
import { sql } from 'kysely';
import { reportsHandlers } from './reportsForSeed';
import type { SeedSummary } from './fictitiousCompany';

export const FINAL_TEST_COMPANY_NAME = 'Lakeshore Plumbing & Heating Inc.';

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const hst = (base: number) => Math.round(base * 0.13);
const gst = (base: number) => Math.round(base * 0.05);

export async function seedFinalTestCompany(filePath: string): Promise<SeedSummary> {
  await createCompanyAt(filePath, {
    legalName: FINAL_TEST_COMPANY_NAME,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    baseCurrency: 'CAD',
    businessNumber: '812345678RC0001',
    businessType: 'general_services',
    coaTemplateId: 'general_services',
  });
  await companyUpdate({
    hstNumber: '812345678RT0001',
    payrollNumber: '812345678RP0001',
    numberOfEmployees: 5,
    businessAddressLine1: '48 Lakeshore Boulevard East',
    businessCity: 'Toronto',
    businessProvince: 'ON',
    businessPostalCode: 'M5E 1A4',
    hstFilingFrequency: 'Quarterly',
    payrollRemitterType: 'regular',
    // Associated with another employer, so the $1M exemption is not available and EHT applies from the first dollar.
    ehtExemptionEligible: false,
    wsibClassCode: 'G',
    wsibRate: 2.1,
  });
  const db = getCurrentDb();

  // ---- accounts: the template's chart plus a second bank, a third card and inventory ----
  const accounts = await getAllAccounts(db);
  const byName = (name: string) => {
    const account = accounts.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (!account) throw new Error(`Template account missing: ${name}`);
    return account.id;
  };
  const chequing = byName('Chequing Account');
  const savings = byName('Savings Account');
  const cashBox = byName('Cash Account');
  const visa = byName('Visa');
  const mastercard = byName('Mastercard');
  const serviceRevenue = byName('Service Revenue');
  const consultingFees = byName('Consulting Fees');
  const otherRevenue = byName('Other Revenue');
  const interestIncome = byName('Interest Income');
  const cogs = byName('Cost of Goods Sold');
  const officeSupplies = byName('Office Supplies');
  const officeExpenses = byName('Office Expenses');
  const software = byName('Software & Subscriptions');
  const rent = byName('Rent / Lease');
  const telephone = byName('Telephone');
  const internet = byName('Internet');
  const utilities = byName('Utilities');
  const insurance = byName('Insurance');
  const meals = byName('Meals & Entertainment');
  const vehicle = byName('Motor Vehicle Expenses');
  const travel = byName('Travel Expenses');
  const subcontract = byName('Subcontract Costs');
  const licences = byName('Licenses & Permits');
  const bankCharges = byName('Bank Charges');
  const advertising = byName('Advertising & Promotion');
  const training = byName('Training & Education');
  const commonShares = byName('Common Shares');
  const dueToShareholder = byName('Due to Shareholder (Long-Term)');
  const vehicles = byName('Vehicles');
  const vehicleLoan = byName('Vehicle Loan');
  const interestLtd = byName('Interest & Bank Charges - Long-Term Debt');
  const tdChequing = (await accountsCreate({ code: '1001', name: 'TD Business Chequing', accountType: 'Asset', accountSubtype: 'Cash and Bank', gifiCode: '1002', accountNumber: '0421-5567890' })).id;
  const amex = (await accountsCreate({ code: '2070', name: 'American Express', accountType: 'Liability', accountSubtype: 'Credit Card', gifiCode: '2707' })).id;
  const inventoryAsset = await ensureAccountByName(db, 'Inventory', 'Asset', '1300', '1120', 'Current Asset');
  const undeposited = await salesReceiptsUndepositedFundsAccountId();

  // ---- opening money: share capital, a shareholder loan, a van on a loan, transfers ----
  const journal = (entryDate: string, memo: string, reference: string, lines: { accountId: number; debitCents?: number; creditCents?: number; description?: string }[]) =>
    journalCreateAndPost({ entryDate, memo, reference, lines: lines.map((l) => ({ accountId: l.accountId, debitCents: l.debitCents ?? 0, creditCents: l.creditCents ?? 0, description: l.description ?? memo })) });
  await journal('2026-01-02', 'Opening share capital', 'OPEN-1', [{ accountId: chequing, debitCents: 7_500_000 }, { accountId: commonShares, creditCents: 7_500_000 }]);
  await journal('2026-01-02', 'Shareholder loan to the company', 'OPEN-2', [{ accountId: chequing, debitCents: 1_500_000 }, { accountId: dueToShareholder, creditCents: 1_500_000 }]);
  await journal('2026-01-05', 'Service van financed — 2025 Ford Transit', 'VAN-1', [{ accountId: vehicles, debitCents: 4_200_000 }, { accountId: chequing, creditCents: 1_200_000 }, { accountId: vehicleLoan, creditCents: 3_000_000 }]);
  await journal('2026-01-08', 'Transfer to TD Business Chequing', 'TRF-1', [{ accountId: tdChequing, debitCents: 3_000_000 }, { accountId: chequing, creditCents: 3_000_000 }]);
  await journal('2026-01-08', 'Transfer to savings', 'TRF-2', [{ accountId: savings, debitCents: 500_000 }, { accountId: chequing, creditCents: 500_000 }]);
  await journal('2026-01-08', 'Cash box float', 'TRF-3', [{ accountId: cashBox, debitCents: 30_000 }, { accountId: chequing, creditCents: 30_000 }]);
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    await journal(`2026-${mm}-15`, `Van loan payment — 2026-${mm}`, `LOAN-2026-${mm}`, [{ accountId: vehicleLoan, debitCents: 55_000, description: 'Principal' }, { accountId: interestLtd, debitCents: 10_000, description: 'Interest' }, { accountId: chequing, creditCents: 65_000 }]);
  }

  // ---- customers ----
  const customer = async (name: string, extra: Record<string, unknown> = {}) => (await customersSave({ name, ...extra })).id;
  const mapleRidge = await customer('Maple Ridge Condominium Corp', { email: 'manager@mapleridge.example', phone: '(416) 555-0101', address: '120 Maple Ridge Drive, Toronto, ON, M4P 2K1', paymentTerms: 'net30', notes: 'Property manager — monthly maintenance contract' });
  const harbourview = await customer('Harbourview Restaurant Group', { email: 'ap@harbourview.example', phone: '(416) 555-0122', paymentTerms: 'net15' });
  const sixNations = await customer('Six Nations Housing Authority', { email: 'finance@sixnations.example', phone: '(519) 555-0140', address: 'Ohsweken, ON', paymentTerms: 'net30', notes: 'HST-exempt: work delivered on reserve. Use the NonHST code on every line.' });
  const calgaryPark = await customer('Calgary Office Park Ltd', { email: 'ap@calgarypark.example', phone: '(403) 555-0155', address: '900 6 Avenue SW, Calgary, AB, T2P 3K3', paymentTerms: 'net30', notes: 'Alberta customer — GST 5% only (GST_AB).' });
  const whitfield = await customer('Jane Whitfield', { email: 'jane.w@example.com', phone: '(647) 555-0166', address: '31 Birch Avenue, Toronto, ON', paymentTerms: 'dueOnReceipt', notes: 'Residential' });
  const cedarGrove = await customer('Cedar Grove Retirement Residence', { email: 'accounts@cedargrove.example', phone: '(905) 555-0170', paymentTerms: 'net30' });
  const northgate = await customer('Northgate Dental Clinic', { email: 'office@northgate.example', phone: '(416) 555-0188', paymentTerms: 'net15' });
  const cityParks = await customer('City of Toronto — Parks & Recreation', { email: 'ap.parks@toronto.example', paymentTerms: 'net60', notes: 'PO number required on every invoice' });
  const bakery = await customer('Lakeside Bakery', { email: 'owner@lakesidebakery.example', phone: '(416) 555-0199', paymentTerms: 'net15' });
  const evergreen = await customer('Evergreen Property Management', { email: 'ap@evergreen.example', paymentTerms: 'net30', lateInterestRatePercent: 18, notes: 'Late interest 18% per year per the service agreement' });
  const walkIn = await customer('Walk-in / Cash Customer', { paymentTerms: 'dueOnReceipt' });

  // ---- vendors ----
  const vendor = async (name: string, extra: Record<string, unknown> = {}) => (await vendorsSave({ name, ...extra })).id;
  const wolseley = await vendor('Wolseley Plumbing Supply', { email: 'ar@wolseley.example', phone: '1-800-555-0201', paymentTerms: 'net30', defaultExpenseAccountId: cogs });
  const emco = await vendor('Emco Corporation', { email: 'billing@emco.example', paymentTerms: 'net30', defaultExpenseAccountId: inventoryAsset });
  const bell = await vendor('Bell Canada', { email: 'billing@bell.example', phone: '1-800-555-0199', paymentTerms: 'net30', defaultExpenseAccountId: telephone });
  const bellDuplicate = await vendor('Bell Canada Inc.', { paymentTerms: 'net30', defaultExpenseAccountId: telephone, notes: 'MISTAKE 3 — duplicate of Bell Canada' });
  const rogers = await vendor('Rogers Communications', { paymentTerms: 'net30', defaultExpenseAccountId: internet });
  const enbridge = await vendor('Enbridge Gas', { paymentTerms: 'net30', defaultExpenseAccountId: utilities });
  const hydro = await vendor('Toronto Hydro', { paymentTerms: 'net30', defaultExpenseAccountId: utilities });
  const intact = await vendor('Intact Insurance', { paymentTerms: 'dueOnReceipt', defaultExpenseAccountId: insurance, notes: 'Insurance premiums are HST-exempt — NonHST' });
  const landlord = await vendor('Harbour Properties (Landlord)', { paymentTerms: 'net15', defaultExpenseAccountId: rent });
  const shell = await vendor('Shell Canada', { defaultExpenseAccountId: vehicle, notes: 'Fuel — paid by Visa' });
  const canadianTire = await vendor('Canadian Tire', { defaultExpenseAccountId: officeExpenses });
  const albertaPipe = await vendor('Alberta Pipe & Fitting Ltd', { address: 'Calgary, AB', paymentTerms: 'net30', defaultExpenseAccountId: cogs, notes: 'Alberta supplier — GST 5% only' });
  const cityLicensing = await vendor('City of Toronto — Licensing', { defaultExpenseAccountId: licences, notes: 'Licence fees — no HST' });
  const timHortons = await vendor('Tim Hortons', { defaultExpenseAccountId: meals });
  const reyes = await vendor('Jordan Reyes Contracting', { email: 'jordan@reyes.example', paymentTerms: 'net15', defaultExpenseAccountId: subcontract, isT5018Contractor: true, t4aBusinessNumber: '765432198RT0001' });
  const staples = await vendor('Staples Business', { paymentTerms: 'net30', defaultExpenseAccountId: officeSupplies });
  const amazon = await vendor('Amazon Business', { defaultExpenseAccountId: software });
  const airCanada = await vendor('Air Canada', { defaultExpenseAccountId: travel });
  const google = await vendor('Google Ads', { defaultExpenseAccountId: advertising });

  // ---- items: services and two stock products ----
  const service = async (name: string, cents: number, description: string) =>
    (await productsCreate({ sku: null, barcode: null, name, description, unit: 'each', salePriceCents: cents, purchasePriceCents: 0, incomeAccountId: serviceRevenue, cogsAccountId: null, assetAccountId: null, trackQuantity: false, defaultTaxCode: 'HST', reorderPoint: 0, productType: 'service' })).id;
  const serviceCall = await service('Service call — first hour', 12_000, 'Diagnosis and first hour on site');
  const labourHour = await service('Labour — additional hour', 9_500, 'Journeyman plumber, per hour');
  const heaterInstall = await service('Water heater installation', 45_000, 'Remove old unit, install and commission new one');
  const heater = await productsCreate({ sku: 'WH-40G', barcode: null, name: '40-gal gas water heater', description: 'Power-vent, 6-year tank warranty', unit: 'each', salePriceCents: 140_000, purchasePriceCents: 90_000, incomeAccountId: serviceRevenue, cogsAccountId: cogs, assetAccountId: inventoryAsset, trackQuantity: true, defaultTaxCode: 'HST', reorderPoint: 2, preferredVendorId: emco });
  const sumpPump = await productsCreate({ sku: 'SP-1/3', barcode: null, name: 'Sump pump 1/3 HP', description: 'Submersible, cast iron', unit: 'each', salePriceCents: 32_000, purchasePriceCents: 18_000, incomeAccountId: serviceRevenue, cogsAccountId: cogs, assetAccountId: inventoryAsset, trackQuantity: true, defaultTaxCode: 'HST', reorderPoint: 3, preferredVendorId: wolseley });

  // ---- bills ----
  const bill = (input: Record<string, unknown>) => billsCreate(input);
  const payBill = async (billId: number, paymentDate: string, bankAccountId: number, amountCents?: number) => {
    const current = (await billsList()).find((row) => row.id === billId)!;
    if (current.approvalStatus !== 'approved') {
      try { await billsSetApproval({ id: billId, approvalStatus: 'approved', approvedBy: 'Owner' }); } catch { /* already payable */ }
    }
    const fresh = (await billsList()).find((row) => row.id === billId)!;
    return billsPay({ id: billId, bankAccountId, paymentDate, amountCents: amountCents ?? fresh.balanceDueCents });
  };
  // Stock in first.
  const heaterBill = await bill({ vendorId: emco, billNumber: 'EMC-55102', billDate: '2026-01-12', dueDate: '2026-02-11', categoryAccountId: inventoryAsset, baseCents: 900_000, taxCode: 'HST', taxCents: hst(900_000), memo: '10 × 40-gal gas water heaters', productId: heater.id, quantity: 10 });
  await payBill(heaterBill.id, '2026-02-09', chequing);
  const pumpBill = await bill({ vendorId: wolseley, billNumber: 'WOL-10021', billDate: '2026-01-14', dueDate: '2026-02-13', categoryAccountId: inventoryAsset, baseCents: 180_000, taxCode: 'HST', taxCents: hst(180_000), memo: '10 × sump pumps', productId: sumpPump.id, quantity: 10 });
  await payBill(pumpBill.id, '2026-02-10', chequing);
  // MISTAKE 4 — the same Wolseley invoice keyed a second time, from the packing slip, without the prefix.
  await bill({ vendorId: wolseley, billNumber: '10021', billDate: '2026-01-14', dueDate: '2026-02-13', categoryAccountId: cogs, baseCents: 180_000, taxCode: 'HST', taxCents: hst(180_000), memo: 'Sump pumps (packing slip)' });
  // Materials through the year.
  for (const [num, date, due, base] of [['WOL-10388', '2026-02-20', '2026-03-22', 845_000], ['WOL-10902', '2026-04-03', '2026-05-03', 2_312_000], ['WOL-11440', '2026-06-11', '2026-07-11', 1_198_000]] as const) {
    const created = await bill({ vendorId: wolseley, billNumber: num, billDate: date, dueDate: due, categoryAccountId: cogs, baseCents: base, taxCode: 'HST', taxCents: hst(base), memo: 'Job materials' });
    await payBill(created.id, due, chequing);
  }
  const wolOpen = await bill({ vendorId: wolseley, billNumber: 'WOL-12007', billDate: '2026-08-14', dueDate: '2026-09-13', categoryAccountId: cogs, baseCents: 976_000, taxCode: 'HST', taxCents: hst(976_000), memo: 'Job materials — August' });
  void wolOpen;
  const restock = await bill({ vendorId: emco, billNumber: 'EMC-58890', billDate: '2026-05-19', dueDate: '2026-06-18', categoryAccountId: inventoryAsset, baseCents: 380_000, taxCode: 'HST', taxCents: hst(380_000), memo: '4 × 40-gal gas water heaters (price increase)', productId: heater.id, quantity: 4 });
  await payBill(restock.id, '2026-06-15', tdChequing);
  // Alberta supplier — GST only.
  const abBill = await bill({ vendorId: albertaPipe, billNumber: 'ABP-778', billDate: '2026-03-16', dueDate: '2026-04-15', categoryAccountId: cogs, baseCents: 820_000, taxCode: 'GST_AB', taxCents: gst(820_000), memo: 'Fittings for the Calgary job' });
  await payBill(abBill.id, '2026-04-10', chequing);
  // Rent: Jan–Jul paid, Aug open.
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    const created = await bill({ vendorId: landlord, billNumber: `RENT-2026-${mm}`, billDate: `2026-${mm}-01`, dueDate: `2026-${mm}-15`, categoryAccountId: rent, baseCents: 250_000, taxCode: 'HST', taxCents: hst(250_000), memo: `Shop and office rent — 2026-${mm}` });
    if (month <= 7) await payBill(created.id, `2026-${mm}-10`, chequing);
  }
  // Bell: monthly. MISTAKE 1 — May's bill coded to Office Supplies. MISTAKE 3 — July's bill on the duplicate vendor.
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    const wrongAccount = month === 5;
    const created = await bill({ vendorId: month === 7 ? bellDuplicate : bell, billNumber: `BELL-2026-${mm}`, billDate: `2026-${mm}-05`, dueDate: `2026-${mm}-25`, categoryAccountId: wrongAccount ? officeSupplies : telephone, baseCents: 9_500, taxCode: 'HST', taxCents: hst(9_500), memo: `Business phones — 2026-${mm}` });
    if (month <= 6) await payBill(created.id, `2026-${mm}-20`, chequing);
  }
  // Utilities. MISTAKE 8 — Enbridge's spring bill was entered under Toronto Hydro.
  const enbQ1 = await bill({ vendorId: enbridge, billNumber: 'ENB-2026-Q1', billDate: '2026-04-02', dueDate: '2026-04-22', categoryAccountId: utilities, baseCents: 64_000, taxCode: 'HST', taxCents: hst(64_000), memo: 'Natural gas — Jan to Mar' });
  await payBill(enbQ1.id, '2026-04-20', chequing);
  await bill({ vendorId: hydro, billNumber: 'ENB-2026-Q2', billDate: '2026-07-03', dueDate: '2026-07-23', categoryAccountId: utilities, baseCents: 21_500, taxCode: 'HST', taxCents: hst(21_500), memo: 'Natural gas — Apr to Jun' });
  const hydQ1 = await bill({ vendorId: hydro, billNumber: 'HYD-2026-Q1', billDate: '2026-04-06', dueDate: '2026-05-06', categoryAccountId: utilities, baseCents: 41_000, taxCode: 'HST', taxCents: hst(41_000), memo: 'Electricity — Jan to Mar' });
  await payBill(hydQ1.id, '2026-05-01', chequing);
  const hydQ2 = await bill({ vendorId: hydro, billNumber: 'HYD-2026-Q2', billDate: '2026-07-06', dueDate: '2026-08-05', categoryAccountId: utilities, baseCents: 38_500, taxCode: 'HST', taxCents: hst(38_500), memo: 'Electricity — Apr to Jun' });
  await payBill(hydQ2.id, '2026-07-30', chequing, 20_000); // partly paid
  // Insurance: annual liability policy, no HST.
  const intactBill = await bill({ vendorId: intact, billNumber: 'INT-2026-LIAB', billDate: '2026-01-15', dueDate: '2026-01-15', categoryAccountId: insurance, baseCents: 384_000, taxCode: 'NonHST', taxCents: 0, memo: 'Commercial general liability — 2026' });
  await payBill(intactBill.id, '2026-01-15', chequing);
  // Licence, no HST.
  const licence = await bill({ vendorId: cityLicensing, billNumber: 'LIC-2026-44871', billDate: '2026-02-02', dueDate: '2026-02-02', categoryAccountId: licences, baseCents: 42_500, taxCode: 'NonHST', taxCents: 0, memo: 'Plumbing contractor licence renewal' });
  await payBill(licence.id, '2026-02-02', chequing);
  // Subcontractor (T5018).
  const reyesMar = await bill({ vendorId: reyes, billNumber: 'JR-2026-03', billDate: '2026-03-27', dueDate: '2026-04-11', categoryAccountId: subcontract, baseCents: 1_840_000, taxCode: 'HST', taxCents: hst(1_840_000), memo: 'Cedar Grove re-pipe — labour' });
  await payBill(reyesMar.id, '2026-04-10', chequing);
  const reyesJun = await bill({ vendorId: reyes, billNumber: 'JR-2026-06', billDate: '2026-06-26', dueDate: '2026-07-11', categoryAccountId: subcontract, baseCents: 2_180_000, taxCode: 'HST', taxCents: hst(2_180_000), memo: 'City parks washrooms — labour' });
  await payBill(reyesJun.id, '2026-07-10', chequing);
  await bill({ vendorId: reyes, billNumber: 'JR-2026-08', billDate: '2026-08-28', dueDate: '2026-09-12', categoryAccountId: subcontract, baseCents: 96_000, taxCode: 'HST', taxCents: hst(96_000), memo: 'Evergreen boiler — labour' });
  // Staples: one paid, one open with a vendor credit against it.
  const stp1 = await bill({ vendorId: staples, billNumber: 'STP-30011', billDate: '2026-02-12', dueDate: '2026-03-14', categoryAccountId: officeSupplies, baseCents: 18_000, taxCode: 'HST', taxCents: hst(18_000), memo: 'Toner and paper' });
  await payBill(stp1.id, '2026-03-10', chequing);
  const stp2 = await bill({ vendorId: staples, billNumber: 'STP-31427', billDate: '2026-08-06', dueDate: '2026-09-05', categoryAccountId: officeSupplies, baseCents: 24_000, taxCode: 'HST', taxCents: hst(24_000), memo: 'Invoice books, labels' });
  const staplesCredit = await creditNotesCreate({ kind: 'vendor', contactId: staples, creditNoteNumber: 'VC-0001', creditNoteDate: '2026-08-12', memo: 'Damaged labels returned', lines: [{ description: 'Labels returned', quantity: 1, unitPriceCents: 4_000, categoryAccountId: officeSupplies, taxCode: 'HST' }] });
  await creditNotesApply({ id: staplesCredit.id, targetId: stp2.id });

  // ---- quick entries: cards, cash box, bank charges, small income ----
  const spend = (entryDate: string, moneyAccountId: number, categoryAccountId: number, baseCents: number, taxCode: 'HST' | 'NonHST' | 'MealsHST' | 'GST_AB' | null, description: string, taxCents?: number) =>
    quickEntryCreate({ type: 'expense', entryDate, moneyAccountId, categoryAccountId, baseCents, taxCode, taxCents: taxCents ?? (taxCode === 'HST' || taxCode === 'MealsHST' ? hst(baseCents) : taxCode === 'GST_AB' ? gst(baseCents) : 0), description });
  const income = (entryDate: string, moneyAccountId: number, categoryAccountId: number, baseCents: number, taxCode: 'HST' | 'NonHST', description: string) =>
    quickEntryCreate({ type: 'income', entryDate, moneyAccountId, categoryAccountId, baseCents, taxCode, taxCents: taxCode === 'HST' ? hst(baseCents) : 0, description });
  // Visa: fuel, tools, software, insurance instalments.
  for (const [date, base] of [['2026-01-19', 8_500], ['2026-02-16', 9_200], ['2026-03-18', 8_800], ['2026-04-20', 9_600], ['2026-05-19', 10_100], ['2026-06-14', 8_500], ['2026-07-21', 9_900], ['2026-08-18', 9_300]] as const) {
    await spend(date, visa, vehicle, base, 'HST', 'Shell Canada — van fuel');
  }
  // MISTAKE 5 — the June fuel receipt was keyed twice.
  await spend('2026-06-14', visa, vehicle, 8_500, 'HST', 'Shell Canada — van fuel');
  await spend('2026-02-24', visa, officeExpenses, 26_000, 'HST', 'Canadian Tire — drill and hole saw kit');
  // MISTAKE 7 — the August tools receipt was dated in the wrong year.
  await spend('2025-08-11', visa, officeExpenses, 14_200, 'HST', 'Canadian Tire — pipe wrenches');
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    await spend(`2026-${mm}-03`, visa, software, 4_900, 'HST', 'Amazon Business — Jobber subscription');
    // Van insurance instalment, HST-exempt. MISTAKE 2 — April's instalment was keyed with HST.
    await spend(`2026-${mm}-28`, visa, insurance, 31_000, month === 4 ? 'HST' : 'NonHST', 'Intact Insurance — van policy instalment');
  }
  // Mastercard: internet, meals, advertising.
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    await spend(`2026-${mm}-09`, mastercard, internet, 11_000, 'HST', 'Rogers — shop internet');
    await spend(`2026-${mm}-12`, mastercard, meals, 2_400, 'MealsHST', 'Tim Hortons — crew coffee');
    await spend(`2026-${mm}-27`, mastercard, advertising, 15_000, 'HST', 'Google Ads');
  }
  // Amex: travel for the Calgary job.
  await spend('2026-03-09', amex, travel, 64_000, 'HST', 'Air Canada — Toronto to Calgary');
  await spend('2026-03-11', amex, travel, 41_000, 'GST_AB', 'Hotel — Calgary, 2 nights');
  await spend('2026-03-11', amex, meals, 9_800, 'MealsHST', 'Meals — Calgary trip');
  await spend('2026-05-22', amex, training, 89_000, 'HST', 'Ontario plumbing code course — 2 staff');
  // Cash box.
  await spend('2026-02-05', cashBox, officeExpenses, 4_000, 'HST', 'Hardware store — fittings');
  await spend('2026-04-14', cashBox, vehicle, 1_500, 'HST', 'Parking — downtown job');
  await spend('2026-07-08', cashBox, officeSupplies, 2_200, 'HST', 'Dollarama — markers, tape');
  // Bank charges, no HST.
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    await spend(`2026-${mm}-31`.replace('-02-31', '-02-28').replace('-04-31', '-04-30').replace('-06-31', '-06-30'), chequing, bankCharges, 1_650, 'NonHST', 'Monthly account fee');
  }
  // Small income.
  await income('2026-03-31', savings, interestIncome, 1_250, 'NonHST', 'Savings interest — Q1');
  await income('2026-06-30', savings, interestIncome, 1_310, 'NonHST', 'Savings interest — Q2');
  await income('2026-05-27', cashBox, otherRevenue, 20_000, 'HST', 'Scrap copper sold');
  // Card payments from the bank.
  for (const [date, amount] of [['2026-02-20', 96_800], ['2026-03-20', 52_100], ['2026-04-20', 52_600], ['2026-05-20', 60_600], ['2026-06-20', 53_500], ['2026-07-20', 62_300], ['2026-08-20', 53_900]] as const) {
    await journal(date, 'Visa payment', `VISA-${date}`, [{ accountId: visa, debitCents: amount }, { accountId: chequing, creditCents: amount }]);
  }
  for (const [date, amount] of [['2026-02-25', 32_100], ['2026-03-25', 32_100], ['2026-04-25', 32_100], ['2026-05-25', 32_100], ['2026-06-25', 32_100], ['2026-07-25', 32_100]] as const) {
    await journal(date, 'Mastercard payment', `MC-${date}`, [{ accountId: mastercard, debitCents: amount }, { accountId: chequing, creditCents: amount }]);
  }
  await journal('2026-04-15', 'American Express payment', 'AMEX-2026-04-15', [{ accountId: amex, debitCents: 126_400 }, { accountId: tdChequing, creditCents: 126_400 }]);

  // ---- invoices ----
  type Line = { productId?: number | null; description: string; quantity: number; unitPriceCents: number; taxCode?: 'HST' | 'NonHST' | 'GST_AB' | null; revenueAccountId?: number };
  const invoice = (customerId: number, invoiceNumber: string, invoiceDate: string, dueDate: string, lines: Line[], extra: Record<string, unknown> = {}) =>
    invoicesCreate({ customerId, invoiceNumber, invoiceDate, dueDate, lines: lines.map((l) => ({ productId: l.productId ?? null, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, revenueAccountId: l.revenueAccountId ?? serviceRevenue, taxCode: l.taxCode === undefined ? 'HST' : l.taxCode })), ...extra });
  const receive = (invoiceId: number, paymentDate: string, amountCents: number, bankAccountId: number | null) => invoicesReceivePayment({ id: invoiceId, paymentDate, amountCents, bankAccountId });

  const inv1 = await invoice(mapleRidge, 'INV-1001', '2026-01-20', '2026-02-19', [{ productId: serviceCall, description: 'Service call — burst pipe, unit 402', quantity: 1, unitPriceCents: 12_000 }, { productId: labourHour, description: 'Additional labour', quantity: 6, unitPriceCents: 9_500 }, { description: 'Materials — copper, fittings', quantity: 1, unitPriceCents: 38_000 }]);
  await receive(inv1.id, '2026-02-15', inv1.balanceDueCents, chequing);
  const inv2 = await invoice(harbourview, 'INV-1002', '2026-02-03', '2026-02-18', [{ productId: heater.id, description: '40-gal gas water heater', quantity: 1, unitPriceCents: 140_000 }, { productId: heaterInstall, description: 'Water heater installation', quantity: 1, unitPriceCents: 45_000 }]);
  await receive(inv2.id, '2026-02-27', inv2.balanceDueCents, null);
  const inv3 = await invoice(sixNations, 'INV-1003', '2026-03-05', '2026-04-04', [{ productId: sumpPump.id, description: 'Sump pump 1/3 HP', quantity: 2, unitPriceCents: 32_000, taxCode: 'NonHST' }, { productId: labourHour, description: 'Installation labour — on reserve', quantity: 8, unitPriceCents: 9_500, taxCode: 'NonHST' }]);
  await receive(inv3.id, '2026-04-01', inv3.balanceDueCents, chequing);
  const inv4 = await invoice(calgaryPark, 'INV-1004', '2026-03-12', '2026-04-11', [{ description: 'Mechanical room assessment — Calgary', quantity: 40, unitPriceCents: 9_500, taxCode: 'GST_AB', revenueAccountId: consultingFees }, { description: 'Fittings supplied', quantity: 1, unitPriceCents: 1_500_000, taxCode: 'GST_AB' }]);
  await receive(inv4.id, '2026-04-10', inv4.balanceDueCents, chequing);
  const inv5 = await invoice(whitfield, 'INV-1005', '2026-03-20', '2026-03-20', [{ productId: serviceCall, description: 'Service call — kitchen drain', quantity: 1, unitPriceCents: 12_000 }, { productId: labourHour, description: 'Additional labour', quantity: 2, unitPriceCents: 9_500 }, { description: 'P-trap and fittings', quantity: 1, unitPriceCents: 6_500 }]);
  await receive(inv5.id, '2026-03-20', 20_000, null); // partial; 24,270 open and overdue
  const inv6 = await invoice(cedarGrove, 'INV-1006', '2026-04-08', '2026-05-08', [{ description: 'Re-pipe — east wing (fixed quote)', quantity: 1, unitPriceCents: 8_600_000 }, { productId: heater.id, description: '40-gal gas water heater', quantity: 2, unitPriceCents: 140_000 }]);
  const cedarCredit = await creditNotesCreate({ kind: 'customer', contactId: cedarGrove, creditNoteNumber: 'CN-0001', creditNoteDate: '2026-04-20', memo: 'Drywall repair allowance', lines: [{ description: 'Allowance — drywall repair', quantity: 1, unitPriceCents: 40_000, categoryAccountId: serviceRevenue, taxCode: 'HST' }] });
  await creditNotesApply({ id: cedarCredit.id, targetId: inv6.id });
  const inv6AfterCredit = (await invoicesList()).find((row) => row.id === inv6.id)!;
  await receive(inv6.id, '2026-05-06', inv6AfterCredit.balanceDueCents, chequing);
  const inv7 = await invoice(northgate, 'INV-1007', '2026-04-22', '2026-05-07', [{ productId: serviceCall, description: 'Service call — sterilizer supply line', quantity: 1, unitPriceCents: 12_000 }, { productId: labourHour, description: 'Additional labour', quantity: 3, unitPriceCents: 9_500 }, { description: 'Braided supply lines, valves', quantity: 1, unitPriceCents: 14_400 }]);
  const inv8 = await invoice(cityParks, 'INV-1008', '2026-05-06', '2026-07-05', [{ description: 'Washroom fixture replacement — Riverdale Park (PO 2026-PR-0331)', quantity: 1, unitPriceCents: 12_800_000 }], { customerPoNumber: '2026-PR-0331' });
  await receive(inv8.id, '2026-07-03', inv8.balanceDueCents, chequing);
  const inv9 = await invoice(bakery, 'INV-1009', '2026-05-18', '2026-06-02', [{ description: 'Grease interceptor service and re-seal', quantity: 1, unitPriceCents: 156_000 }]);
  // MISTAKE 6 — the bakery's payment was received into Savings; it was deposited to Chequing.
  await receive(inv9.id, '2026-06-01', inv9.balanceDueCents, savings);
  const inv10 = await invoice(evergreen, 'INV-1010', '2026-06-02', '2026-07-02', [{ description: 'Boiler inspection — 3 buildings', quantity: 3, unitPriceCents: 120_000 }, { productId: labourHour, description: 'Repairs — 14 Elm, boiler relief valve', quantity: 4, unitPriceCents: 9_500 }]);
  const inv11 = await invoice(mapleRidge, 'INV-1011', '2026-06-30', '2026-07-30', [{ description: 'Monthly maintenance contract — Q2', quantity: 3, unitPriceCents: 450_000 }]);
  const inv11q1 = await invoice(mapleRidge, 'INV-1010A', '2026-03-31', '2026-04-30', [{ description: 'Monthly maintenance contract — Q1', quantity: 3, unitPriceCents: 450_000 }]);
  await receive(inv11q1.id, '2026-04-28', inv11q1.balanceDueCents, chequing);
  const inv12 = await invoice(harbourview, 'INV-1012', '2026-07-15', '2026-07-30', [{ productId: serviceCall, description: 'Service call — dish pit backup', quantity: 1, unitPriceCents: 12_000 }, { productId: labourHour, description: 'Drain auger, 2 hours', quantity: 2, unitPriceCents: 9_500 }]);
  await receive(inv12.id, '2026-07-29', inv12.balanceDueCents, chequing);
  const inv13 = await invoice(mapleRidge, 'INV-1013', '2026-08-20', '2026-09-19', [{ productId: heater.id, description: '40-gal gas water heater — unit 210', quantity: 1, unitPriceCents: 140_000 }, { productId: heaterInstall, description: 'Water heater installation', quantity: 1, unitPriceCents: 45_000 }]);
  const inv14 = await invoice(sixNations, 'INV-1014', '2026-08-26', '2026-09-25', [{ productId: sumpPump.id, description: 'Sump pump 1/3 HP', quantity: 3, unitPriceCents: 32_000, taxCode: 'NonHST' }, { productId: labourHour, description: 'Installation labour — on reserve', quantity: 10, unitPriceCents: 9_500, taxCode: 'NonHST' }]);
  void inv7; void inv10; void inv11; void inv13; void inv14;

  // Sales receipts: cash sales, one straight to the bank, one waiting in Undeposited Funds.
  await salesReceiptsCreate({ customerId: walkIn, receiptNumber: 'SR-2001', receiptDate: '2026-02-10', depositToAccountId: chequing, lines: [{ description: 'Faucet cartridge and install', quantity: 1, unitPriceCents: 15_000, revenueAccountId: serviceRevenue, productId: null, taxCode: 'HST' }] });
  const sr2 = await salesReceiptsCreate({ customerId: walkIn, receiptNumber: 'SR-2002', receiptDate: '2026-02-27', depositToAccountId: undeposited, lines: [{ productId: sumpPump.id, description: 'Sump pump 1/3 HP — counter sale', quantity: 1, unitPriceCents: 32_000, revenueAccountId: serviceRevenue, taxCode: 'HST' }] });
  await salesReceiptsCreate({ customerId: whitfield, receiptNumber: 'SR-2003', receiptDate: '2026-08-05', depositToAccountId: cashBox, lines: [{ description: 'Outdoor tap winterizing', quantity: 1, unitPriceCents: 9_000, revenueAccountId: serviceRevenue, productId: null, taxCode: 'HST' }] });
  const inv2Payments = await invoicesPayments(inv2.id);
  await depositsCreate({ invoicePaymentIds: inv2Payments.map((row) => row.id), salesReceiptIds: [sr2.id], bankAccountId: chequing, depositDate: '2026-03-02' });

  // Estimates: one became INV-1006's follow-on job, one still open.
  const est1 = await estimatesCreate({ customerId: evergreen, estimateNumber: 'EST-3001', estimateDate: '2026-08-10', expiryDate: '2026-09-10', memo: 'Boiler replacement — 14 Elm', lines: [{ description: 'Boiler replacement, supply and install', quantity: 1, unitPriceCents: 4_600_000, revenueAccountId: serviceRevenue, taxCode: 'HST', manualHstCents: null, productId: null }] });
  await estimatesConvertToInvoice({ id: est1.id, invoiceDate: '2026-08-29', paymentTerms: 'net30' });
  await estimatesCreate({ customerId: northgate, estimateNumber: 'EST-3002', estimateDate: '2026-08-24', expiryDate: '2026-09-24', memo: 'Second operatory rough-in', lines: [{ description: 'Rough-in plumbing, second operatory', quantity: 1, unitPriceCents: 1_420_000, revenueAccountId: serviceRevenue, taxCode: 'HST', manualHstCents: null, productId: null }] });

  // ---- payroll: five people, four frequencies, three provinces ----
  const marco = await employeesCreate({ name: 'Marco Silva', province: 'ON', payType: 'Hourly', hourlyRateCents: 3_400, payPeriodsPerYear: 26, vacationPayRate: 0.04, sin: '046 454 286', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 1_298_900, addressLine1: '88 Danforth Avenue', addressCity: 'Toronto', addressProvince: 'ON', addressPostalCode: 'M4K 1N2' });
  const priya = await employeesCreate({ name: 'Priya Shah', province: 'ON', payType: 'Salary', annualSalaryCents: 5_800_000, payPeriodsPerYear: 24, vacationPayRate: 0.04, sin: '123 456 782', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 1_298_900, healthBenefitCents: 12_000, rrspEmployerMatchCents: 10_000, addressLine1: '12 Queen Street East', addressCity: 'Toronto', addressProvince: 'ON', addressPostalCode: 'M5C 1R6' });
  const dan = await employeesCreate({ name: 'Dan Okafor', province: 'ON', payType: 'Hourly', hourlyRateCents: 2_200, payPeriodsPerYear: 52, vacationPayRate: 0.04, vacationPayAccrued: true, sin: '193 456 787', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 1_298_900, addressLine1: '5 Bloor Street West', addressCity: 'Toronto', addressProvince: 'ON', addressPostalCode: 'M4W 1A1' });
  const lena = await employeesCreate({ name: 'Lena Fischer', province: 'BC', payType: 'Salary', annualSalaryCents: 7_200_000, payPeriodsPerYear: 12, vacationPayRate: 0.06, sin: '130 692 544', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 1_321_600, healthBenefitCents: 15_000, addressLine1: '400 Burrard Street', addressCity: 'Vancouver', addressProvince: 'BC', addressPostalCode: 'V6C 3A6' });
  const sam = await employeesCreate({ name: 'Sam Tremblay', province: 'AB', payType: 'Hourly', hourlyRateCents: 3_000, payPeriodsPerYear: 26, vacationPayRate: 0.04, sin: '272 342 573', federalTotalClaimCents: 1_614_000, provincialTotalClaimCents: 2_276_900, addressLine1: '1200 17 Avenue SW', addressCity: 'Calgary', addressProvince: 'AB', addressPostalCode: 'T2T 0B8' });
  const post = async (input: Record<string, unknown>, bankAccountId = chequing) => {
    const run = await payrollRunsCreate(input);
    await payrollRunsPost({ id: run.id, bankAccountId });
    return run;
  };
  // Marco — biweekly, overtime some periods. MISTAKE 9 — the 2026-05-07 to 05-20 run was posted with 40 hours instead of 80.
  const biweekly = (() => {
    const out: Array<[string, string, string]> = [];
    let start = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 14; i += 1) {
      const end = new Date(start.getTime() + 13 * 86_400_000);
      const pay = new Date(end.getTime() + 2 * 86_400_000);
      out.push([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), pay.toISOString().slice(0, 10)]);
      start = new Date(end.getTime() + 86_400_000);
    }
    return out;
  })();
  for (const [index, [start, end, pay]] of biweekly.entries()) {
    if (pay > '2026-08-31') break;
    const overtime = [2, 5, 9, 12].includes(index) ? 6 : 0;
    const wrongHours = start === '2026-05-07';
    await post({ employeeId: marco.id, payPeriodStart: start, payPeriodEnd: end, payDate: pay, regularHours: wrongHours ? 40 : 80, overtimeHours: overtime });
  }
  // Sam — biweekly in Alberta, started in March.
  for (const [start, end, pay] of biweekly) {
    if (start < '2026-03-05' || pay > '2026-08-31') continue;
    await post({ employeeId: sam.id, payPeriodStart: start, payPeriodEnd: end, payDate: pay, regularHours: 80, overtimeHours: 0 }, tdChequing);
  }
  // Priya — semi-monthly with union dues, a spring bonus and one expense reimbursement.
  for (let month = 1; month <= 8; month += 1) {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    const items = (extra: Record<string, unknown>[]) => [{ name: 'Union dues', kind: 'deduction', taxApplies: false, t4Box: 'unionDues44', amountCents: 2_500 }, ...extra];
    await post({ employeeId: priya.id, payPeriodStart: `2026-${mm}-01`, payPeriodEnd: `2026-${mm}-15`, payDate: `2026-${mm}-15`, items: items(month === 4 ? [{ name: 'Spring bonus', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, amountCents: 100_000 }] : []) });
    await post({ employeeId: priya.id, payPeriodStart: `2026-${mm}-16`, payPeriodEnd: `2026-${mm}-${lastDay}`, payDate: `2026-${mm}-${lastDay}`, items: items(month === 6 ? [{ name: 'Mileage reimbursement', kind: 'reimbursement', amountCents: 8_400, accountId: vehicle }] : []) });
  }
  // Dan — weekly part-time, vacation accrued rather than paid.
  {
    let start = new Date(Date.UTC(2026, 0, 5));
    while (true) {
      const end = new Date(start.getTime() + 6 * 86_400_000);
      const pay = new Date(end.getTime() + 3 * 86_400_000);
      const payIso = pay.toISOString().slice(0, 10);
      if (payIso > '2026-08-31') break;
      await post({ employeeId: dan.id, payPeriodStart: start.toISOString().slice(0, 10), payPeriodEnd: end.toISOString().slice(0, 10), payDate: payIso, regularHours: 24, overtimeHours: 0 });
      start = new Date(end.getTime() + 86_400_000);
    }
  }
  // Lena — monthly in BC with a taxable vehicle benefit; July left as a draft to be posted from the screen.
  for (let month = 1; month <= 7; month += 1) {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    const input = { employeeId: lena.id, payPeriodStart: `2026-${mm}-01`, payPeriodEnd: `2026-${mm}-${lastDay}`, payDate: `2026-${mm}-${lastDay}`, items: [{ name: 'Company vehicle — standby charge', kind: 'taxableBenefit', cppApplies: true, eiApplies: false, taxApplies: true, amountCents: 15_000 }] };
    if (month === 7) await payrollRunsCreate(input);
    else await post(input);
  }
  // Source deductions remitted to CRA on the 15th of the following month, January to July; August stays owing.
  const remitPayable = byName('Payroll Remittances Payable');
  const postedRuns = (await payrollRunsList()).filter((r) => r.status === 'posted');
  for (let month = 1; month <= 7; month += 1) {
    const mm = String(month).padStart(2, '0');
    const amount = postedRuns.filter((r) => r.payDate.startsWith(`2026-${mm}`)).reduce((sum, r) => sum + r.cpp1EmployeeCents + r.cpp1EmployerCents + r.cpp2EmployeeCents + r.cpp2EmployerCents + r.eiEmployeeCents + r.eiEmployerCents + r.incomeTaxCents, 0);
    if (amount > 0) await journal(`2026-${String(month + 1).padStart(2, '0')}-15`, `PD7A remittance — ${mm}/2026 source deductions`, `PD7A-2026-${mm}`, [{ accountId: remitPayable, debitCents: amount }, { accountId: chequing, creditCents: amount }]);
  }
  // Ontario EHT accrued on the first half.
  await payrollEhtAccrue({ taxYear: 2026, throughDate: '2026-06-30' });

  // ---- GST/HST: Q1 filed and paid; Q2 ready to file ----
  await hstFilingsCreate({ periodStart: '2026-01-01', periodEnd: '2026-03-31', filingDate: '2026-04-28', paymentAccountId: chequing, memo: 'Q1 2026 return' });

  // ---- recurring ----
  await recurringTemplatesCreate({ name: 'Shop rent', type: 'expense', moneyAccountId: chequing, categoryAccountId: rent, amountCents: 250_000, taxCode: 'HST', manualHstCents: null, description: 'Shop and office rent', scheduleFrequency: 'monthly', nextDueDate: '2026-09-01' });

  // The books were "keyed on the day": stamp each record's Entered time on its own date, so the
  // backdating test judges the entries rather than the seed run.
  await sql`UPDATE journal_entries SET created_at = entry_date || ' 17:00:00', posted_at = COALESCE(posted_at, entry_date || ' 17:00:00')`.execute(db);
  await sql`UPDATE invoices SET created_at = invoice_date || ' 16:30:00'`.execute(db);
  await sql`UPDATE bills SET created_at = bill_date || ' 16:30:00'`.execute(db);
  await sql`UPDATE payroll_runs SET created_at = pay_date || ' 09:00:00'`.execute(db);

  // ---- summary ----
  const invoices = await invoicesList();
  const bills = await billsList();
  const runs = await payrollRunsList();
  const stock = await inventoryStatusReport({ asOfDate: '2026-08-31' });
  const onHand = (id: number) => stock.rows.find((row) => row.productId === id)?.quantityOnHand ?? null;
  const reports = await reportsHandlers();
  const openInvoices = invoices.filter((row) => row.balanceDueCents > 0);
  const openBills = bills.filter((row) => row.balanceDueCents > 0);
  const paidBills = bills.filter((row) => row.balanceDueCents === 0);
  const expected = {
    accountsReceivable: { count: openInvoices.length, totalCents: openInvoices.reduce((sum, row) => sum + row.balanceDueCents, 0), invoices: openInvoices.map((row) => ({ number: row.invoiceNumber, due: row.dueDate, balance: dollars(row.balanceDueCents) })) },
    accountsPayable: { count: openBills.length, totalCents: openBills.reduce((sum, row) => sum + row.balanceDueCents, 0), bills: openBills.map((row) => ({ number: row.billNumber, due: row.dueDate, balance: dollars(row.balanceDueCents) })) },
    billsPaid: { count: paidBills.length, totalCents: paidBills.reduce((sum, row) => sum + row.amountCents, 0) },
    payroll: { postedRuns: runs.filter((row) => row.status === 'posted').length, draftRuns: runs.filter((row) => row.status === 'draft').length, grossPaidCents: runs.filter((row) => row.status === 'posted').reduce((sum, row) => sum + row.grossPayCents, 0) },
    inventory: { waterHeatersOnHand: onHand(heater.id), sumpPumpsOnHand: onHand(sumpPump.id) },
    ...reports,
  };
  const summary: SeedSummary = {
    filePath,
    company: FINAL_TEST_COMPANY_NAME,
    counts: { customers: 11, vendors: 19, invoices: invoices.length, bills: bills.length, payrollRuns: runs.length, employees: 5, estimates: 2, creditNotes: 2, salesReceipts: 3, deposits: 1, hstFilings: 1, bankAccounts: 4, creditCards: 3, mistakes: 9 },
    expected,
  };
  closeCompany();
  return summary;
}
