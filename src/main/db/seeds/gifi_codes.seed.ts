import type { AppDb } from '../schema';
import type { GifiStatementType } from '@shared/domain/types';

/**
 * CRA GIFI codes covering the general Schedule 100 (Balance Sheet) and Schedule 125 (Income
 * Statement) items used by Canadian corporations across every mainstream industry — general/
 * professional services, retail, real estate, construction, manufacturing, transportation,
 * healthcare, non-profits, and more. Expanded well beyond the original ~110-row starter set by
 * cross-checking every row against CRA's own complete GIFI item list (RC4088 Appendix A, the
 * full 700+ code list the T1178-Short form summarizes). Accountants should still verify codes
 * against the current CRA GIFI list before filing, and can add/edit codes freely — this is a
 * curated common-use list, not an exhaustive one.
 *
 * Deliberately excluded: the industry-specific supplementary GIFI schedules for oil & gas,
 * mining, forestry/logging, and commercial fishing (their own item ranges, e.g. drilling/well
 * costs, log yard costs, fishing gear, Crown royalties) and the separate Farming GIFI schedule —
 * these are distinct CRA forms with their own item numbering, not part of the general Schedule
 * 100/125 this app targets, and mixing them in would risk suggesting the wrong code for a
 * business that doesn't file those schedules.
 *
 * Confidence, per row, is one of four tiers (see the inline comment on each row below):
 * - T1178: taken directly from CRA's own official "T1178 — General Index of Financial
 *   Information (GIFI) – Short" form (the actual filing form, not a secondary description of
 *   it) — the highest-confidence tier, since it's literally what gets filed. The short form
 *   rolls many detailed codes up into broader summary lines (e.g. 1000 "Cash and deposits"
 *   covers what the full/detailed GIFI system further breaks into 1001-1007) — codes from other
 *   tiers below that fall inside one of these rollup ranges aren't necessarily wrong just because
 *   they don't appear on the short form themselves.
 * - CONFIRMED: taken directly from CRA's own official GIFI guide (RC4088, General Index of
 *   Financial Information) and/or its own published GIFI examples ("Example 1 — Financial
 *   statements for a corporation" and "Example 2 — Financial statements for a partnership").
 * - SECONDARY: not found in the CRA sources above, sourced from a CPA-firm reference
 *   (madanca.com) — reasonable but not verified against a primary CRA document.
 * - UNVERIFIED: kept from this app's original starter list. Not contradicted by any CRA source
 *   above, but never confirmed against any source either — treat as a placeholder.
 *
 * This file has twice now had rows found to be flatly wrong by direct conflict with a primary
 * CRA source (first against CRA's own worked examples, then a second pass against the actual
 * T1178 form itself — e.g. this file previously had 8910 = "Motor vehicle expenses" when the
 * T1178 form shows 8910 = "Rental", and 3300 = "Contributed surplus" when the form shows 3300 =
 * "Due to related parties", an entirely different liability line). Wrong codes found this way are
 * corrected or removed rather than carried forward, since a wrong code is worse than no code.
 *
 * `is_custom = 0` marks these shipped rows so a future app update can safely refresh descriptions
 * here (see seedGifiCodes below) without ever touching or deleting a user-added code.
 */
export interface GifiCodeSeedRow {
  code: string;
  description: string;
  statementType: GifiStatementType;
  category: string;
}

