import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AuditEngagement } from '@shared/domain/audit/auditEngagement';
import { mockApi } from '../../test/setup';
import { AuditEngagementPage } from './AuditEngagementPage';

const engagement: AuditEngagement = {
  id: 1,
  periodEnd: '2026-12-31',
  status: 'planning',
  materialityBasis: null,
  materialityBasisCents: null,
  materialityPercent: null,
  overallMaterialityCents: null,
  performanceMaterialityCents: null,
  trivialMisstatementCents: null,
  materialityRationale: null,
  lockedAt: null,
  lockedBy: null,
  createdAt: '2026-09-01',
  updatedAt: '2026-09-01',
  progress: { notStarted: 2, inProgress: 0, prepared: 0, reviewed: 0, queries: 0, total: 2 },
  documents: [
    { id: 1, engagementId: 1, indexCode: 'A-100', title: 'Client acceptance and continuance', phase: 'setup', status: 'not_started', content: '', preparedBy: null, preparedAt: null, reviewedBy: null, reviewedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01', reviewNotes: [] },
    { id: 2, engagementId: 1, indexCode: 'A-400', title: 'Materiality', phase: 'planning', status: 'not_started', content: '', preparedBy: null, preparedAt: null, reviewedBy: null, reviewedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01', reviewNotes: [] },
  ],
};

describe('AuditEngagementPage', () => {
  it('shows the indexed file, review progress, and separate sign-off controls', async () => {
    mockApi('auditEngagement', 'get', engagement);
    render(<AuditEngagementPage />);
    expect(await screen.findByText('Audit engagement file')).toBeInTheDocument();
    expect(screen.getAllByText('A-100')).toHaveLength(2);
    expect(screen.getByText('A-400')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign as prepared' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reviewer sign-off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lock final file' })).toBeInTheDocument();
  });
});
