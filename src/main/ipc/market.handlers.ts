export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface MarketNewsItem {
  title: string;
  link: string;
}

/** A small default watchlist — the two most-watched index ETFs, a handful of widely recognized
 * large-caps, and two TSX names since this is a Canadian practice — not user-configurable yet,
 * just a sensible always-on view. */
// Index futures first, then the most liquid, heavily-optioned US names (high options volume), then
// two TSX names for the Canadian practice.
const DEFAULT_SYMBOLS = ['MES=F', 'MNQ=F', 'SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'NFLX', '^GSPTSE', 'SHOP.TO', 'RY.TO'];

const SYMBOL_LABELS: Record<string, string> = {
  // Micro E-mini index futures (CME) — quote the same index points as the full-size ES / NQ.
  'MES=F': 'S&P 500 Fut (MES)',
  'MNQ=F': 'Nasdaq Fut (MNQ)',
  SPY: 'S&P 500',
  QQQ: 'Nasdaq 100',
  AAPL: 'Apple',
  NVDA: 'Nvidia',
  MSFT: 'Microsoft',
  GOOGL: 'Google',
  AMZN: 'Amazon',
  META: 'Meta',
  TSLA: 'Tesla',
  AMD: 'AMD',
  NFLX: 'Netflix',
  '^GSPTSE': 'TSX',
  'SHOP.TO': 'Shopify',
  'RY.TO': 'RBC',
};

async function fetchOneQuote(symbol: string): Promise<MarketQuote | null> {
  try {
    // includePrePost=true adds pre-market / after-hours bars to the 1-minute series, so the last
    // traded close reflects the live price even before/after the regular session — the keyless v7
    // "quote" endpoint (which has a preMarketPrice field) now returns Unauthorized, so we derive it
    // from the chart series instead.
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?includePrePost=true&interval=1m&range=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: [{ meta?: Record<string, unknown>; indicators?: { quote?: [{ close?: (number | null)[] }] } }] };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;

    // Latest traded price, including extended hours: the last finite close in the series.
    let live: number | undefined;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (Array.isArray(closes)) {
      for (let i = closes.length - 1; i >= 0; i--) {
        const c = closes[i];
        if (typeof c === 'number' && Number.isFinite(c)) {
          live = c;
          break;
        }
      }
    }
    const price = live ?? (typeof meta?.regularMarketPrice === 'number' ? meta.regularMarketPrice : undefined);
    if (typeof price !== 'number') return null;

    // Change is measured against the prior regular-session close, so a pre-market move shows the
    // gap up/down from yesterday's close (what a trader expects to see pre-open).
    const prevClose =
      (typeof meta?.previousClose === 'number' ? meta.previousClose : undefined) ??
      (typeof meta?.chartPreviousClose === 'number' ? meta.chartPreviousClose : price);
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    return { symbol, name: SYMBOL_LABELS[symbol] ?? symbol, price, change, changePercent };
  } catch {
    return null;
  }
}

/** Best-effort — quotes come from an unofficial, keyless Yahoo Finance endpoint (no paid market
 * data subscription involved), fetched from the main process to avoid the renderer's CSP/CORS
 * restrictions. Individual symbol failures are dropped silently rather than failing the whole
 * strip; a totally offline machine just gets an empty list. */
export async function marketQuotes(): Promise<MarketQuote[]> {
  const settled = await Promise.allSettled(DEFAULT_SYMBOLS.map(fetchOneQuote));
  return settled.filter((r): r is PromiseFulfilledResult<MarketQuote> => r.status === 'fulfilled' && r.value !== null).map((r) => r.value as MarketQuote);
}

const HTML_ENTITIES: Record<string, string> = {
  '&apos;': "'",
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&#8217;': '’',
  '&#8216;': '‘',
  '&#8220;': '“',
  '&#8221;': '”',
  '&#8211;': '–',
  '&#8212;': '—',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#?\w+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

/** CNBC's public top-news RSS feed — parsed with plain regex rather than pulling in an XML
 * library, since RSS <item>/<title>/<link> is simple, well-formed markup. */
export async function marketNews(): Promise<MarketNewsItem[]> {
  try {
    const res = await fetch('https://www.cnbc.com/id/100003114/device/rss/rss.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: MarketNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) && items.length < 15) {
      const block = match[1];
      const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      const title = titleMatch?.[1]?.trim();
      if (title) items.push({ title: decodeHtmlEntities(title), link: linkMatch?.[1]?.trim() ?? '' });
    }
    return items;
  } catch {
    return [];
  }
}