export const GIFI_CODES_SEED: GifiCodeSeedRow[] = [
  // --- Balance Sheet: Assets ---
  { code: '1000', description: 'Cash and deposits (rollup of 1001-1007)', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1001', description: 'Cash (bank drafts, cheques, coins, currency)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED
  { code: '1002', description: 'Deposits in Canadian banks — Canadian currency', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED
  { code: '1003', description: 'Deposits in Canadian banks and institutions — Foreign currency', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1004', description: 'Deposits in foreign banks — Canadian currency', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1005', description: 'Deposits in foreign banks — Foreign currency', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  // Removed this pass: '1010' "Petty cash" was never a real GIFI code — cross-checked against
  // CRA's complete GIFI item list (RC4088 Appendix A) and no such code exists; petty cash rolls
  // into 1001 "Cash" instead (see CoA templates, which already use 1001 for their Cash Account).
  { code: '1060', description: 'Accounts receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1061', description: 'Allowance for doubtful accounts', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1062', description: 'Trade accounts receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1063', description: 'Allowance for doubtful trade accounts receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1066', description: 'Taxes receivable (GST/HST, income tax refunds, tax credits)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED
  { code: '1067', description: 'Interest receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1068', description: 'Holdbacks receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1069', description: 'Leases receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1071', description: 'Accounts receivable from employees', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1120', description: 'Inventories', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1121', description: 'Inventory of goods for sale (finished goods)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1122', description: 'Inventory parts and supplies', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1123', description: 'Inventory properties (real estate/construction held for sale)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1125', description: 'Work in progress (goods in process)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1126', description: 'Raw materials', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1180', description: 'Short-term investments', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1182', description: 'Canadian shares (short-term)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1183', description: 'Canadian bonds (short-term)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1184', description: 'Canadian treasury bills', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1240', description: 'Loans and notes receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1241', description: 'Demand loans receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1243', description: 'Notes receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1244', description: 'Mortgages receivable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1300', description: 'Due from shareholder(s)/director(s)', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1301', description: 'Due from individual shareholder(s)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1302', description: 'Due from corporate shareholder(s)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1303', description: 'Due from director(s)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1480', description: 'Other current assets (rollup of 1481-1486)', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  { code: '1481', description: 'Future (deferred) income taxes (current)', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1482', description: 'Accrued investment income', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1483', description: 'Taxes recoverable/refundable', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1484', description: 'Prepaid expenses', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED
  { code: '1486', description: 'Security/tender deposits', statementType: 'BalanceSheet', category: 'Current Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1599', description: 'Total current assets', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178
  // Corrected this pass: previously coded 1580/1600/1620 — T1178 shows Land=1600, Buildings=1680,
  // and 1620 is actually a different line entirely ("Depletable assets"), not accumulated
  // amortization of buildings (that's 1681).
  { code: '1600', description: 'Land', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1601', description: 'Land improvements', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1602', description: 'Accumulated amortization of land improvements', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1680', description: 'Buildings', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1681', description: 'Accumulated amortization of buildings', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1684', description: 'Buildings under construction', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1740', description: 'Machinery and equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1741', description: 'Accumulated amortization of machinery and equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1742', description: 'Motor vehicles', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1743', description: 'Accumulated amortization of motor vehicles', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1744', description: 'Tools and dies', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1745', description: 'Accumulated amortization of tools and dies', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1746', description: 'Construction and excavating equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1747', description: 'Accumulated amortization of construction and excavating equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1768', description: 'Signs', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1769', description: 'Accumulated amortization of signs', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1770', description: 'Small tools', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1771', description: 'Accumulated amortization of small tools', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1772', description: 'Radio and communication equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1773', description: 'Accumulated amortization of radio and communication equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1774', description: 'Computer equipment/software', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED
  { code: '1775', description: 'Accumulated amortization of computer equipment/software', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED
  { code: '1782', description: 'Machinery and equipment under construction', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1783', description: 'Transportation equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1784', description: 'Accumulated amortization of transportation equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1785', description: 'Other machinery and equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1786', description: 'Accumulated amortization of other machinery and equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1787', description: 'Furniture and fixtures', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1788', description: 'Accumulated amortization of furniture and fixtures', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1900', description: 'Other tangible capital assets (e.g. leasehold improvements)', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1901', description: 'Accumulated amortization of other tangible capital assets', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '1904', description: 'Asphalt and parking areas', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1905', description: 'Accumulated amortization of asphalt and parking areas', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1908', description: 'Fences', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1909', description: 'Accumulated amortization of fences', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1910', description: 'Capital leases — Buildings', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1911', description: 'Accumulated amortization of capital leases — Buildings', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1912', description: 'Capital leases — Equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1913', description: 'Accumulated amortization of capital leases — Equipment', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1914', description: 'Capital leases — Vehicles', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1915', description: 'Accumulated amortization of capital leases — Vehicles', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1918', description: 'Leasehold improvements', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1919', description: 'Accumulated amortization of leasehold improvements', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '1920', description: 'Other capital assets under construction', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2008', description: 'Total tangible capital assets', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '2009', description: 'Total accumulated amortization of tangible capital assets', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '2010', description: 'Intangible assets', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // T1178
  { code: '2011', description: 'Accumulated amortization of intangible assets', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // T1178
  // Corrected this pass: was wrongly coded 1800 — RC4088 Appendix A shows Goodwill = 2012, an
  // intangible-asset item, not the 1800 balance-sheet slot (which doesn't exist in the official list).
  { code: '2012', description: 'Goodwill', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2013', description: 'Accumulated amortization of goodwill', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2014', description: 'Quota', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2015', description: 'Accumulated amortization of quota', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2016', description: 'Licences', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2017', description: 'Accumulated amortization of licences', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2018', description: 'Incorporation costs', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2019', description: 'Accumulated amortization of incorporation costs', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2020', description: 'Trademarks/patents', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2021', description: 'Accumulated amortization of trademarks/patents', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2022', description: 'Customer lists', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2023', description: 'Accumulated amortization of customer lists', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2026', description: 'Research and development', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2027', description: 'Accumulated amortization of research and development', statementType: 'BalanceSheet', category: 'Intangible Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2200', description: 'Investment in joint venture(s)/partnership(s)', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2242', description: 'Shares in Canadian related corporations', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED
  { code: '2300', description: 'Long-term investments', statementType: 'BalanceSheet', category: 'Capital Asset' }, // T1178
  { code: '2360', description: 'Long-term loans', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2361', description: 'Mortgages (long-term, receivable)', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2427', description: 'Cash surrender value of life insurance', statementType: 'BalanceSheet', category: 'Capital Asset' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2599', description: 'Total assets', statementType: 'BalanceSheet', category: 'Current Asset' }, // T1178

  // --- Balance Sheet: Liabilities ---
  { code: '2600', description: 'Bank overdraft', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2620', description: 'Amounts payable and accrued liabilities', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2621', description: 'Trade payables', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED
  { code: '2622', description: 'Trade payables to related parties', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2623', description: 'Holdbacks payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2624', description: 'Wages payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2625', description: 'Management fees payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2626', description: 'Bonuses payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2627', description: 'Employee deductions payable (CPP, EI, QPIP, group insurance, pension)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED
  { code: '2628', description: 'Withholding taxes payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2629', description: 'Interest payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2680', description: 'Taxes payable (income tax and GST/HST)', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2700', description: 'Short-term debt', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2701', description: 'Loans from Canadian banks', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2706', description: 'Lien notes', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2707', description: 'Credit card loans', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2770', description: 'Deferred income (current)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  // 2780 is the CURRENT-liability version of "Due to shareholder(s)/director(s)" — distinct from
  // 3260 below, which is the long-term version. Most small-corp shareholder loans due within a
  // year belong here, not on 3260.
  { code: '2780', description: 'Due to shareholder(s)/director(s) — current', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2781', description: 'Due to individual shareholder(s)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2782', description: 'Due to corporate shareholder(s)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2783', description: 'Due to director(s)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2920', description: 'Current portion of long-term liability', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2960', description: 'Other current liabilities', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '2961', description: 'Deposits received', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2962', description: 'Dividends payable', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2963', description: 'Future (deferred) income taxes (current)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2964', description: 'Reserves for guarantees, warranties, or indemnities (current)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '2965', description: 'General provisions/reserves (current)', statementType: 'BalanceSheet', category: 'Current Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3139', description: 'Total current liabilities', statementType: 'BalanceSheet', category: 'Current Liability' }, // T1178
  { code: '3140', description: 'Long-term debt', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // T1178
  { code: '3141', description: 'Mortgages (long-term liability)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3143', description: 'Chartered bank loan', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED
  { code: '3144', description: 'Credit Union/Caisse Populaire loan', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3149', description: 'Line of credit (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3210', description: 'Bonds and debentures', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3220', description: 'Deferred income', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // T1178
  { code: '3240', description: 'Future (deferred) income taxes (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3260', description: 'Due to shareholder(s)/director(s) — long-term', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // T1178
  { code: '3261', description: 'Due to individual shareholder(s) (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3262', description: 'Due to corporate shareholder(s) (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3263', description: 'Due to director(s) (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  // Corrected this pass: 3300 was previously (wrongly) used for "Contributed surplus" — T1178
  // shows 3300 is actually a liability line ("Due to related parties"), a completely different
  // account. Contributed surplus is really 3540 (see Equity section below).
  { code: '3300', description: 'Due to related parties (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // T1178
  { code: '3320', description: 'Other long-term liabilities', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3321', description: 'Long-term obligations/commitments/capital leases', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3322', description: 'Reserves for guarantees, warranties, or indemnities (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3325', description: 'General provisions/reserves (long-term)', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3450', description: 'Total long-term liabilities', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // T1178
  { code: '3460', description: 'Subordinated debt', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3499', description: 'Total liabilities', statementType: 'BalanceSheet', category: 'Long-Term Liability' }, // T1178

  // --- Balance Sheet: Equity ---
  { code: '3500', description: 'Common shares', statementType: 'BalanceSheet', category: 'Share Capital' }, // T1178
  { code: '3520', description: 'Preferred shares', statementType: 'BalanceSheet', category: 'Share Capital' }, // T1178
  { code: '3540', description: 'Contributed and other surplus', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  { code: '3541', description: 'Contributed surplus', statementType: 'BalanceSheet', category: 'Equity' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3542', description: 'Appraisal surplus', statementType: 'BalanceSheet', category: 'Equity' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3543', description: 'General reserve', statementType: 'BalanceSheet', category: 'Equity' }, // CONFIRMED (RC4088 Appendix A)
  { code: '3600', description: 'Retained earnings/deficit', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  { code: '3620', description: 'Total shareholder equity', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  { code: '3640', description: 'Total liabilities and shareholder equity', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  { code: '3660', description: 'Retained earnings/deficit — start of year', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  { code: '3680', description: 'Net income/loss (retained earnings continuity)', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  // Corrected this pass: was 3701 (off by one) — T1178 shows Dividends declared = 3700.
  { code: '3700', description: 'Dividends declared', statementType: 'BalanceSheet', category: 'Equity' }, // T1178
  { code: '3849', description: 'Retained earnings/deficit — end of year', statementType: 'BalanceSheet', category: 'Equity' }, // T1178

  // --- Income Statement: Revenue ---
  { code: '8000', description: 'Trade sales of goods and services', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8020', description: 'Sales of goods and services to related parties', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8030', description: 'Interdivisional sales', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8089', description: 'Total sales of goods and services', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  // Corrected this pass: was 8230 (T1178 code 8230 is actually "Other revenue", not interest) —
  // interest/investment income belongs on 8090.
  { code: '8090', description: 'Investment revenue (incl. interest income)', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8091', description: 'Interest from foreign sources', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8092', description: 'Interest from Canadian bonds and debentures', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8093', description: 'Interest from Canadian mortgage loans', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8094', description: 'Interest from other Canadian sources', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8095', description: 'Dividend income', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8096', description: 'Dividends from Canadian sources', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8097', description: 'Dividends from foreign sources', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8120', description: 'Commission revenue', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8121', description: 'Commission income on real estate transactions', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  // Corrected this pass: was 8093 — T1178 shows Rental revenue = 8140.
  { code: '8140', description: 'Rental revenue', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8141', description: 'Real estate rental revenue', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8150', description: 'Vehicle leasing (revenue)', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8210', description: 'Realized gains/losses on disposal of assets', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8211', description: 'Realized gains/losses on sale of investments', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8220', description: 'NPO amounts received', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8221', description: 'Membership fees', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8222', description: 'Assessments', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8223', description: 'Gifts', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8224', description: 'Gross sales and revenues from organizational activities', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8231', description: 'Foreign exchange gains/losses', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8232', description: 'Income/loss of subsidiaries/affiliates', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8234', description: 'Income/loss of joint ventures', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8235', description: 'Income/loss of partnerships', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8236', description: 'Realization of deferred revenues', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8237', description: 'Royalty income other than resource', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8239', description: 'Management and administration fees (revenue)', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8240', description: 'Telecommunications revenue', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8241', description: 'Consulting fees (revenue)', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8242', description: 'Subsidies and grants', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8243', description: 'Sale of by-products', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8248', description: 'Insurance recoveries', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8249', description: 'Expense recoveries', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8250', description: 'Bad debt recoveries', statementType: 'IncomeStatement', category: 'Revenue' }, // CONFIRMED (RC4088 Appendix A)
  // Corrected this pass: was 8290 — T1178 shows Other revenue = 8230.
  { code: '8230', description: 'Other revenue', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178
  { code: '8299', description: 'Total revenue', statementType: 'IncomeStatement', category: 'Revenue' }, // T1178

  // --- Income Statement: Cost of Sales ---
  // Corrected this pass: this whole block was shifted by one line item against T1178 (Opening
  // inventory was coded 8320 instead of 8300, Purchases was 8340 instead of 8320, etc.).
  { code: '8300', description: 'Opening inventory', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8301', description: 'Opening inventory — Finished goods', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8302', description: 'Opening inventory — Raw materials', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8303', description: 'Opening inventory — Goods in process', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8320', description: 'Purchases/cost of materials', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8340', description: 'Direct wages', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8350', description: 'Benefits on direct wages', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8360', description: 'Trades and sub-contracts', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8370', description: 'Production costs other than resource', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8450', description: 'Other direct costs', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8457', description: 'Freight-in and duty', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8458', description: 'Inventory write-down', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8459', description: 'Direct cost amortization of tangible assets', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8461', description: 'Overhead expenses allocated to cost of sales', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8500', description: 'Closing inventory', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8501', description: 'Closing inventory — Finished goods', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8502', description: 'Closing inventory — Raw materials', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8503', description: 'Closing inventory — Goods in process', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8518', description: 'Total cost of sales', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178
  { code: '8519', description: 'Gross profit/loss', statementType: 'IncomeStatement', category: 'Cost of Sales' }, // T1178

  // --- Income Statement: Operating Expenses ---
  { code: '8520', description: 'Advertising and promotion (rollup)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8521', description: 'Advertising', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED
  { code: '8522', description: 'Donations', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8524', description: 'Promotion', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8570', description: 'Amortization of intangible assets', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8571', description: 'Goodwill impairment loss', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8590', description: 'Bad debt expense', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8610', description: 'Loan losses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8620', description: 'Employee benefits', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8621', description: 'Group insurance benefits', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8622', description: "Employer's portion of employee benefits (CPP, EI, QPIP, WCB)", statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8623', description: 'Contributions to deferred income plans', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8670', description: 'Amortization of tangible assets', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8690', description: 'Insurance', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED
  { code: '8691', description: 'Life insurance on executives', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8710', description: 'Interest and bank charges', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8711', description: 'Interest on short-term debt', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8712', description: 'Interest on bonds and debentures', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8713', description: 'Interest on mortgages', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8714', description: 'Interest on long-term debt', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8715', description: 'Bank charges', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8716', description: 'Credit card charges', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8717', description: 'Collection and credit costs', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8760', description: 'Business taxes, licences, and memberships (rollup)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8761', description: 'Memberships / dues', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED
  // Corrected this pass: description read "Business taxes and licences" — RC4088 Appendix A shows
  // 8762 is just "Business taxes"; licences belong under the 8760 rollup, not folded into 8762.
  { code: '8762', description: 'Business taxes', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8763', description: 'Franchise fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8764', description: 'Government fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8810', description: 'Office expenses / supplies', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8813', description: 'Data processing', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8860', description: 'Professional fees (legal, accounting)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8861', description: 'Legal fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8862', description: 'Accounting fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8863', description: 'Consulting fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8864', description: 'Architect fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8865', description: 'Appraisal fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8866', description: 'Laboratory fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8867', description: 'Medical fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8868', description: 'Veterinary fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8869', description: 'Brokerage fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8871', description: 'Management and administration fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8874', description: 'Restructuring costs', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8876', description: 'Training expense', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  // Correction (this pass): this file previously said meals & entertainment had no GIFI line at
  // all and left it unmapped. That was wrong — CRA's own complete GIFI item list (RC4088 Appendix
  // A, the full 700+ code list the T1178-Short form rolls up from) has a dedicated line for it.
  { code: '8523', description: 'Meals and entertainment', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8910', description: 'Rental', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8911', description: 'Real estate rental', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8912', description: 'Occupancy costs', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8913', description: 'Condominium fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8914', description: 'Equipment rental', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  // 8915 is the detailed-list breakout of 8910 specifically for motor vehicle rentals/leases (RC4088
  // Appendix A) — use it for a Vehicle Lease account rather than the generic 8910.
  { code: '8915', description: 'Motor vehicle rentals', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8917', description: 'Storage', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8960', description: 'Repairs and maintenance', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '8961', description: 'Repairs and maintenance — Buildings', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8962', description: 'Repairs and maintenance — Vehicles', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '8964', description: 'Repairs and maintenance — Machinery and equipment', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9010', description: 'Other repairs and maintenance', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9013', description: 'Security', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9014', description: 'Garbage removal', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9060', description: 'Salaries and wages', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '9061', description: 'Commissions', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9063', description: 'Bonuses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9064', description: 'Directors fees', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9065', description: "Management salaries (officers' salaries)", statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9066', description: 'Employee salaries (office salaries)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9110', description: 'Sub-contracts', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '9130', description: 'Supplies', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED
  { code: '9131', description: 'Small tools (expensed)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9132', description: 'Shop expense', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9133', description: 'Uniforms', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9134', description: 'Laundry (dry-cleaning)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9135', description: 'Food and catering', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9150', description: 'Computer-related expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '9151', description: 'Upgrade (computer software updates)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9152', description: 'Internet', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9180', description: 'Property taxes', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '9200', description: 'Travel expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED
  { code: '9201', description: 'Meetings and conventions', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9220', description: 'Utilities (rollup)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9221', description: 'Electricity (hydro)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9222', description: 'Water', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9223', description: 'Heat', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9224', description: 'Fuel costs (heating)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9225', description: 'Telephone and telecommunications', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED
  { code: '9270', description: 'Other expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '9271', description: 'Cash over/short', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9273', description: 'Selling expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9274', description: 'Shipping and warehouse expense', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9275', description: 'Delivery, freight and express', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9276', description: 'Warranty expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9277', description: 'Royalty expenses — Resident', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  // 9281 is the detailed-list breakout for general vehicle operating costs (gas, tires, washing —
  // distinct from 8915's lease/rental payments) — RC4088 Appendix A.
  { code: '9281', description: 'Vehicle expenses (fuel, tires, repairs)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9282', description: 'Research and development (expensed)', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9283', description: 'Withholding taxes', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9284', description: 'General and administrative expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // CONFIRMED (RC4088 Appendix A)
  { code: '9367', description: 'Total operating expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178
  { code: '9368', description: 'Total expenses', statementType: 'IncomeStatement', category: 'Operating Expense' }, // T1178

  // --- Income Statement: Net Income ---
  { code: '9369', description: 'Net non-farming income', statementType: 'IncomeStatement', category: 'Net Income' }, // CONFIRMED
  { code: '9990', description: 'Current income taxes', statementType: 'IncomeStatement', category: 'Net Income' }, // CONFIRMED
  { code: '9999', description: 'Net income/loss after taxes and extraordinary items', statementType: 'IncomeStatement', category: 'Net Income' }, // CONFIRMED
];

/** Inserts the starter set, refreshing shipped (is_custom = 0) rows on upgrade without ever touching user-added codes. */
export async function seedGifiCodes(db: AppDb): Promise<void> {
  for (const row of GIFI_CODES_SEED) {
    await db
      .insertInto('gifiCodes')
      .values({
        code: row.code,
        description: row.description,
        statementType: row.statementType,
        category: row.category,
        isCustom: 0,
      })
      .onConflict((oc) =>
        oc.column('code').doUpdateSet({
          description: row.description,
          statementType: row.statementType,
          category: row.category,
        }).where('isCustom', '=', 0),
      )
      .execute();
  }
}
