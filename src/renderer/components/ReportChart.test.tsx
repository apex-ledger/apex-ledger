import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportChart } from './ReportChart';

const expenses = [
  ['Account', 'Amount'],
  ['Wages', '$5,000.00'],
  ['Rent', '$2,000.00'],
  ['Total', '$7,000.00'],
];

describe('charting the report on screen', () => {
  it('draws nothing at all when the chart is off', () => {
    const { container } = render(<ReportChart rows={expenses} kind="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each kind, labelled by the column it is charting', () => {
    for (const kind of ['bars', 'horizontal', 'pie'] as const) {
      const { unmount } = render(<ReportChart rows={expenses} kind={kind} />);
      expect(screen.getByTestId('report-chart')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      unmount();
    }
  });

  it('gives the pie its shares of the whole, with the total row left out', () => {
    render(<ReportChart rows={expenses} kind="pie" />);
    // 5,000 and 2,000 of 7,000 — not of 14,000, which is what counting the Total row would give.
    expect(screen.getByText('71.4%')).toBeInTheDocument();
    expect(screen.getByText('28.6%')).toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  it('falls back to bars when the figures run both ways, since there is no whole to divide', () => {
    render(<ReportChart rows={[['Account', 'Amount'], ['Revenue', '5,000.00'], ['Refunds', '(1,200.00)']]} kind="pie" />);
    expect(screen.getByText(/no whole for a pie to divide/)).toBeInTheDocument();
    expect(screen.getByLabelText('Horizontal bar chart of the report')).toBeInTheDocument();
  });

  it('says so plainly when a report has no figures to chart', () => {
    render(<ReportChart rows={[['Name', 'Note'], ['Rent', 'monthly']]} kind="bars" />);
    expect(screen.getByText(/Nothing to chart here/)).toBeInTheDocument();
  });
});
