import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportActions, ReportGeneratedStamp } from './ReportActions';

/** Export, exercised against a real DOM.
 *
 * The extraction reads the tables on screen, so it can only be trusted by rendering tables and
 * checking what comes out. The rules it has to get right — stripped currency, editable cells,
 * leading zeros — are exactly the ones that fail silently: the file looks fine and every formula
 * written against it returns nothing.
 */

function Fixture() {
  const ref = createRef<HTMLDivElement>();
  return (
    <div>
      <ReportActions targetRef={ref as never} reportName="Test Report" />
      <div ref={ref}>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0542</td>
              <td>Smith, John</td>
              <td>$1,234.56</td>
            </tr>
            <tr>
              <td>5100</td>
              <td>Rent</td>
              <td>(500.00)</td>
            </tr>
            <tr>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableFixture() {
  const ref = createRef<HTMLDivElement>();
  return (
    <div>
      <ReportActions targetRef={ref as never} reportName="Editable" />
      <div ref={ref}>
        <table>
          <tbody>
            <tr>
              <td>
                <input defaultValue="Chequing" readOnly />
              </td>
              <td>
                <input defaultValue="1000.00" readOnly />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetadataFixture() {
  const ref = createRef<HTMLDivElement>();
  return (
    <div>
      <ReportActions targetRef={ref as never} reportName="General Ledger" />
      <div ref={ref}>
        <table>
          <caption><span data-export-row>Sample Company</span><span data-export-row>October - December, 2025</span></caption>
          <thead><tr><th>Date</th><th>Debit</th></tr></thead>
          <tbody><tr><td>2025-10-01</td><td>$100.00</td></tr></tbody>
        </table>
      </div>
    </div>
  );
}

function TimestampFixture() {
  const ref = createRef<HTMLDivElement>();
  return (
    <div>
      <ReportActions targetRef={ref as never} reportName="Stamped Report" generatedAt="Sep 02, 2026, 08:15:30 AM EDT" />
      <div ref={ref}><ReportGeneratedStamp generatedAt="Sep 02, 2026, 08:15:30 AM EDT" /><table><tbody><tr><td>Connected data</td><td>125.00</td></tr></tbody></table></div>
    </div>
  );
}

async function copyAndRead(ui: React.ReactElement): Promise<string> {
  // Spy on the stub the setup already installed rather than replacing the whole clipboard object —
  // userEvent installs its own, and fighting over the property breaks both.
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  render(ui);
  await userEvent.click(screen.getByRole('button', { name: /^copy$/i }));
  return (writeText.mock.calls[0]?.[0] as string) ?? '';
}

describe('what leaves the app', () => {
  it('sends the visible report rows to the Excel workbook exporter', async () => {
    const saveExcelFile = vi.mocked(window.api.app.saveExcelFile);
    saveExcelFile.mockResolvedValue({ ok: true, data: { saved: true, filePath: 'C:\\Reports\\Test Report.xlsx' } });
    render(<Fixture />);

    await userEvent.click(screen.getByRole('button', { name: /export excel/i }));

    expect(saveExcelFile).toHaveBeenCalledWith({
      suggestedName: 'Test Report',
      rows: [
        ['Code', 'Account', 'Amount'],
        ['0542', 'Smith, John', '1234.56'],
        ['5100', 'Rent', '-500.00'],
      ],
    });
  });

  it('includes report metadata above the exported table header', async () => {
    const saveExcelFile = vi.mocked(window.api.app.saveExcelFile);
    saveExcelFile.mockResolvedValue({ ok: true, data: { saved: true, filePath: 'C:\\Reports\\General Ledger.xlsx' } });
    render(<MetadataFixture />);

    await userEvent.click(screen.getByRole('button', { name: /export excel/i }));

    expect(saveExcelFile).toHaveBeenCalledWith({
      suggestedName: 'General Ledger',
      rows: [['Sample Company'], ['October - December, 2025'], [], ['Date', 'Debit'], ['2025-10-01', '100.00']],
    });
  });

  it('places the report date and time stamp above Excel and copied rows', async () => {
    const saveExcelFile = vi.mocked(window.api.app.saveExcelFile);
    saveExcelFile.mockResolvedValue({ ok: true, data: { saved: true, filePath: 'C:\\Reports\\Stamped Report.xlsx' } });
    const rendered = render(<TimestampFixture />);
    expect(screen.getByTestId('report-generated-at')).toHaveTextContent('Generated on: Sep 02, 2026, 08:15:30 AM EDT');
    await userEvent.click(screen.getByRole('button', { name: /export excel/i }));
    expect(saveExcelFile).toHaveBeenCalledWith({
      suggestedName: 'Stamped Report',
      rows: [['Generated on: Sep 02, 2026, 08:15:30 AM EDT'], [], ['Connected data', '125.00']],
    });

    rendered.unmount();
    const copied = await copyAndRead(<TimestampFixture />);
    expect(copied).toContain('Generated on: Sep 02, 2026, 08:15:30 AM EDT');
  });

  it('carries the headers and every data row', async () => {
    const copied = await copyAndRead(<Fixture />);
    expect(copied).toContain('Code');
    expect(copied).toContain('Rent');
    expect(copied.split('\r\n')).toHaveLength(3); // header, two rows — the empty row is layout
  });

  it('strips the currency so the figure can be summed', async () => {
    // Left as "$1,234.56" it arrives in Excel as text and every check the reader runs fails.
    const copied = await copyAndRead(<Fixture />);
    expect(copied).toContain('1234.56');
    expect(copied).not.toContain('$1,234.56');
  });

  it('turns an accounting bracket into a real minus', async () => {
    const copied = await copyAndRead(<Fixture />);
    expect(copied).toContain('-500.00');
  });

  it('keeps a leading zero on an account code', async () => {
    // 0542 becomes 542 otherwise, because a spreadsheet reads it as a number.
    const copied = await copyAndRead(<Fixture />);
    expect(copied).toContain('0542');
  });

  it('uses tabs so a paste spreads across columns', async () => {
    const copied = await copyAndRead(<Fixture />);
    expect(copied).toContain('\t');
    expect(copied.split('\r\n')[0]).toBe('Code\tAccount\tAmount');
  });

  it('reads the value out of an editable cell', async () => {
    // The CCA schedule and the Chart of Accounts hold their values in inputs. Reading text alone
    // would export those rows blank.
    const copied = await copyAndRead(<EditableFixture />);
    expect(copied).toContain('Chequing');
    expect(copied).toContain('1000.00');
  });
});

describe('when there is nothing to export', () => {
  it('says so rather than saving an empty file', async () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <div>
        <ReportActions targetRef={ref as never} reportName="Empty" />
        <div ref={ref}>
          <p>No data for this period.</p>
        </div>
      </div>,
    );

    await userEvent.click(screen.getByRole('button', { name: /export excel/i }));
    expect(await screen.findByText(/nothing to export/i)).toBeInTheDocument();
  });
});

describe('Excel-style report search', () => {
  it('finds and highlights report cells, with keyboard navigation status', async () => {
    render(<Fixture />);
    const find = screen.getByRole('searchbox', { name: /find in report/i });
    await userEvent.type(find, 'rent');

    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toHaveClass('bg-yellow-100', 'ring-2');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('1 of 1')).not.toBeInTheDocument();
    expect(screen.getByText('Rent')).not.toHaveClass('bg-yellow-100');
  });

  it('reports when no table cell matches', async () => {
    render(<Fixture />);
    await userEvent.type(screen.getByRole('searchbox', { name: /find in report/i }), 'not-in-this-report');
    expect(screen.getByText('0 found')).toBeInTheDocument();
  });
});

describe('the controls', () => {
  it('offers all three ways out', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ReportActions targetRef={ref as never} reportName="Test" />);

    expect(screen.getByRole('button', { name: /export excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as pdf/i })).toBeInTheDocument();
  });
});
