import { useUiStore } from '../app/store/uiStore';

/** One consistent drill-back from a business document to the exact ledger entry it created. */
export function JournalEntryLink({ id, label, className = '' }: { id: number | null; label?: string; className?: string }) {
  const setView = useUiStore((state) => state.setView);
  if (id === null) return null;
  return (
    <button type="button" onClick={() => setView({ kind: 'journalForm', id })} className={`text-xs font-medium text-brand-600 hover:underline ${className}`} title="Open journal entry">
      {label ?? 'Open GL'}
    </button>
  );
}
