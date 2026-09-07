/** First / previous / next / last, for paging through saved records on an editor screen.
 *
 * Matches the arrows every desktop accounting package puts on a document form. Checking the last
 * three invoices to a customer otherwise means going back to the list and opening each one, losing
 * your place each time.
 *
 * Disabled at each end rather than wrapping around. Wrapping makes "last" and "first" the same
 * click, and somebody paging backwards through a year lands at the newest record without noticing
 * they have been round the loop.
 */
export function RecordNavigator({
  ids,
  currentId,
  onGo,
  disabled,
  label = 'record',
}: {
  /** Every record's id, in the order they should be paged through. */
  ids: number[];
  /** The record on screen, or 'new' for one not yet saved. */
  currentId: number | 'new';
  onGo: (id: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const index = typeof currentId === 'number' ? ids.indexOf(currentId) : -1;
  const total = ids.length;

  // index === -1 is an unsaved record: not in the list, and NOT the first one. Treating it as the
  // first leaves every arrow dead on a blank form, with no way back to the records already saved —
  // so "previous" from here means the newest saved one, which is what the click is reaching for.
  const atFirst = index === -1 ? total === 0 : index <= 0;
  const atLast = index === -1 ? total === 0 : index >= total - 1;

  function go(target: number) {
    const id = ids[target];
    if (id !== undefined) onGo(id);
  }

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Move between ${label}s`}>
      <NavButton
        label="First"
        glyph="«"
        title={`First ${label}`}
        disabled={disabled || atFirst}
        onClick={() => go(0)}
      />
      <NavButton
        label="Previous"
        glyph="‹"
        title={`Previous ${label}`}
        disabled={disabled || atFirst}
        onClick={() => go(index === -1 ? total - 1 : index - 1)}
      />

      <span className="px-1 text-xs tabular-nums text-gray-500">
        {index === -1 ? `New — ${total} saved` : `${index + 1} of ${total}`}
      </span>

      <NavButton
        label="Next"
        glyph="›"
        title={`Next ${label}`}
        disabled={disabled || atLast}
        onClick={() => go(index === -1 ? total - 1 : index + 1)}
      />
      <NavButton label="Last" glyph="»" title={`Last ${label}`} disabled={disabled || atLast} onClick={() => go(total - 1)} />
    </div>
  );
}

function NavButton({
  label,
  glyph,
  title,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-gray-400 px-2.5 py-1 text-lg font-bold leading-none text-gray-800 hover:bg-gray-100 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
