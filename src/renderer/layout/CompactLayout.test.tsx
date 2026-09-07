import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../app/store/uiStore';
import { AppShell } from './AppShell';

vi.mock('./Sidebar', async (importOriginal) => ({ ...(await importOriginal<typeof import('./Sidebar')>()), Sidebar: () => <aside /> }));
vi.mock('./Header', () => ({ Header: () => <header /> }));
vi.mock('./StatusBar', () => ({ StatusBar: () => <footer /> }));
vi.mock('./UpdateBanner', () => ({ UpdateBanner: () => null }));
vi.mock('./TickerStrip', () => ({ TickerStrip: () => null }));

describe('compact application layout', () => {
  it('uses one compact visible title and reduced shared content padding', () => {
    useUiStore.setState({ view: { kind: 'invoiceEditor', id: 'new' } });
    render(
      <AppShell>
        <div>Working area</div>
      </AppShell>,
    );

    const title = screen.getByRole('heading', { name: 'Invoice' });
    expect(title.parentElement).toHaveClass('min-h-8', 'px-2', 'py-1');
    expect(title).not.toHaveClass('opacity-0');
    const main = screen.getByRole('main');
    expect(main).toHaveClass('p-2');
    expect(within(main).queryByRole('heading', { name: 'Invoice' })).not.toBeInTheDocument();
  });
});
