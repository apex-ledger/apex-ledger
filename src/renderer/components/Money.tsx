export function formatCents(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const formatted = dollars.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cents < 0 ? `(${formatted})` : formatted;
}

export function Money({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${cents < 0 ? 'text-red-600' : ''} ${className}`}>{formatCents(cents)}</span>;
}
