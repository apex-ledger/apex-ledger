import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { ComplianceReportPage } from './ComplianceReportPage';
import type { CompliancePackageResult } from '@shared/domain/reporting/compliancePackage';

const empty: CompliancePackageResult = {
  periodStart: '2026-01-01', periodEnd: '2026-12-31', auditTrail: [], sourceDocuments: [], bankDeposits: [], payrollRegister: [],
  hstWorkingPaper: { boxes: [{ box: '109', label: 'Net tax payable', amountCents: 1_300 }], manualItemsPending: 2, filedReturn: null, categories: [] },
  fixedAssets: [], shareholders: [], inventory: [], debt: [],
  t2Reconciliation: { lines: [{ label: 'Preliminary income for tax review', amountCents: 50_000, treatment: 'result' }], preliminaryTaxableIncomeCents: 50_000, unmappedGifiAccountCount: 1, warning: 'Preliminary working paper only.' },
};

describe('CRA/CPA compliance report pages', () => {
  it('shows HST return lines and pending manual exceptions', async () => {
    mockApi('reports', 'compliancePackage', empty);
    render(<ComplianceReportPage report="hstWorkingPaper" />);
    expect(await screen.findByText('GST/HST Return Working Paper')).toBeInTheDocument();
    expect(await screen.findByText('109')).toBeInTheDocument();
    expect(screen.getByText('Manual items pending')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('labels the T2 number as preliminary and exposes missing GIFI mappings', async () => {
    mockApi('reports', 'compliancePackage', empty);
    render(<ComplianceReportPage report="t2Reconciliation" />);
    expect(await screen.findByText('T2 Preliminary Tax Reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Accounts missing GIFI')).toBeInTheDocument();
    expect(screen.getByText('Preliminary working paper only.')).toBeInTheDocument();
  });
});
