import type { ReactNode } from 'react';

/**
 * Shared pieces for a "Command Centre" style process map — click a box to jump straight to that
 * step, same idea as AccountEdge/QuickBooks Desktop's per-module flowchart. Each page builds its
 * own flow from ITS OWN actual features (see PayrollCommandCentre.tsx for the first one) rather
 * than this file knowing about any specific module.
 */

/** Light tints rather than solid dark fills: a row of seven saturated navy blocks reads as a wall,
 * where tinted steps read as a sequence you can scan. Written out in full so Tailwind's JIT
 * scanner finds them — see the same note in Sidebar.tsx. */
export type FlowTone = 'brand' | 'sky' | 'rose' | 'emerald' | 'cyan' | 'amber' | 'violet' | 'teal';

const FLOW_TONES: Record<FlowTone, string> = {
  brand: 'bg-brand-50 text-brand-800 ring-brand-200 hover:bg-brand-100',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100',
  rose: 'bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100',
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-200 hover:bg-cyan-100',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200 hover:bg-teal-100',
};

export function FlowBox({
  label,
  onClick,
  disabled,
  tone = 'brand',
  current,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: FlowTone;
  /** The step you're already on — shown as filled rather than dimmed, so "you are here" reads as a
   * position in the flow instead of as a broken button. */
  current?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-semibold shadow-soft ring-1 duration-250 ease-standard hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0 ${
        current ? 'bg-brand-700 text-white ring-brand-700' : FLOW_TONES[tone]
      }`}
    >
      {label}
    </button>
  );
}

export function FlowArrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  return (
    <span className={`flex-shrink-0 text-gray-300 ${direction === 'down' ? 'rotate-90' : ''}`} aria-hidden>
      ➜
    </span>
  );
}

/** `nowrap` keeps a long flow on a single line, scrolling sideways instead of reflowing onto three
 * rows — a process map that wraps stops reading as one sequence. */
export function FlowRow({ children, nowrap = false }: { children: ReactNode; nowrap?: boolean }) {
  return <div className={`flex items-center gap-1.5 ${nowrap ? 'flex-nowrap overflow-x-auto' : 'flex-wrap'}`}>{children}</div>;
}

export function CommandCentreSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-900">{title}</h2>
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </section>
  );
}
