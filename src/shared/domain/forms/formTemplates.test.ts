import { describe, expect, it } from 'vitest';
import { FORM_TEMPLATES } from './formTemplates';

describe('client compliance forms', () => {
  it('keeps unique template and field identifiers', () => {
    const ids = FORM_TEMPLATES.map((form) => form.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const form of FORM_TEMPLATES) {
      const fieldNames = form.sections.flatMap((section) => section.fields?.map((field) => field.name) ?? []);
      expect(new Set(fieldNames).size, `${form.id} repeats a fillable field name`).toBe(fieldNames.length);
    }
  });

  it('includes the required client acceptance workflow documents', () => {
    const complianceIds = FORM_TEMPLATES.filter((form) => form.category === 'client_compliance').map((form) => form.id);
    expect(complianceIds).toEqual(
      expect.arrayContaining([
        'engagement_letter',
        'client_acceptance_continuance',
        'privacy_technology_consent',
        'cra_rep_authorization_checklist',
        'compilation_management_acknowledgement',
        'fintrac_applicability_kyc',
      ]),
    );
  });

  it('makes FINTRAC applicability conditional', () => {
    const fintrac = FORM_TEMPLATES.find((form) => form.id === 'fintrac_applicability_kyc');
    expect(fintrac?.sections[0]?.paragraphs?.join(' ')).toContain('do not by themselves trigger');
    expect(fintrac?.sections[0]?.fields?.some((field) => field.name === 'noTrigger')).toBe(true);
  });
});
