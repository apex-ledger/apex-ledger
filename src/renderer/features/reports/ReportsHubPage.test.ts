import { describe, expect, it } from 'vitest';
import { REPORT_GROUPS } from './ReportsHubPage';

describe('Reports hub navigation', () => {
  const entries = REPORT_GROUPS.flatMap((group) => group.entries);

  it('lists each report destination once', () => {
    const destinations = entries.map((entry) => entry.report);
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it('does not repeat report titles', () => {
    const titles = entries.map((entry) => entry.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps receivables and payables in matching, adjacent report categories', () => {
    const receivableIndex = REPORT_GROUPS.findIndex((group) => group.heading === 'Who owes you (A/R)');
    const payableIndex = REPORT_GROUPS.findIndex((group) => group.heading === 'Whom we owe (A/P)');

    expect(payableIndex).toBe(receivableIndex + 1);
    expect(REPORT_GROUPS[receivableIndex].entries.map((entry) => entry.report)).toContain('agingReceivable');
    expect(REPORT_GROUPS[payableIndex].entries.map((entry) => entry.report)).toEqual(['agingPayable']);
  });

  it('keeps the complete CRA and CPA package visible in Reports', () => {
    const cra = REPORT_GROUPS.find((group) => group.heading === 'CRA audit package');
    const cpa = REPORT_GROUPS.find((group) => group.heading === 'CPA year-end continuity');
    expect(cra?.entries.map((entry) => entry.report)).toEqual([
      'auditTrail', 'sourceDocuments', 'bankDepositAnalysis', 'payrollRegister', 'hstWorkingPaper',
    ]);
    expect(cpa?.entries.map((entry) => entry.report)).toEqual([
      'fixedAssetContinuity', 'shareholderContinuity', 'inventoryContinuity', 'debtContinuity', 't2Reconciliation',
    ]);
  });

  it('offers the comprehensive one-sheet report and the transaction detail sheet on its own', () => {
    const group = REPORT_GROUPS.find((item) => item.heading === 'Comprehensive & custom');
    expect(group?.entries.map((entry) => entry.report)).toEqual(['comprehensiveCompany', 'customTransactionDetail']);
  });
});
