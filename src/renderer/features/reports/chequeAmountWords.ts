const SMALL = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(value: number): string {
  const parts: string[] = [];
  let remaining = value;
  if (remaining >= 100) {
    parts.push(`${SMALL[Math.floor(remaining / 100)]} Hundred`);
    remaining %= 100;
  }
  if (remaining >= 20) {
    const ones = remaining % 10;
    parts.push(ones ? `${TENS[Math.floor(remaining / 10)]}-${SMALL[ones]}` : TENS[Math.floor(remaining / 10)]);
  } else if (remaining > 0) {
    parts.push(SMALL[remaining]);
  }
  return parts.join(' ');
}

/** Converts cheque cents to the conventional written Canadian-dollar line. */
export function chequeAmountWords(cents: number): string {
  const safeCents = Math.max(0, Math.round(cents));
  let dollars = Math.floor(safeCents / 100);
  const groups: Array<[number, string]> = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
  ];
  const parts: string[] = [];
  for (const [size, label] of groups) {
    if (dollars >= size) {
      parts.push(`${belowThousand(Math.floor(dollars / size))} ${label}`);
      dollars %= size;
    }
  }
  if (dollars > 0) parts.push(belowThousand(dollars));
  else if (parts.length === 0) parts.push('Zero');
  const fractional = String(safeCents % 100).padStart(2, '0');
  return `${parts.join(' ')} and ${fractional}/100 Dollars`;
}
