import { CommandCentreSection, FlowArrow, FlowBox, FlowRow } from '../../components/CommandCentreFlow';

/**
 * A visual process map for the payroll workflow — click any box to jump straight to that step,
 * same idea as AccountEdge/QuickBooks Desktop's "Command Centre" flowchart, built from this app's
 * own actual steps rather than copying a competitor's (this app has no Timesheets/Payroll
 * Categories/electronic-payment-file concepts, so those don't appear here).
 *
 * Uses the shared FlowBox rather than a local copy — the local one was why this strip stayed solid
 * navy while the rest of the app moved to light tints. Six steps on one scrolling row, in the order
 * the work happens, each tinted so the sequence is scannable.
 */
export function PayrollCommandCentre({
  onAddEmployee,
  onRunPayroll,
  onScrollToRuns,
  onScrollToRemittance,
  onScrollToYearEndSlips,
  onScrollToShareholders,
  hasActiveEmployees,
}: {
  onAddEmployee: () => void;
  onRunPayroll: () => void;
  onScrollToRuns: () => void;
  onScrollToRemittance: () => void;
  onScrollToYearEndSlips: () => void;
  onScrollToShareholders: () => void;
  hasActiveEmployees: boolean;
}) {
  return (
    <CommandCentreSection title="Payroll Workflow">
      <FlowRow nowrap>
        <FlowBox label="1. Employees" tone="sky" onClick={onAddEmployee} />
        <FlowArrow />
        <FlowBox label="2. Run Payroll" tone="rose" onClick={onRunPayroll} disabled={!hasActiveEmployees} />
        <FlowArrow />
        <FlowBox label="3. Post & Pay Stub" tone="emerald" onClick={onScrollToRuns} />
        <FlowArrow />
        <FlowBox label="4. PD7A Remittance" tone="cyan" onClick={onScrollToRemittance} />
        <FlowArrow />
        <FlowBox label="5. Year-End Slips (T4 / T4A / T5018)" tone="amber" onClick={onScrollToYearEndSlips} />
        <FlowBox label="Shareholders & T5" tone="violet" onClick={onScrollToShareholders} />
      </FlowRow>
      {!hasActiveEmployees && <p className="mt-3 text-xs text-gray-400">Add an active employee before running payroll.</p>}
    </CommandCentreSection>
  );
}
