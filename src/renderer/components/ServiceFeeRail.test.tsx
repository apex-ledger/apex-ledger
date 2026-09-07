import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PROFESSIONAL_SERVICE_FEES, SERVICE_FEE_GROUPS, ServiceFeeRail } from './ServiceFeeRail';

describe('professional service fee rail', () => {
  it('offers the common CPA services and returns the selected service', async () => {
    const choose = vi.fn();
    render(<ServiceFeeRail onChoose={choose} />);

    expect(PROFESSIONAL_SERVICE_FEES.length).toBeGreaterThan(80);
    for (const group of SERVICE_FEE_GROUPS) expect(screen.getByRole('group', { name: group.category })).toBeTruthy();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'All accounting service fees' }), 'T2 Corporate Tax Return');
    expect(choose).toHaveBeenCalledWith('T2 Corporate Tax Return');
  });
});
