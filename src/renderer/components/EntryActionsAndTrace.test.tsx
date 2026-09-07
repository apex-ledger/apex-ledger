import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';
import { OpenEntryButton } from './OpenEntryButton';
import { openOriginalEntry } from '../utils/openOriginalEntry';

vi.mock('../utils/openOriginalEntry', () => ({ openOriginalEntry: vi.fn() }));

describe('entry action placement and report tracing', () => {
  it('keeps modal entry actions grouped on the left', () => {
    render(
      <Modal open title="New bill" onClose={() => undefined} footer={<><button>Save</button><button>Save &amp; Close</button><button>Save &amp; Next</button></>}>
        Form
      </Modal>,
    );

    const actionBar = screen.getByRole('button', { name: 'Save' }).parentElement;
    expect(actionBar).toHaveClass('justify-start');
    expect(actionBar).toHaveClass('flex-wrap');
    expect(actionBar).not.toHaveClass('justify-end');
  });

  it('opens the original business entry from a report action', () => {
    render(<OpenEntryButton entryId={42} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open original entry 42' }));
    expect(openOriginalEntry).toHaveBeenCalledWith(42, expect.any(Function));
  });
});
