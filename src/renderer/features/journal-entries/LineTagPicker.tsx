import { useEffect, useRef, useState } from 'react';
import type { TagGroupRow } from '../../../preload/index';

/** The tag cell on a journal line.
 *
 * One dropdown per group, because a line carries at most one tag from each: that constraint is what
 * makes the columns on a tag report add up instead of double-counting. Offering a flat list of every
 * tag would let someone pick Dundas and Kipling on the same line, and no total would ever tie out.
 *
 * Tags attach to a saved line id, so this stays disabled until the entry has been saved once. The
 * alternative — holding tags in memory and writing them after save — silently loses them whenever a
 * save fails, which is exactly when someone is least likely to notice.
 */
export function LineTagPicker({
  lineId,
  groups,
  initialTagIds,
  disabled,
  onError,
}: {
  lineId: number | null;
  groups: TagGroupRow[];
  /** This line's saved tags, fetched once for the whole entry by the form rather than per line. */
  initialTagIds: number[];
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(initialTagIds);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeGroups = groups.filter((g) => g.isActive && g.tags.some((t) => t.isActive));

  // Re-seed when the entry finishes loading (or the line is saved and gains an id) — until then the
  // form has nothing to hand over.
  useEffect(() => {
    setSelected(initialTagIds);
  }, [lineId, initialTagIds.join(',')]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function choose(groupId: number, tagId: number | null) {
    if (lineId === null) return;
    const group = groups.find((g) => g.id === groupId);
    const groupTagIds = new Set((group?.tags ?? []).map((t) => t.id));

    // Replace this group's tag rather than adding to it — one per group is the whole rule.
    const next = selected.filter((id) => !groupTagIds.has(id));
    if (tagId !== null) next.push(tagId);

    const previous = selected;
    setSelected(next);
    const result = await window.api.tags.setForLine({ journalEntryLineId: lineId, tagIds: next });
    if (!result.ok) {
      setSelected(previous);
      onError(result.error);
    }
  }

  const chosen = activeGroups
    .flatMap((g) => g.tags.filter((t) => selected.includes(t.id)).map((t) => ({ group: g.name, tag: t.name })))
    .slice(0, 3);

  if (activeGroups.length === 0) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || lineId === null}
        title={lineId === null ? 'Save the entry first — tags attach to a saved line.' : 'Choose tags for this line'}
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-left text-xs hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
      >
        {chosen.length === 0 ? 'Tag' : chosen.map((c) => c.tag).join(', ')}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white p-2 shadow-lg">
          {activeGroups.map((group) => {
            const current = group.tags.find((t) => selected.includes(t.id));
            return (
              <label key={group.id} className="mb-2 block last:mb-0">
                <span className="mb-0.5 block text-xs text-gray-500">{group.name}</span>
                <select
                  value={current?.id ?? ''}
                  onChange={(e) => void choose(group.id, e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">— none —</option>
                  {group.tags
                    .filter((t) => t.isActive || t.id === current?.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
