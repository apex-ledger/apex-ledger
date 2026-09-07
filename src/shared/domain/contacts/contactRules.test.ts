import { describe, expect, it } from 'vitest';
import { deactivationRefusalReason, duplicateNameRefusalReason, inactiveContactRefusalReason } from './contactRules';

describe('deactivating a contact', () => {
  it('is allowed when nothing is outstanding', () => {
    expect(deactivationRefusalReason('customer', 'Acme', { openDocumentCount: 0, openCreditCount: 0 })).toBeNull();
  });

  it('is refused while invoices are unpaid, and says how many', () => {
    expect(deactivationRefusalReason('customer', 'Acme', { openDocumentCount: 2, openCreditCount: 0 })).toMatch(/Acme still has 2 unpaid invoices/);
  });

  it('is refused while bills are unpaid, using supplier wording', () => {
    const reason = deactivationRefusalReason('vendor', 'Bell', { openDocumentCount: 1, openCreditCount: 0 });
    expect(reason).toMatch(/1 unpaid bill\b/);
    expect(reason).toMatch(/this vendor/);
  });

  it('counts open credit notes too', () => {
    expect(deactivationRefusalReason('vendor', 'Bell', { openDocumentCount: 1, openCreditCount: 1 })).toMatch(/1 unpaid bill and 1 open credit note/);
  });
});

describe('raising a document against a contact', () => {
  it('is allowed for an active contact', () => {
    expect(inactiveContactRefusalReason('customer', { name: 'Acme', isActive: true })).toBeNull();
  });

  it('is refused for an inactive one by name', () => {
    expect(inactiveContactRefusalReason('customer', { name: 'Acme', isActive: false })).toMatch(/Acme is inactive/);
  });

  it('is refused for one that no longer exists', () => {
    expect(inactiveContactRefusalReason('vendor', undefined)).toMatch(/no longer exists/);
  });

  it('names the document being saved', () => {
    expect(inactiveContactRefusalReason('customer', { name: 'Acme', isActive: false }, 'credit note')).toMatch(/saving the credit note/);
  });
});

describe('contact names', () => {
  const existing = [{ id: 1, name: 'Acme Ltd' }, { id: 2, name: 'Bell Canada' }];

  it('allows a new name', () => {
    expect(duplicateNameRefusalReason('vendor', 'Rogers', existing)).toBeNull();
  });

  it('refuses the same name in different case or spacing', () => {
    expect(duplicateNameRefusalReason('vendor', '  acme ltd ', existing)).toMatch(/"Acme Ltd" already exists/);
  });

  it('lets a contact keep its own name on edit', () => {
    expect(duplicateNameRefusalReason('vendor', 'Acme Ltd', existing, 1)).toBeNull();
  });

  it('still refuses taking another contact\'s name on edit', () => {
    expect(duplicateNameRefusalReason('vendor', 'Bell Canada', existing, 1)).not.toBeNull();
  });
});
