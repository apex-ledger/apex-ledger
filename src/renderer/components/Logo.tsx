/**
 * The Apex Ledger mark: a squircle app-icon holding a north star above two ledger rules.
 *
 * Two deliberate departures from the old shield-with-"NL" badge. First, no letters inside the icon —
 * an app icon that spells its own initials reads as a placeholder, and the wordmark beside it is
 * already saying the name. Second, the colours are `rgb(var(--brand-*))` rather than fixed hex, so
 * the mark follows whichever of the five colour schemes is selected in Settings; the old one stayed
 * forest green no matter what the rest of the app did.
 */
function MarkIcon({ size = 40 }: { size?: number }) {
  const id = `nl-mark-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Apex Ledger">
      <defs>
        <linearGradient id={id} x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgb(var(--brand-600))" />
          <stop offset="1" stopColor="rgb(var(--brand-900))" />
        </linearGradient>
      </defs>

      {/* Squircle — a continuous-curvature rounded square, the shape every macOS/iOS icon sits in. */}
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill={`url(#${id})`} />
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" stroke="rgb(var(--gold-400))" strokeOpacity="0.55" strokeWidth="1" />

      {/* North star — four points, longer on the vertical, the way a compass rose points north. */}
      <path d="M20 7.5 L22.1 15.4 L28 17.5 L22.1 19.6 L20 27.5 L17.9 19.6 L12 17.5 L17.9 15.4 Z" fill="rgb(var(--gold-300))" />

      {/* Ledger rules, the shorter one under-hanging like a total line. */}
      <rect x="11" y="30" width="18" height="1.6" rx="0.8" fill="#fff" fillOpacity="0.85" />
      <rect x="11" y="33.4" width="11" height="1.6" rx="0.8" fill="#fff" fillOpacity="0.5" />
    </svg>
  );
}

interface LogoProps {
  size?: 'sm' | 'lg';
  showTagline?: boolean;
  /** 'light' (default) is for a light background — the sidebar's own bg-brand-50. 'dark' is for
   * the header's dark brand gradient, where the default dark-green-on-dark-green text was nearly
   * invisible regardless of which color scheme was active. */
  variant?: 'light' | 'dark';
}

export function Logo({ size = 'lg', showTagline = false, variant = 'light' }: LogoProps) {
  const iconSize = size === 'lg' ? 48 : 32;
  const isDark = variant === 'dark';
  return (
    <div className="flex items-center gap-3">
      <MarkIcon size={iconSize} />
      <div>
        {/* Tighter tracking at display size — the wordmark is the one place it reads as intentional
            rather than subliminal. */}
        <div className={`font-bold leading-tight tracking-[-0.02em] ${size === 'lg' ? 'text-xl' : 'text-lg'}`}>
          <span className={isDark ? 'text-brand-300' : 'text-brand-700'}>APEX</span>{' '}
          <span className={isDark ? 'text-gold-300' : 'text-gold-600'}>LEDGER</span>
        </div>
        <div
          className={`font-semibold uppercase tracking-wide ${isDark ? 'text-brand-100' : 'text-brand-700'} ${size === 'lg' ? 'text-xs' : 'text-[9px]'}`}
        >
          Canadian Accounting Software
        </div>
      </div>
    </div>
  );
}
