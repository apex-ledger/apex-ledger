import { useUiStore } from '../app/store/uiStore';
import { openOriginalEntry } from '../utils/openOriginalEntry';

/** A visible, consistent report drill-through. Report rows remain clickable for speed, while this
 * control makes the route back to the source document discoverable and keyboard accessible. */
export function OpenEntryButton({ entryId, compact = false }: { entryId: number; compact?: boolean }) {
  const setView = useUiStore((state) => state.setView);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void openOriginalEntry(entryId, setView);
      }}
      className="whitespace-nowrap rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-300"
      aria-label={`Open original entry ${entryId}`}
      title="Open the invoice, receipt, bill, payroll, tax filing, or journal entry that created this report line"
    >
      {compact ? 'Open' : 'Open Entry'}
    </button>
  );
}
