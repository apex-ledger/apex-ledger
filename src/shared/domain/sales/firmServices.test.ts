import { describe, expect, it } from 'vitest';
import { FIRM_SERVICES, isAccountingFirm, missingFirmServices } from './firmServices';

describe('firm services', () => {
  it('recognises the bookkeeping / accounting business type and nothing else', () => {
    expect(isAccountingFirm('bookkeeping_accounting')).toBe(true);
    expect(isAccountingFirm('restaurant')).toBe(false);
    expect(isAccountingFirm(null)).toBe(false);
  });

  it('offers the whole catalogue to a firm with no items yet', () => {
    expect(missingFirmServices([])).toEqual(FIRM_SERVICES);
    expect(FIRM_SERVICES.length).toBeGreaterThan(80);
  });

  it('never seeds a service the firm already has, however it was typed', () => {
    const missing = missingFirmServices(['  monthly bookkeeping ', 'T2 Corporate Tax Return']);
    expect(missing).not.toContain('Monthly Bookkeeping');
    expect(missing).not.toContain('T2 Corporate Tax Return');
    expect(missing).toHaveLength(FIRM_SERVICES.length - 2);
  });
});
