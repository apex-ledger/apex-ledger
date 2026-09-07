import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, type ComboboxOption } from './Combobox';

/** The account picker, rendered.
 *
 * This is the control every categorising screen runs through, and it was silently dropping options:
 * with nothing typed it rendered only the first 50 rows, so a real chart of accounts — ordered by
 * code, expenses starting at 5000 — lost every expense category off the end of the list. Nothing on
 * screen said so; the categories simply were not there.
 */

/** A chart the size of a real one: assets, then liabilities, then expenses well past position 50. */
function realisticChart(): ComboboxOption[] {
  const options: ComboboxOption[] = [];
  for (let i = 0; i < 30; i += 1) {
    options.push({ value: `a${i}`, label: `Asset Account ${i}`, sublabel: 'Asset', group: 'Asset' });
  }
  for (let i = 0; i < 25; i += 1) {
    options.push({ value: `l${i}`, label: `Liability Account ${i}`, sublabel: 'Liability', group: 'Liability' });
  }
  for (let i = 0; i < 30; i += 1) {
    options.push({ value: `e${i}`, label: `Expense Account ${i}`, sublabel: 'Expense', group: 'Expense' });
  }
  return options;
}

async function openPicker(options: ComboboxOption[]) {
  const onChange = vi.fn();
  render(<Combobox options={options} value={null} onChange={onChange} placeholder="Pick an account…" />);
  await userEvent.click(screen.getByPlaceholderText('Pick an account…'));
  return onChange;
}

describe('a chart of accounts bigger than fifty', () => {
  it('still offers the expense categories at the bottom', async () => {
    // The exact failure: 55 accounts come before the expenses, so at a 50-row cap not one expense
    // category could be picked without already knowing its name.
    await openPicker(realisticChart());
    expect(screen.getByText('Expense Account 29')).toBeInTheDocument();
  });

  it('offers every account, not a prefix of them', async () => {
    const options = realisticChart();
    await openPicker(options);
    for (const option of options) {
      expect(screen.getByText(option.label)).toBeInTheDocument();
    }
  });
});

describe('what each row shows', () => {
  it('shows the name alone, with no id in front of it', async () => {
    // The value is a database id. Rendering it ahead of the label put a meaningless number before
    // every category name.
    await openPicker([{ value: '42', label: 'Office Supplies', sublabel: 'Expense', group: 'Expense' }]);

    expect(screen.getByText('Office Supplies')).toBeInTheDocument();
    expect(screen.queryByText(/42\s*—/)).not.toBeInTheDocument();
  });

  it('keeps the sublabel', async () => {
    await openPicker([{ value: '42', label: 'Office Supplies', sublabel: 'Expense · #900', group: 'Expense' }]);
    expect(screen.getByText('Expense · #900')).toBeInTheDocument();
  });

  it('shows only the selected name and never its stored database id', () => {
    render(<Combobox options={[{ value: '42', label: 'Castle Hill' }]} value="42" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Castle Hill')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/42\s*—/)).not.toBeInTheDocument();
  });
});

describe('the group headings', () => {
  it('shows one heading per type', async () => {
    // Scoped to the heading element: the sublabel on every row says "Asset" too, so an unscoped
    // query would pass on the sublabels alone even with the headings missing entirely.
    await openPicker(realisticChart());
    for (const heading of ['Asset', 'Liability', 'Expense']) {
      expect(screen.getByText(heading, { selector: 'div.sticky' })).toBeInTheDocument();
    }
  });

  it('does not repeat a heading for every row under it', async () => {
    await openPicker(realisticChart());
    // 30 expense rows, one heading. The sublabels say "Expense" too, hence the exact-match query.
    expect(screen.getAllByText('Expense', { selector: 'div.sticky' })).toHaveLength(1);
  });

  it('draws no headings when options carry no group', async () => {
    await openPicker([{ value: '1', label: 'Just a name' }]);
    expect(screen.queryByText('Asset')).not.toBeInTheDocument();
  });
});

describe('searching', () => {
  it('keeps an exactly typed existing option when focus moves to the next field', async () => {
    const onChange = vi.fn();
    render(
      <>
        <Combobox options={[{ value: '17', label: 'Castle Hill' }]} value={null} onChange={onChange} placeholder="Vendor…" />
        <input aria-label="Next field" />
      </>,
    );

    await userEvent.type(screen.getByPlaceholderText('Vendor…'), 'castle hill');
    await userEvent.click(screen.getByLabelText('Next field'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('17'));
  });

  it('finds an account by name', async () => {
    render(<Combobox options={realisticChart()} value={null} onChange={vi.fn()} placeholder="Pick…" />);
    await userEvent.type(screen.getByPlaceholderText('Pick…'), 'Expense Account 7');
    expect(screen.getByText('Expense Account 7')).toBeInTheDocument();
  });

  it('does not match on the internal id', async () => {
    // Typing "42" should not surface whichever account happens to hold row id 42.
    render(
      <Combobox
        options={[{ value: '42', label: 'Office Supplies' }, { value: '7', label: 'Rent' }]}
        value={null}
        onChange={vi.fn()}
        placeholder="Pick…"
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Pick…'), '42');
    expect(screen.queryByText('Office Supplies')).not.toBeInTheDocument();
  });
});
