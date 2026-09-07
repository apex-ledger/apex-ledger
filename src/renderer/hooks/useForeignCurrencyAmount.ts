import { useState } from 'react';
import { convertForeignAmountToCadCents } from '@shared/domain/currency/convertForeignAmount';
import type { ForeignCurrencyCode } from '@shared/domain/types';

export type CurrencyChoice = 'CAD' | ForeignCurrencyCode;

/**
 * Owns the transaction currency toggle shared by Bills, Quick Entry, and Invoices. When a
 * foreign currency is selected, `cadAmountCents` is the live-computed CAD equivalent the parent
 * form should actually post — the raw foreign amount and rate travel alongside purely as
 * informational metadata (see JournalEntryLine.foreignCurrency in shared/domain/types.ts).
 */
export function useForeignCurrencyAmount() {
  const [currency, setCurrency] = useState<CurrencyChoice>('CAD');
  const [foreignAmountCents, setForeignAmountCents] = useState(0);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isForeign = currency !== 'CAD';
  const cadAmountCents = isForeign && exchangeRate !== null ? convertForeignAmountToCadCents(foreignAmountCents, exchangeRate) : null;

  async function fetchRate() {
    setFetching(true);
    setFetchError(null);
    if (currency === 'CAD') return;
    const result = await window.api.fxRates.getLatest(currency);
    setFetching(false);
    if (!result.ok) return setFetchError(result.error);
    setExchangeRate(result.data.rate);
    setRateDate(result.data.date);
  }

  function reset() {
    setCurrency('CAD');
    setForeignAmountCents(0);
    setExchangeRate(null);
    setRateDate(null);
    setFetchError(null);
  }

  return {
    currency,
    setCurrency,
    foreignAmountCents,
    setForeignAmountCents,
    exchangeRate,
    setExchangeRate,
    rateDate,
    fetching,
    fetchError,
    isForeign,
    cadAmountCents,
    fetchRate,
    reset,
  };
}

export type ForeignCurrencyAmountState = ReturnType<typeof useForeignCurrencyAmount>;
