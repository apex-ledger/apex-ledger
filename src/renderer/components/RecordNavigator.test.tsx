import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordNavigator } from './RecordNavigator';

/** Paging between saved records.
 *
 * The arrows are the sort of control that looks trivial and is wrong in ways nobody reports: a
 * "next" that runs off the end, a "previous" that wraps silently to the newest record, or arrows
 * that do nothing at all on an unsaved form.
 */

const IDS = [10, 20, 30];

describe('in the middle of the list', () => {
  it('can move in both directions', async () => {
    const onGo = vi.fn();
    render(<RecordNavigator ids={IDS} currentId={20} onGo={onGo} />);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onGo).toHaveBeenCalledWith(30);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onGo).toHaveBeenCalledWith(10);
  });

  it('jumps to either end', async () => {
    const onGo = vi.fn();
    render(<RecordNavigator ids={IDS} currentId={20} onGo={onGo} />);

    await userEvent.click(screen.getByRole('button', { name: 'First' }));
    expect(onGo).toHaveBeenCalledWith(10);

    await userEvent.click(screen.getByRole('button', { name: 'Last' }));
    expect(onGo).toHaveBeenCalledWith(30);
  });

  it('says where you are', () => {
    render(<RecordNavigator ids={IDS} currentId={20} onGo={vi.fn()} />);
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });
});

describe('at the ends', () => {
  it('stops rather than wrapping round at the last record', () => {
    // Wrapping makes "last" and "next" the same click, and somebody paging through a year lands
    // back at the newest record without noticing.
    render(<RecordNavigator ids={IDS} currentId={30} onGo={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();
  });

  it('stops at the first record', () => {
    render(<RecordNavigator ids={IDS} currentId={10} onGo={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
  });
});

describe('on a record that has not been saved yet', () => {
  it('still lets you page back to the newest saved one', async () => {
    // The unsaved record is not in the list, so a naive index lookup leaves every arrow dead —
    // which is exactly what somebody clicking back from a blank form would hit.
    const onGo = vi.fn();
    render(<RecordNavigator ids={IDS} currentId="new" onGo={onGo} />);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onGo).toHaveBeenCalledWith(30);
  });

  it('says it is new, and how many are saved', () => {
    render(<RecordNavigator ids={IDS} currentId="new" onGo={vi.fn()} />);
    expect(screen.getByText('New — 3 saved')).toBeInTheDocument();
  });
});

describe('when there is nothing to page through', () => {
  it('shows no arrows at all on an empty file', () => {
    const { container } = render(<RecordNavigator ids={[]} currentId="new" onGo={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('while saving', () => {
  it('cannot be clicked mid-save', () => {
    // Navigating away during a save would abandon the record being written.
    render(<RecordNavigator ids={IDS} currentId={20} onGo={vi.fn()} disabled />);
    for (const name of ['First', 'Previous', 'Next', 'Last']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
