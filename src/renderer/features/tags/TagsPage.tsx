import { useState } from 'react';
import { useIpcQuery } from '../../hooks/useIpcQuery';

/** Tag groups and their tags.
 *
 * A group is a question — which store, which job, which vehicle — and its tags are the possible
 * answers. A transaction line carries at most one tag from each group, which is what lets a report
 * put a group's tags across the top and have the columns add up to the total.
 *
 * Groups are what makes tags different from a pile of labels: without them, two overlapping tags on
 * one line get counted twice and no total ever ties out.
 */

export function TagsPage() {
  const { data, loading, error, reload } = useIpcQuery(() => window.api.tags.groups({}), []);
  const [actionError, setActionError] = useState<string | null>(null);

  function deleteGroup(id: number, name: string) {
    if (!window.confirm(`Delete the tag group “${name}”? This cannot be undone. Groups already used on transactions will be refused to protect report history.`)) return;
    void run(() => window.api.tags.deleteGroup(id));
  }

  function deleteTag(id: number, name: string) {
    if (!window.confirm(`Delete the tag “${name}”? This cannot be undone. Tags already used on transactions will be refused to protect report history.`)) return;
    void run(() => window.api.tags.delete(id));
  }
  const [newGroup, setNewGroup] = useState('');
  const [newTagFor, setNewTagFor] = useState<number | null>(null);
  const [newTag, setNewTag] = useState('');

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setActionError(null);
    const result = await fn();
    if (!result.ok) setActionError(result.error ?? 'Something went wrong.');
    else reload();
  }

  return (
    <div className="w-full space-y-3">
      <p className="text-sm text-gray-600">
        A group is a question — which store, which job, which vehicle — and its tags are the answers. A transaction line can carry one
        tag from each group, so a report can show a column per tag and have them add up.
      </p>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {actionError && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newGroup.trim()) return;
          void run(async () => {
            const r = await window.api.tags.createGroup({ name: newGroup.trim(), description: null });
            if (r.ok) setNewGroup('');
            return r;
          });
        }}
      >
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          placeholder="New group — e.g. Store, Job, Vehicle"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
          Add group
        </button>
      </form>

      {data?.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No tag groups yet. Add one above to start splitting reports by it.</p>
      )}

      {(data ?? []).map((group) => (
        <div key={group.id} className={`rounded border border-gray-200 p-3 ${group.isActive ? '' : 'opacity-60'}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="font-medium">{group.name}</span>
              {!group.isActive && <span className="ml-2 text-xs text-gray-500">(inactive)</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void run(() => window.api.tags.updateGroup({ id: group.id, patch: { isActive: !group.isActive } }))}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50"
              >
                {group.isActive ? 'Make inactive' : 'Reactivate'}
              </button>
              <button
                type="button"
                onClick={() => deleteGroup(group.id, group.name)}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.tags.length === 0 && <span className="text-xs text-gray-500">No tags in this group yet.</span>}
            {group.tags.map((tag) => (
              <span
                key={tag.id}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  tag.isActive ? 'bg-sky-50 text-sky-800' : 'bg-gray-100 text-gray-500 line-through'
                }`}
              >
                {tag.name}
                <button
                  type="button"
                  title={tag.isActive ? 'Make inactive' : 'Reactivate'}
                  onClick={() => void run(() => window.api.tags.update({ id: tag.id, patch: { isActive: !tag.isActive } }))}
                  className="opacity-60 hover:opacity-100"
                >
                  {tag.isActive ? '−' : '+'}
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => deleteTag(tag.id, tag.name)}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {newTagFor === group.id ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTag.trim()) return;
                void run(async () => {
                  const r = await window.api.tags.create({ tagGroupId: group.id, name: newTag.trim() });
                  if (r.ok) {
                    setNewTag('');
                    setNewTagFor(null);
                  }
                  return r;
                });
              }}
            >
              <input
                autoFocus
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder={`New tag in ${group.name}`}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button type="submit" className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewTagFor(null);
                  setNewTag('');
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNewTagFor(group.id)}
              className="mt-2 rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50"
            >
              Add tag
            </button>
          )}
        </div>
      ))}

      <p className="text-xs text-gray-400">
        A group or tag already used on a transaction cannot be deleted — it would disappear from past reports with no visible reason.
        Making it inactive removes it from the pickers while leaving history intact.
      </p>
    </div>
  );
}
