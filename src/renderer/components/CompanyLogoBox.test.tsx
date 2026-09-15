import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/setup';
import { CompanyLogoBox } from './CompanyLogoBox';

// A real, tiny PNG: small enough to go in untouched, so jsdom never needs a canvas.
const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

function clipboardWith(files: File[]) {
  return { clipboardData: { items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })) } };
}

describe('setting the company logo from the invoice', () => {
  it('saves a pasted image to the company, so every invoice after prints it', async () => {
    mockApi('company', 'get', { logoDataUrl: null });
    mockApi('company', 'update', {});
    render(<CompanyLogoBox />);

    const box = screen.getByRole('button', { name: /Company logo/ });
    fireEvent.paste(box, clipboardWith([new File([PNG_BYTES], 'logo.png', { type: 'image/png' })]));

    await waitFor(() => expect(window.api.company.update).toHaveBeenCalledWith({ logoDataUrl: expect.stringMatching(/^data:image\/png;base64,/) }));
    expect(await screen.findByAltText('Company logo')).toBeInTheDocument();
  });

  it('explains what to copy when the clipboard holds text rather than an image', () => {
    mockApi('company', 'get', { logoDataUrl: null });
    const update = vi.fn();
    (window.api.company as unknown as { update: unknown }).update = update;
    render(<CompanyLogoBox />);

    fireEvent.paste(screen.getByRole('button', { name: /Company logo/ }), clipboardWith([]));

    expect(screen.getByText(/The clipboard has no image in it/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
