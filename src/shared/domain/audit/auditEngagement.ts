export type AuditPhase = 'setup' | 'planning' | 'risk' | 'response' | 'completion' | 'reporting';
export type AuditEngagementStatus = 'planning' | 'fieldwork' | 'completion' | 'locked';
export type AuditDocumentStatus = 'not_started' | 'in_progress' | 'prepared' | 'reviewed' | 'query';

export interface AuditReviewNote {
  id: number;
  documentId: number;
  note: string;
  status: 'open' | 'resolved';
  createdBy: string | null;
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface AuditDocument {
  id: number;
  engagementId: number;
  indexCode: string;
  title: string;
  phase: AuditPhase;
  status: AuditDocumentStatus;
  content: string;
  preparedBy: string | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reviewNotes: AuditReviewNote[];
}

export interface AuditEngagement {
  id: number;
  periodEnd: string;
  status: AuditEngagementStatus;
  materialityBasis: string | null;
  materialityBasisCents: number | null;
  materialityPercent: number | null;
  overallMaterialityCents: number | null;
  performanceMaterialityCents: number | null;
  trivialMisstatementCents: number | null;
  materialityRationale: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
  updatedAt: string;
  documents: AuditDocument[];
  progress: { notStarted: number; inProgress: number; prepared: number; reviewed: number; queries: number; total: number };
}

export const AUDIT_PHASE_LABELS: Record<AuditPhase, string> = {
  setup: 'Engagement setup',
  planning: 'Planning & materiality',
  risk: 'Risk & controls',
  response: 'Audit response & evidence',
  completion: 'Completion',
  reporting: 'Reporting & archive',
};

/** A first defensible CPA audit-file index. Content stays editable because the entity, risks and
 * jurisdiction determine the procedures; the index and sign-off workflow remain consistent. */
export const CORE_AUDIT_DOCUMENTS: ReadonlyArray<{ indexCode: string; title: string; phase: AuditPhase }> = [
  { indexCode: 'A-100', title: 'Client acceptance and continuance', phase: 'setup' },
  { indexCode: 'A-110', title: 'Conflict and independence assessment', phase: 'setup' },
  { indexCode: 'A-120', title: 'Engagement letter and scope', phase: 'setup' },
  { indexCode: 'A-130', title: 'Engagement team and quality review', phase: 'setup' },
  { indexCode: 'A-140', title: 'Client information and PBC request list', phase: 'setup' },
  { indexCode: 'A-200', title: 'Understanding the entity and environment', phase: 'planning' },
  { indexCode: 'A-210', title: 'Applicable reporting framework', phase: 'planning' },
  { indexCode: 'A-220', title: 'Overall audit strategy', phase: 'planning' },
  { indexCode: 'A-300', title: 'Preliminary analytical review', phase: 'planning' },
  { indexCode: 'A-400', title: 'Materiality', phase: 'planning' },
  { indexCode: 'B-100', title: 'Significant accounts and disclosure scoping', phase: 'risk' },
  { indexCode: 'B-200', title: 'Financial-statement and assertion-level risks', phase: 'risk' },
  { indexCode: 'B-210', title: 'Fraud brainstorming and fraud risks', phase: 'risk' },
  { indexCode: 'B-220', title: 'Laws, regulations and related parties', phase: 'risk' },
  { indexCode: 'B-300', title: 'IT environment and general controls', phase: 'risk' },
  { indexCode: 'B-400', title: 'Process walkthroughs and risk-control matrix', phase: 'risk' },
  { indexCode: 'C-100', title: 'Overall response to assessed risks', phase: 'response' },
  { indexCode: 'C-200', title: 'Audit evidence and sampling plan', phase: 'response' },
  { indexCode: 'C-300', title: 'Journal-entry testing', phase: 'response' },
  { indexCode: 'C-400', title: 'External confirmations', phase: 'response' },
  { indexCode: 'C-500', title: 'Audit programs by financial-statement area', phase: 'response' },
  { indexCode: 'E-100', title: 'Summary of identified misstatements', phase: 'completion' },
  { indexCode: 'E-110', title: 'Control deficiencies and management points', phase: 'completion' },
  { indexCode: 'E-200', title: 'Subsequent events', phase: 'completion' },
  { indexCode: 'E-210', title: 'Going-concern evaluation', phase: 'completion' },
  { indexCode: 'E-220', title: 'Legal claims and contingencies', phase: 'completion' },
  { indexCode: 'E-300', title: 'Management representations', phase: 'completion' },
  { indexCode: 'E-400', title: 'Final analytical review and statement tie-out', phase: 'completion' },
  { indexCode: 'E-500', title: 'Significant matters and completion memorandum', phase: 'completion' },
  { indexCode: 'F-100', title: 'Governance communications', phase: 'reporting' },
  { indexCode: 'F-200', title: 'Audit opinion decision and report', phase: 'reporting' },
  { indexCode: 'F-210', title: 'Key audit matters and report modifications', phase: 'reporting' },
  { indexCode: 'F-300', title: 'Final assembly and archive checklist', phase: 'reporting' },
];
