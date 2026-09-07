import { describe, expect, it } from 'vitest';
import { CORE_AUDIT_DOCUMENTS } from './auditEngagement';
import { saveAuditMaterialitySchema } from '../../validation/schemas';

describe('core audit engagement file', () => {
  it('has a unique, ordered index and covers every engagement phase', () => {
    const codes = CORE_AUDIT_DOCUMENTS.map((document) => document.indexCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('A-400');
    expect(codes).toContain('B-200');
    expect(codes).toContain('C-300');
    expect(codes).toContain('E-100');
    expect(codes).toContain('F-300');
    expect(new Set(CORE_AUDIT_DOCUMENTS.map((document) => document.phase))).toEqual(
      new Set(['setup', 'planning', 'risk', 'response', 'completion', 'reporting']),
    );
  });

  it('rejects materiality thresholds that exceed overall materiality', () => {
    const base = {
      engagementId: 1,
      materialityBasis: 'Revenue',
      materialityBasisCents: 1_000_000,
      materialityPercent: 1,
      overallMaterialityCents: 10_000,
      performanceMaterialityCents: 7_500,
      trivialMisstatementCents: 500,
      materialityRationale: null,
    };
    expect(saveAuditMaterialitySchema.safeParse(base).success).toBe(true);
    expect(saveAuditMaterialitySchema.safeParse({ ...base, performanceMaterialityCents: 10_001 }).success).toBe(false);
    expect(saveAuditMaterialitySchema.safeParse({ ...base, trivialMisstatementCents: 10_001 }).success).toBe(false);
  });
});
