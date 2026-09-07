import { useEffect, useState } from 'react';
import type { TagGroupRow } from '../../preload/index';

let cachedGroups: TagGroupRow[] | null = null;

/** The class / location cell on an invoice, bill or sales-receipt line: one small select per
 * active tag group (a group named "Class" or "Location" is the QuickBooks idea; any group works).
 * Renders nothing when the company has no tag groups, so the column costs nothing until it is
 * wanted. Selections travel with the line and land on the posted journal line. */
export function DocumentLineTagPicker({ tagIds, onChange, compact = true }: { tagIds: number[]; onChange: (tagIds: number[]) => void; compact?: boolean }) {
  const [groups, setGroups] = useState<TagGroupRow[]>(cachedGroups ?? []);
  useEffect(() => {
    if (cachedGroups) return;
    window.api.tags.groups().then((r) => { if (r.ok) { cachedGroups = r.data; setGroups(r.data); } });
  }, []);
  const active = groups.filter((g) => g.isActive && g.tags.some((t) => t.isActive));
  if (active.length === 0) return null;
  return (
    <div className={compact ? 'flex flex-col gap-1' : 'flex flex-wrap gap-2'}>
      {active.map((group) => {
        const chosen = group.tags.find((t) => tagIds.includes(t.id));
        return (
          <select
            key={group.id}
            aria-label={group.name}
            title={group.name}
            className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
            value={chosen ? String(chosen.id) : ''}
            onChange={(e) => {
              const others = tagIds.filter((id) => !group.tags.some((t) => t.id === id));
              onChange(e.target.value ? [...others, Number(e.target.value)] : others);
            }}
          >
            <option value="">{group.name}…</option>
            {group.tags.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        );
      })}
    </div>
  );
}

/** Whether any tag group exists — for showing the column heading only when the picker will render. */
export function useHasTagGroups(): boolean {
  const [has, setHas] = useState(Boolean(cachedGroups?.some((g) => g.isActive && g.tags.some((t) => t.isActive))));
  useEffect(() => {
    window.api.tags.groups().then((r) => { if (r.ok) { cachedGroups = r.data; setHas(r.data.some((g) => g.isActive && g.tags.some((t) => t.isActive))); } });
  }, []);
  return has;
}
