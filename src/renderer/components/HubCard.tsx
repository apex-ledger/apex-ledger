import type { ReactNode } from 'react';

/** Light tints so a grid of hub cards reads as distinct destinations rather than a wall of white
 * boxes — the same palette the workflow rows and banking cards use. Written out in full for
 * Tailwind's JIT scanner; see the note in Sidebar.tsx. */
export type HubTone = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan' | 'teal' | 'brand';

const HUB_TONES: Record<HubTone, string> = {
  sky: 'border-sky-200 bg-sky-50/60 hover:border-sky-300',
  emerald: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300',
  amber: 'border-amber-200 bg-amber-50/60 hover:border-amber-300',
  violet: 'border-violet-200 bg-violet-50/60 hover:border-violet-300',
  rose: 'border-rose-200 bg-rose-50/60 hover:border-rose-300',
  cyan: 'border-cyan-200 bg-cyan-50/60 hover:border-cyan-300',
  teal: 'border-teal-200 bg-teal-50/60 hover:border-teal-300',
  brand: 'border-brand-200 bg-brand-50/60 hover:border-brand-300',
};

export function HubCard({
  title,
  description,
  onClick,
  badge,
  tone = 'brand',
}: {
  title: string;
  description: string;
  onClick: () => void;
  badge?: ReactNode;
  tone?: HubTone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Lifts a hair on hover and settles back — the card behaves like a physical object rather
      // than a link that merely changes colour.
      className={`group flex h-full w-full flex-col items-start rounded-xl2 border p-3 text-left shadow-soft duration-250 ease-standard hover:-translate-y-0.5 hover:shadow-lift ${HUB_TONES[tone]}`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-semibold text-gray-900">{title}</span>
        {badge}
      </div>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </button>
  );
}
