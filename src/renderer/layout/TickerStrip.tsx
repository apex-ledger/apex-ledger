import { useEffect, useMemo, useState } from 'react';
import { loadTickerEnabled, loadTickerMode, storeTickerEnabled, storeTickerMode, type TickerMode } from '../utils/tickerSettings';

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}
interface MarketNewsItem {
  title: string;
  link: string;
}

const REFRESH_MS = 60_000;

function QuoteItem({ q }: { q: MarketQuote }) {
  const up = q.change >= 0;
  return (
    <span className="mx-4 inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className="font-semibold text-white">{q.name}</span>
      <span className="tabular-nums text-gray-200">{q.price.toFixed(2)}</span>
      <span className={`tabular-nums font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(q.change).toFixed(2)} ({Math.abs(q.changePercent).toFixed(2)}%)
      </span>
    </span>
  );
}

/**
 * A CNBC/Google-Finance-style scrolling strip fixed to the very top of the app. Quotes and news
 * are fetched from the main process (avoids the renderer's CSP blocking direct network calls) and
 * come from free, keyless sources — best-effort, not a paid market data feed, so an offline
 * machine or a source hiccup just shows an empty/paused strip rather than an error.
 */
export function TickerStrip() {
  const [enabled, setEnabled] = useState(loadTickerEnabled);
  const [mode, setMode] = useState<TickerMode>(loadTickerMode);
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [news, setNews] = useState<MarketNewsItem[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    function refresh() {
      window.api.market.quotes().then((r) => !cancelled && r.ok && setQuotes(r.data));
      window.api.market.news().then((r) => !cancelled && r.ok && setNews(r.data));
    }
    refresh();
    const interval = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  function toggleEnabled() {
    setEnabled((prev) => {
      const next = !prev;
      storeTickerEnabled(next);
      return next;
    });
  }

  function toggleMode() {
    setMode((prev) => {
      const next: TickerMode = prev === 'stocks' ? 'news' : 'stocks';
      storeTickerMode(next);
      return next;
    });
  }

  // Content is duplicated back-to-back so the marquee loop (translateX to -50%) has no visible
  // seam — the animation duration scales with content length so longer lists don't fly by faster.
  const trackDurationSeconds = useMemo(() => {
    const count = mode === 'stocks' ? quotes.length : news.length;
    return Math.max(20, count * 5);
  }, [mode, quotes.length, news.length]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={toggleEnabled}
        className="flex h-5 w-full flex-shrink-0 items-center justify-center bg-brand-950 text-[10px] font-medium text-brand-300 hover:text-white"
        title="Show market ticker"
      >
        ▾ Show Market Ticker
      </button>
    );
  }

  const hasContent = mode === 'stocks' ? quotes.length > 0 : news.length > 0;

  return (
    <div className="flex h-7 w-full flex-shrink-0 items-center overflow-hidden border-b border-brand-800 bg-black">
      <div className="flex-1 overflow-hidden">
        {hasContent ? (
          <div className="flex w-max animate-marquee" style={{ animationDuration: `${trackDurationSeconds}s` }}>
            {mode === 'stocks' ? (
              <>
                <span className="flex">
                  {quotes.map((q) => (
                    <QuoteItem key={q.symbol} q={q} />
                  ))}
                </span>
                <span className="flex" aria-hidden>
                  {quotes.map((q) => (
                    <QuoteItem key={`${q.symbol}-dup`} q={q} />
                  ))}
                </span>
              </>
            ) : (
              <>
                <span className="flex">
                  {news.map((n, i) => (
                    <a
                      key={i}
                      href={n.link || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="mx-4 inline-block whitespace-nowrap text-xs text-gray-200 hover:text-white hover:underline"
                    >
                      📰 {n.title}
                    </a>
                  ))}
                </span>
                <span className="flex" aria-hidden>
                  {news.map((n, i) => (
                    <span key={`${i}-dup`} className="mx-4 inline-block whitespace-nowrap text-xs text-gray-200">
                      📰 {n.title}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="mx-4 inline-block text-xs text-gray-500">Loading market data…</span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 border-l border-brand-800 bg-black px-2">
        <button type="button" onClick={toggleMode} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 hover:bg-white/10 hover:text-white">
          {mode === 'stocks' ? '📈 Stocks' : '📰 News'}
        </button>
        <button type="button" onClick={toggleEnabled} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 hover:bg-white/10 hover:text-white" title="Hide ticker">
          ✕
        </button>
      </div>
    </div>
  );
}
