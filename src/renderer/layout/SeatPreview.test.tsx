import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeatPreviewBanner, SeatPreviewPicker } from './SeatPreview';

const setWeb = (value: unknown) => { (window as unknown as { __apexWeb?: unknown }).__apexWeb = value; };
afterEach(() => { setWeb(undefined); vi.unstubAllGlobals(); });

describe('previewing the app as another seat', () => {
  it('lets the platform administrator pick Business, Payroll Unlimited or Bookkeeper', async () => {
    setWeb({ user: { previewSeat: null }, org: { isPlatform: true } });
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<SeatPreviewPicker />);
    await userEvent.click(screen.getByRole('button', { name: 'Bookkeeper' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/preview-seat', expect.objectContaining({ body: JSON.stringify({ seatType: 'bookkeeper' }) })));
  });

  it('is not offered to a firm', () => {
    setWeb({ user: { previewSeat: null }, org: { isPlatform: false } });
    render(<SeatPreviewPicker />);
    expect(screen.queryByTestId('seat-preview')).not.toBeInTheDocument();
  });

  it('shows a banner with the way back while previewing', () => {
    setWeb({ user: { previewSeat: 'payroll' }, org: { isPlatform: true } });
    render(<SeatPreviewBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Previewing as a Payroll Unlimited seat');
    expect(screen.getByRole('button', { name: 'Back to Full accountant' })).toBeInTheDocument();
  });
});
