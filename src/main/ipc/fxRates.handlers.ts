import { FOREIGN_CURRENCY_CODES, type ForeignCurrencyCode } from '@shared/domain/types';

interface BocObservation {
  d: string;
  [series: string]: string | { v: string } | undefined;
}

interface BocResponse {
  observations: BocObservation[];
}

/** Fetches today's (or most recent business day's) foreign/CAD rate from the Bank of Canada's Valet
 * API — the rate CRA expects for converting foreign-currency source documents into CAD books.
 * Manual entry remains available in the UI as a fallback when this fails (offline, API down, or
 * the accountant wants a specific contract rate instead). */
export async function fxRatesGetLatest(currency: ForeignCurrencyCode): Promise<{ rate: number; date: string }> {
  if (!(FOREIGN_CURRENCY_CODES as readonly string[]).includes(currency)) throw new Error('Unsupported foreign currency.');
  const series = `FX${currency}CAD`;
  const response = await fetch(`https://www.bankofcanada.ca/valet/observations/${series}/json?recent=1`);
  if (!response.ok) {
    throw new Error(`Bank of Canada API returned ${response.status}. Enter the exchange rate manually instead.`);
  }

  const data = (await response.json()) as BocResponse;
  const observation = data.observations?.[0];
  const seriesValue = observation?.[series];
  const rateText = typeof seriesValue === 'object' ? seriesValue.v : undefined;
  if (!observation || !rateText) {
    throw new Error(`No recent ${currency}/CAD rate available from the Bank of Canada. Enter the exchange rate manually instead.`);
  }

  const rate = Number(rateText);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Received an invalid rate from the Bank of Canada. Enter the exchange rate manually instead.');
  }

  return { rate, date: observation.d };
}

/** The Bank of Canada rate on (or the last business day before) a given date — the rate a
 * payment converted at when the bank statement isn't to hand yet. Same series, same fallback to
 * manual entry when the API is unreachable. */
export async function fxRatesGetOnDate(currency: ForeignCurrencyCode, date: string): Promise<{ rate: number; date: string }> {
  if (!(FOREIGN_CURRENCY_CODES as readonly string[]).includes(currency)) throw new Error('Unsupported foreign currency.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A YYYY-MM-DD date is required.');
  const series = `FX${currency}CAD`;
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 10);
  const startDate = from.toISOString().slice(0, 10);
  const response = await fetch(`https://www.bankofcanada.ca/valet/observations/${series}/json?start_date=${startDate}&end_date=${date}`);
  if (!response.ok) throw new Error(`Bank of Canada API returned ${response.status}. Enter the exchange rate manually instead.`);
  const data = (await response.json()) as BocResponse;
  const observation = [...(data.observations ?? [])].reverse().find((row) => typeof row[series] === 'object');
  const seriesValue = observation?.[series];
  const rateText = typeof seriesValue === 'object' ? seriesValue.v : undefined;
  if (!observation || !rateText) throw new Error(`No ${currency}/CAD rate available from the Bank of Canada around ${date}. Enter the exchange rate manually instead.`);
  const rate = Number(rateText);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Received an invalid rate from the Bank of Canada. Enter the exchange rate manually instead.');
  return { rate, date: observation.d };
}
