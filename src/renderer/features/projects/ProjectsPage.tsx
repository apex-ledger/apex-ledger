import { YearInput } from '../../components/YearInput';
import { useEffect, useMemo, useState } from 'react';
import type { ProfitAndLossByTagResponse, TagGroupRow } from '../../../preload/index';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';

function isoYearBounds(year: number): { periodStart: string; periodEnd: string } {
  return { periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
}

function valueFor(values: Map<number, number>, id: number): number {
  return values.get(id) ?? 0;
}

/**
 * A project is represented by a tag in one Projects/Jobs tag group. That keeps project reporting
 * attached to the journal lines that already drive every financial statement instead of creating
 * a second, manually maintained set of income and cost totals.
 */
export function ProjectsPage() {
  const setView = useUiStore((s) => s.setView);
  const [groups, setGroups] = useState<TagGroupRow[]>([]);
  const [projectGroupId, setProjectGroupId] = useState<number | null>(null);
  const [report, setReport] = useState<ProfitAndLossByTagResponse | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [newProjectName, setNewProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadGroups(preferredId?: number) {
    const result = await window.api.tags.groups();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGroups(result.data);
    const preferred = preferredId ? result.data.find((group) => group.id === preferredId) : null;
    const named = result.data.find((group) => /^(projects?|jobs?)$/i.test(group.name.trim()));
    const next = preferred ?? named ?? null;
    setProjectGroupId(next?.id ?? null);
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    if (projectGroupId === null) {
      setReport(null);
      return;
    }
    let cancelled = false;
    const bounds = isoYearBounds(year);
    window.api.reports.profitAndLossByTag({ tagGroupId: projectGroupId, ...bounds }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setReport(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectGroupId, year]);

  const projectGroup = groups.find((group) => group.id === projectGroupId) ?? null;
  const projects = projectGroup?.tags ?? [];
  const totals = useMemo(() => {
    if (!report) return { income: 0, cost: 0, profit: 0 };
    const income = projects.reduce((sum, project) => sum + valueFor(report.revenue.totalByTag, project.id), 0);
    const cost = projects.reduce((sum, project) => sum + valueFor(report.expenses.totalByTag, project.id), 0);
    return { income, cost, profit: income - cost };
  }, [projects, report]);

  async function setUpProjects() {
    setBusy(true);
    const result = await window.api.tags.createGroup({
      name: 'Projects',
      description: 'One tag per customer job for project income, cost and margin reporting.',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadGroups(result.data.id);
  }

  async function addProject() {
    const name = newProjectName.trim();
    if (!name || projectGroupId === null) return;
    setBusy(true);
    const result = await window.api.tags.create({ tagGroupId: projectGroupId, name });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewProjectName('');
    await loadGroups(projectGroupId);
  }

  async function toggleProject(id: number, isActive: boolean) {
    const result = await window.api.tags.update({ id, patch: { isActive: !isActive } });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadGroups(projectGroupId ?? undefined);
  }

  if (projectGroupId === null) {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 shadow-soft">
        <h2 className="text-lg font-semibold text-indigo-950">Set up project tracking</h2>
        <p className="mt-2 max-w-3xl text-sm text-indigo-800">
          Apex Ledger will create a Projects tag group. Each project becomes a selectable tag on journal lines, so project income,
          costs and margin always reconcile to the general ledger.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void setUpProjects()} className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
          {busy ? 'Setting up…' : 'Set up Projects'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <div>
          <div className="font-semibold text-indigo-950">Project profitability</div>
          <p className="mt-1 text-sm text-indigo-800">Income and costs come directly from posted ledger lines tagged to each project.</p>
        </div>
        <label className="text-sm text-indigo-900">
          Reporting year
          <YearInput value={year} onChange={setYear} aria-label="Year" className="ml-2 w-24 rounded-lg border border-indigo-300 bg-white px-2 py-1.5" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Active projects" count={projects.filter((project) => project.isActive).length} />
        <Summary label="Project income" cents={totals.income} />
        <Summary label="Project costs" cents={totals.cost} />
        <Summary label="Project profit" cents={totals.profit} accent />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-3">
          <div>
            <h2 className="font-semibold text-gray-950">Projects</h2>
            <p className="text-sm text-gray-500">Create a project here, then select it in the Projects tag group when coding its ledger lines.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addProject(); }} placeholder="New project name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button type="button" disabled={busy || !newProjectName.trim()} onClick={() => void addProject()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40">New project</button>
          </div>
        </div>

        {error && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {projects.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">No projects yet. Add the first project above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-3 py-2">Project</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Income</th><th className="px-3 py-2 text-right">Costs</th><th className="px-3 py-2 text-right">Profit</th><th className="px-3 py-2 text-right">Margin</th><th className="px-3 py-2">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((project) => {
                  const income = report ? valueFor(report.revenue.totalByTag, project.id) : 0;
                  const cost = report ? valueFor(report.expenses.totalByTag, project.id) : 0;
                  const profit = income - cost;
                  const margin = income === 0 ? null : (profit / income) * 100;
                  return (
                    <tr key={project.id} className={project.isActive ? '' : 'bg-gray-50 text-gray-500'}>
                      <td className="px-3 py-2 font-medium">{project.name}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${project.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>{project.isActive ? 'In progress' : 'Closed'}</span></td>
                      <td className="px-3 py-2 text-right"><Money cents={income} /></td>
                      <td className="px-3 py-2 text-right"><Money cents={cost} /></td>
                      <td className="px-3 py-2 text-right font-semibold"><Money cents={profit} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{margin === null ? '—' : `${margin.toFixed(1)}%`}</td>
                      <td className="px-3 py-2"><button type="button" onClick={() => void toggleProject(project.id, project.isActive)} className="text-sm font-medium text-brand-700 hover:underline">{project.isActive ? 'Close' : 'Reopen'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t border-gray-200 px-3 py-2 text-sm">
          <button type="button" onClick={() => setView({ kind: 'report', report: 'profitAndLossByTag' })} className="font-medium text-brand-700 hover:underline">Open detailed P&amp;L by project</button>
          <button type="button" onClick={() => setView({ kind: 'tags' })} className="font-medium text-gray-600 hover:underline">Manage project tags</button>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, cents, count, accent = false }: { label: string; cents?: number; count?: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 shadow-soft ${accent ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-bold text-gray-950">{count ?? <Money cents={cents ?? 0} />}</div>
    </div>
  );
}
