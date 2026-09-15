import { useMemo, useState } from 'react';
import { buildChartSeries, numericColumns, type ChartPoint } from '@shared/domain/reporting/chartSeries';

export type ChartKind = 'none' | 'bars' | 'horizontal' | 'pie';

/** A categorical palette, written out in full so Tailwind's scanner is irrelevant — these are SVG
 * fills, not classes. Ordered so neighbouring slices never sit on the same hue. */
const COLORS = ['#1c633c', '#dfa931', '#2f6f9f', '#a4543a', '#6a5a9c', '#3f8f7a', '#b8863b', '#4d6d8f', '#8a4f6d', '#5c7f3f', '#9c6b3f', '#41707a'];

function money(value: number): string {
  return value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Charts the report already on screen: the same rows, read the same way the export reads them,
 * so the picture and the table can never disagree. Shown above the sheet, never instead of it —
 * the numbers stay the record and the chart is the glance. */
export function ReportChart({ rows, kind }: { rows: string[][]; kind: ChartKind }) {
  const numeric = useMemo(() => numericColumns(rows), [rows]);
  const [valueColumn, setValueColumn] = useState<number | null>(null);
  const column = valueColumn !== null && numeric.includes(valueColumn) ? valueColumn : numeric[0] ?? 0;
  const series = useMemo(() => buildChartSeries(rows, column), [rows, column]);

  if (kind === 'none') return null;
  if (!series) {
    return (
      <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500" data-export-skip>
        Nothing to chart here — this report has no column of figures with named rows behind it.
      </div>
    );
  }

  const header = rows[0] ?? [];
  return (
    <div className="rounded border border-gray-200 bg-white p-3" data-export-skip data-testid="report-chart">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="font-semibold text-gray-800">{series.valueColumnLabel}</span>
        {numeric.length > 1 && (
          <label className="flex items-center gap-1">
            Chart column
            <select value={column} onChange={(e) => setValueColumn(Number(e.target.value))} className="rounded border border-gray-300 bg-white px-1.5 py-0.5">
              {numeric.map((c) => (
                <option key={c} value={c}>{(header[c] ?? `Column ${c + 1}`).trim() || `Column ${c + 1}`}</option>
              ))}
            </select>
          </label>
        )}
        {series.otherCount > 0 && <span className="text-gray-400">smallest {series.otherCount} grouped as Other</span>}
      </div>
      {kind === 'bars' && <VerticalBars points={series.points} />}
      {kind === 'horizontal' && <HorizontalBars points={series.points} />}
      {kind === 'pie' && <Pie points={series.points} />}
    </div>
  );
}

/** Bars are measured from zero — the one rule that makes a bar chart honest, and the reason the
 * axis is not scaled to the smallest value to "use the space". A report that mixes signs gets a
 * zero line in the middle rather than negatives drawn as though they were positive. */
function VerticalBars({ points }: { points: ChartPoint[] }) {
  const width = 720;
  const height = 260;
  const padding = { top: 12, right: 8, bottom: 56, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const zeroY = padding.top + (max / span) * plotHeight;
  const slot = plotWidth / points.length;
  const barWidth = Math.min(48, slot * 0.7);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="Bar chart of the report">
      <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#9ca3af" strokeWidth="1" />
      <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" fontSize="10" fill="#6b7280">{money(max)}</text>
      {min < 0 && <text x={padding.left - 8} y={height - padding.bottom} textAnchor="end" fontSize="10" fill="#6b7280">{money(min)}</text>}
      {points.map((point, i) => {
        const barHeight = (Math.abs(point.value) / span) * plotHeight;
        const x = padding.left + i * slot + (slot - barWidth) / 2;
        const y = point.value >= 0 ? zeroY - barHeight : zeroY;
        return (
          <g key={`${point.label}-${i}`}>
            <rect x={x} y={y} width={barWidth} height={Math.max(1, barHeight)} fill={COLORS[i % COLORS.length]} rx="2">
              <title>{`${point.label}: ${money(point.value)}`}</title>
            </rect>
            <text x={x + barWidth / 2} y={height - padding.bottom + 12} textAnchor="end" fontSize="9" fill="#4b5563" transform={`rotate(-35 ${x + barWidth / 2} ${height - padding.bottom + 12})`}>
              {point.label.length > 22 ? `${point.label.slice(0, 21)}…` : point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function HorizontalBars({ points }: { points: ChartPoint[] }) {
  const width = 720;
  const rowHeight = 22;
  const height = points.length * rowHeight + 16;
  const labelWidth = 170;
  const valueWidth = 90;
  const plotWidth = width - labelWidth - valueWidth - 16;
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const zeroX = labelWidth + (-min / span) * plotWidth;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Horizontal bar chart of the report">
      <line x1={zeroX} y1={4} x2={zeroX} y2={height - 8} stroke="#9ca3af" strokeWidth="1" />
      {points.map((point, i) => {
        const barLength = (Math.abs(point.value) / span) * plotWidth;
        const y = 8 + i * rowHeight;
        const x = point.value >= 0 ? zeroX : zeroX - barLength;
        return (
          <g key={`${point.label}-${i}`}>
            <text x={labelWidth - 8} y={y + rowHeight / 2} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#374151">
              {point.label.length > 26 ? `${point.label.slice(0, 25)}…` : point.label}
            </text>
            <rect x={x} y={y + 3} width={Math.max(1, barLength)} height={rowHeight - 10} fill={COLORS[i % COLORS.length]} rx="2">
              <title>{`${point.label}: ${money(point.value)}`}</title>
            </rect>
            <text x={width - 8} y={y + rowHeight / 2} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#4b5563" className="tabular-nums">
              {money(point.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Shares of a whole, so it only makes sense when everything points the same way: a pie containing
 * both a positive and a negative has no whole to take shares of. That case falls back to the
 * horizontal bars rather than drawing a shape that means nothing. */
function Pie({ points }: { points: ChartPoint[] }) {
  const mixed = points.some((p) => p.value > 0) && points.some((p) => p.value < 0);
  if (mixed) {
    return (
      <>
        <p className="mb-2 text-xs text-amber-800">These figures run both ways, so there is no whole for a pie to divide — shown as bars instead.</p>
        <HorizontalBars points={points} />
      </>
    );
  }

  const total = points.reduce((sum, p) => sum + Math.abs(p.value), 0);
  if (total === 0) return null;
  const size = 240;
  const radius = 100;
  const centre = size / 2;
  let angle = -Math.PI / 2; // start at twelve o'clock, the way a pie is read

  const slices = points.map((point, i) => {
    const share = Math.abs(point.value) / total;
    const sweep = share * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const x1 = centre + radius * Math.cos(start);
    const y1 = centre + radius * Math.sin(start);
    const x2 = centre + radius * Math.cos(end);
    const y2 = centre + radius * Math.sin(end);
    // A slice larger than half the circle needs the large-arc flag, or it draws inside out.
    const largeArc = sweep > Math.PI ? 1 : 0;
    const path = points.length === 1
      ? `M ${centre} ${centre - radius} A ${radius} ${radius} 0 1 1 ${centre - 0.01} ${centre - radius} Z`
      : `M ${centre} ${centre} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { point, path, share, color: COLORS[i % COLORS.length] };
  });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-60 w-60 flex-shrink-0" role="img" aria-label="Pie chart of the report">
        {slices.map(({ point, path, color }, i) => (
          <path key={`${point.label}-${i}`} d={path} fill={color} stroke="#fff" strokeWidth="1">
            <title>{`${point.label}: ${money(point.value)}`}</title>
          </path>
        ))}
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5 text-xs">
        {slices.map(({ point, share, color }, i) => (
          <li key={`${point.label}-${i}`} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
            <span className="min-w-0 flex-1 truncate text-gray-700">{point.label}</span>
            <span className="tabular-nums text-gray-500">{money(point.value)}</span>
            <span className="w-12 text-right tabular-nums text-gray-400">{(share * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
