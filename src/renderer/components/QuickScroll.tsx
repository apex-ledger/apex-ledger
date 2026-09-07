import { useEffect, useState, type RefObject } from 'react';

/** The quick scroller pinned to the upper-right corner of every sheet and report: jump to the
 * top, page up, page down, jump to the bottom. It stays put while the content scrolls beneath it,
 * so a long ledger or a 400-row list never needs the mouse wheel to get back to the heading. It
 * only appears once the content is taller than the window. */
export function QuickScroll({ targetRef }: { targetRef: RefObject<HTMLElement> }) {
  const [scrollable, setScrollable] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const measure = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 8;
      setScrollable(canScroll);
      setAtTop(el.scrollTop <= 2);
      setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // Observers keep the arrows honest as rows load; test DOMs (jsdom) don't provide them.
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(el);
    const mutation = typeof MutationObserver === 'function' ? new MutationObserver(measure) : null;
    mutation?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', measure);
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [targetRef]);

  if (!scrollable) return null;
  const el = () => targetRef.current;
  const go = (top: number) => el()?.scrollTo({ top, behavior: 'smooth' });
  const page = () => (el()?.clientHeight ?? 600) * 0.85;
  const button = 'flex h-7 w-7 items-center justify-center text-sm leading-none text-gray-600 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="pointer-events-none absolute right-3 top-2 z-20" data-export-skip>
      <div className="pointer-events-auto flex flex-col divide-y divide-gray-200 overflow-hidden rounded-full border border-gray-300 bg-white/95 shadow-md" role="group" aria-label="Quick scroll">
        <button type="button" className={button} title="Top of sheet" aria-label="Scroll to top" disabled={atTop} onClick={() => go(0)}>⇈</button>
        <button type="button" className={button} title="Page up" aria-label="Page up" disabled={atTop} onClick={() => go(Math.max(0, (el()?.scrollTop ?? 0) - page()))}>▲</button>
        <button type="button" className={button} title="Page down" aria-label="Page down" disabled={atBottom} onClick={() => go((el()?.scrollTop ?? 0) + page())}>▼</button>
        <button type="button" className={button} title="Bottom of sheet" aria-label="Scroll to bottom" disabled={atBottom} onClick={() => go(el()?.scrollHeight ?? 0)}>⇊</button>
      </div>
    </div>
  );
}
