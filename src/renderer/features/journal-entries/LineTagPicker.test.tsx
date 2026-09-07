import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LineTagPicker } from './LineTagPicker';
import type { TagGroupRow } from '../../../preload/index';

/** The tag cell on a journal line.
 *
 * This is where the one-tag-per-group rule is either enforced or quietly lost. If the picker offers
 * a flat list, somebody tags a line with two stores, and every tag report starts double-counting
 * with nothing on screen to say why.
 */

const GROUPS: TagGroupRow[] = [
  {
    id: 1,
    name: 'Store',
    description: null,
    isActive: true,
    createdAt: '2025-01-01',
    tags: [
      { id: 10, tagGroupId: 1, name: 'Dundas', isActive: true, createdAt: '2025-01-01' },
      { id: 11, tagGroupId: 1, name: 'Kipling', isActive: true, createdAt: '2025-01-01' },
    ],
  },
  {
    id: 2,
    name: 'Job',
    description: null,
    isActive: true,
    createdAt: '2025-01-01',
    tags: [{ id: 20, tagGroupId: 2, name: 'Fit-out', isActive: true, createdAt: '2025-01-01' }],
  },
];

describe('before the line is saved', () => {
  it('cannot be used, and says why', () => {
    // Tags attach to a saved line id. Holding them in memory to write after save loses them
    // whenever the save fails — precisely when nobody is watching for it.
    render(<LineTagPicker lineId={null} groups={GROUPS} initialTagIds={[]} onError={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/save the entry first/i));
  });
});

describe('choosing tags', () => {
  it('offers one dropdown per group, not one flat list', async () => {
    render(<LineTagPicker lineId={7} groups={GROUPS} initialTagIds={[]} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Job')).toBeInTheDocument();
  });

  it('lets a group be cleared back to nothing', async () => {
    render(<LineTagPicker lineId={7} groups={GROUPS} initialTagIds={[10]} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /dundas/i }));

    expect(screen.getAllByRole('option', { name: '— none —' }).length).toBeGreaterThan(0);
  });

  it('shows what the line already carries', () => {
    render(<LineTagPicker lineId={7} groups={GROUPS} initialTagIds={[10]} onError={vi.fn()} />);
    expect(screen.getByRole('button', { name: /dundas/i })).toBeInTheDocument();
  });

  it('replaces the tag within a group rather than adding to it', async () => {
    // Dundas → Kipling has to leave one tag on the line, not two.
    render(<LineTagPicker lineId={7} groups={GROUPS} initialTagIds={[10]} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /dundas/i }));
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '11');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.tags.setForLine).toHaveBeenCalledWith({ journalEntryLineId: 7, tagIds: [11] });
  });

  it('keeps a tag from another group when one group changes', async () => {
    render(<LineTagPicker lineId={7} groups={GROUPS} initialTagIds={[10, 20]} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '11');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sent = (window as any).api.tags.setForLine.mock.calls[0][0];
    expect(sent.tagIds).toContain(20);
    expect(sent.tagIds).toContain(11);
    expect(sent.tagIds).not.toContain(10);
  });
});

describe('when there is nothing to choose from', () => {
  it('shows a dash rather than an empty control', () => {
    render(<LineTagPicker lineId={7} groups={[]} initialTagIds={[]} onError={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores a group whose tags are all inactive', () => {
    const retired: TagGroupRow[] = [{ ...GROUPS[0], tags: GROUPS[0].tags.map((t) => ({ ...t, isActive: false })) }];
    render(<LineTagPicker lineId={7} groups={retired} initialTagIds={[]} onError={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
