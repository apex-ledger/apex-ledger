import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';

afterEach(() => { document.querySelectorAll('[data-shell="content"]').forEach((el) => el.remove()); });

describe('full-page forms', () => {
  it('open in the content pane beside the sidebar, and can go full screen and back', async () => {
    const pane = document.createElement('div');
    pane.setAttribute('data-shell', 'content');
    document.body.appendChild(pane);
    render(<Modal fullScreen open onClose={() => undefined} title="Edit Customer"><p>form</p></Modal>);

    expect(pane.contains(screen.getByRole('dialog', { name: 'Edit Customer' }))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: '⤢ Full screen' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Customer' });
    expect(pane.contains(dialog)).toBe(false);
    expect(dialog.className).toContain('fixed');

    await userEvent.click(screen.getByRole('button', { name: '⤡ Exit full screen' }));
    expect(pane.contains(screen.getByRole('dialog', { name: 'Edit Customer' }))).toBe(true);
  });

  it('show as a large centred window where there is no pane, such as the welcome screen', () => {
    render(<Modal fullScreen open onClose={() => undefined} title="Create New Company"><p>form</p></Modal>);
    expect(screen.getByText('Create New Company')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '⤢ Full screen' })).not.toBeInTheDocument();
  });
});
