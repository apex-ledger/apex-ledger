import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lesson, LessonStep } from '@shared/domain/voice/lessons';

/**
 * The trainer's pointer. For the current step it finds the control on the live screen by the text
 * a person sees, draws a ring around it, and shows the narration in a card beside it with Next,
 * Back and Stop. When the control is not on screen the card still shows, pinned to the corner, so
 * a lesson never stalls on a screen that looks a little different.
 */
export function findStepTarget(step: LessonStep): HTMLElement | null {
  const f = step.find;
  if (!f) return null;
  const visible = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement && el.getClientRects().length > 0;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (f.testId) { const el = document.querySelector<HTMLElement>(`[data-testid="${f.testId}"]`); if (visible(el)) return el; }
  if (f.placeholder) { const el = document.querySelector<HTMLElement>(`[placeholder^="${f.placeholder.slice(0, 12)}"]`); if (visible(el)) return el; }
  if (f.label) {
    const want = norm(f.label);
    // The label is the smallest visible element whose own text is the label — an exact match
    // first, then one that starts with it — never a wrapper that happens to contain the word.
    const all = [...document.querySelectorAll<HTMLElement>('label, span, div, th, td, legend')].filter((el) => visible(el) && el.children.length === 0);
    const exact = all.filter((el) => norm(el.textContent ?? '') === want);
    const starts = all.filter((el) => norm(el.textContent ?? '').startsWith(want) && (el.textContent ?? '').length < want.length + 16);
    const labels = [...exact, ...starts].sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0));
    for (const el of labels) {
      const wrap = el.closest('label');
      const fromLabel = wrap?.querySelector<HTMLElement>('input, select, textarea, button, [role="combobox"]') ?? null;
      if (visible(fromLabel)) return fromLabel;
      const sibling = el.parentElement?.querySelector<HTMLElement>('input, select, textarea, [role="combobox"]') ?? null;
      if (visible(sibling)) return sibling;
      if (el.tagName === 'TH' || el.tagName === 'TD') return el;
    }
    if (labels[0]) return labels[0];
  }
  if (f.button) {
    const want = norm(f.button);
    const el = [...document.querySelectorAll<HTMLElement>('button, a, [role="button"], [role="tab"]')].filter(visible).find((b) => norm(b.textContent ?? '') === want) ?? [...document.querySelectorAll<HTMLElement>('button, a, [role="button"], [role="tab"]')].filter(visible).find((b) => norm(b.textContent ?? '').startsWith(want));
    if (el) return el;
  }
  if (f.text) {
    const want = norm(f.text);
    const el = [...document.querySelectorAll<HTMLElement>('h1, h2, h3, th, label, span, div, button, p')].filter((e) => visible(e) && e.children.length <= 2).find((e) => norm(e.textContent ?? '').startsWith(want));
    if (el) return el;
  }
  return null;
}

export function LessonOverlay({ lesson, index, onNext, onBack, onStop }: { lesson: Lesson; index: number; onNext: () => void; onBack: () => void; onStop: () => void }) {
  const step = lesson.steps[index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    let tries = 0;
    let timer: number | undefined;
    let clicked = false;
    const locate = () => {
      const el = findStepTarget(step);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
        // A step that opens a form presses its control once, so the next steps can point inside the form.
        if (step.act === 'click' && !clicked) { clicked = true; window.setTimeout(() => el.click(), 600); }
        return;
      }
      setRect(null);
      if (tries++ < 8) timer = window.setTimeout(locate, 250);
    };
    locate();
    const onScroll = () => { const el = findStepTarget(step); if (el) setRect(el.getBoundingClientRect()); };
    // A screen that has just opened keeps settling for a moment (lists load, rows appear), which
    // moves the control; keep the ring on it by re-measuring while the step is showing.
    const follow = window.setInterval(() => { const el = findStepTarget(step); if (el) { const r = el.getBoundingClientRect(); setRect((prev) => (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.width - r.width) < 1 ? prev : r)); } }, 300);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { if (timer) window.clearTimeout(timer); window.clearInterval(follow); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [step, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onStop(); if (e.key === 'ArrowRight') onNext(); if (e.key === 'ArrowLeft') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onBack, onStop]);

  const pad = 6;
  const cardBelow = rect ? rect.bottom + 12 + 180 < window.innerHeight : true;
  // Clamped to the viewport on every side, so a control at the far right or bottom still gets a card that is fully on screen.
  const width = Math.min(380, window.innerWidth - 24);
  const cardStyle: React.CSSProperties = rect
    ? { position: 'fixed', left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: cardBelow ? rect.bottom + 12 : Math.max(12, rect.top - 12 - 180), width }
    : { position: 'fixed', right: 16, bottom: 16, width };
  const last = index === lesson.steps.length - 1;

  // Rendered on the document body, not inside the header, so "fixed" means the window and not
  // whichever transformed ancestor the panel happens to sit in.
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50" data-testid="lesson-overlay">
      {rect && (
        <div
          className="absolute rounded-md ring-4 ring-amber-400 ring-offset-2 transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.35)' }}
        />
      )}
      <div className="pointer-events-auto rounded-lg border border-amber-300 bg-white p-3 shadow-2xl" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Lesson · {lesson.title}</div>
          <div className="text-xs text-gray-500">Step {index + 1} of {lesson.steps.length}</div>
        </div>
        <p className="mt-1 text-sm text-gray-900">{step.say}</p>
        {!rect && <p className="mt-1 text-xs text-gray-500">The control for this step is not on screen right now; follow the words above.</p>}
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={onBack} disabled={index === 0} className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40">← Back</button>
          <button type="button" onClick={onNext} className="rounded-full bg-amber-500 px-4 py-1 text-sm font-medium text-white hover:bg-amber-600">{last ? 'Finish' : 'Next →'}</button>
          <button type="button" onClick={onStop} className="ml-auto text-xs text-gray-500 hover:underline">Stop lesson</button>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Say next, back, repeat or stop. Arrow keys work too; Esc stops.</p>
      </div>
    </div>,
    document.body,
  );
}
