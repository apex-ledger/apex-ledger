import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/setup';
import { PrintableDocumentActions } from './PrintableDocumentActions';

describe('Print, PDF and Email on estimates, purchase orders and credit notes', () => {
  it('are on screen before the document is saved, greyed with the reason', () => {
    render(<PrintableDocumentActions kind="purchaseOrder" id={null} />);
    for (const label of ['Print', 'PDF', 'Email']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', expect.stringContaining('Save the purchase order first'));
    }
  });

  it('address the email from the server when the page does not already know who it is for', async () => {
    mockApi('documentPdf', 'emailDefaults', { partyName: 'Om Financial', partyEmail: 'om@example.com', subject: 'Estimate EST-2026-0004', sentence: 'Please find attached estimate EST-2026-0004.' });
    render(<PrintableDocumentActions kind="estimate" id={4} />);

    await waitFor(() => expect(window.api.documentPdf.emailDefaults).toHaveBeenCalledWith({ kind: 'estimate', id: 4 }));
    await userEvent.click(screen.getByRole('button', { name: 'Email' }));
    expect(await screen.findByDisplayValue('om@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Estimate EST-2026-0004')).toBeInTheDocument();
  });

  it('take the addressee from a list that already has it, without asking the server once per row', async () => {
    const emailDefaults = vi.fn();
    (window.api.documentPdf as unknown as { emailDefaults: unknown }).emailDefaults = emailDefaults;
    mockApi('documentPdf', 'sendDirect', { sent: true });
    render(<PrintableDocumentActions kind="creditNote" id={9} known={{ partyName: 'Om Financial', partyEmail: 'om@example.com', subject: 'Credit note CN-0001', sentence: 'Please find attached credit note CN-0001.' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Email' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => expect(window.api.documentPdf.sendDirect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'creditNote', id: 9, to: 'om@example.com', subject: 'Credit note CN-0001' })));
    expect(emailDefaults).not.toHaveBeenCalled();
  });
});
