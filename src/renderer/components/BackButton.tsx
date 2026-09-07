import { useUiStore, type View } from '../app/store/uiStore';
import { titleForView } from '../layout/pageTitles';

/**
 * "← Back" that follows the rail you walked in on.
 *
 * A report opened from the Sales overview goes back to the Sales overview; one opened from the
 * Reports hub goes back to the hub, on the same group. Only when there is nowhere to go back to
 * — the screen was the first one opened — does it fall back to the page named by `fallback`.
 */
export function BackButton({ fallback, fallbackLabel, className = '' }: { fallback: View; fallbackLabel: string; className?: string }) {
  const goBackOr = useUiStore((s) => s.goBackOr);
  const previous = useUiStore((s) => s.history.index > 0 ? s.history.entries[s.history.index - 1] : null);
  const label = previous ? titleForView(previous) ?? fallbackLabel : fallbackLabel;
  return (
    <button type="button" onClick={() => goBackOr(fallback)} className={`whitespace-nowrap text-sm text-brand-600 hover:underline ${className}`} title={previous ? 'Back to the page you came from' : `Back to ${fallbackLabel}`}>
      ← Back to {label}
    </button>
  );
}
