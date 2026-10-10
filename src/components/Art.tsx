import { useId, useMemo } from 'react';

/* ---------------------------------------------------------------
   Hand-drawn SVG for the club: logo, hero market chart, activity
   pictograms and empty-state illustrations. All decorative art is
   aria-hidden or labelled, and never takes pointer events.
---------------------------------------------------------------- */

export function LogoMark({ size = 36, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} className="logo-mark">
      <rect width="40" height="40" rx="11" fill="var(--logo-bg, #0a1633)" />
      <rect x="9" y="22" width="5.5" height="9" rx="1.6" fill="#fff" opacity="0.55" />
      <rect x="17.25" y="16" width="5.5" height="15" rx="1.6" fill="#fff" opacity="0.8" />
      <rect x="25.5" y="11" width="5.5" height="20" rx="1.6" fill="#fff" />
      <circle cx="28.25" cy="6.6" r="2.6" fill="#8db8ff" />
    </svg>
  );
}

/** Seeded random so the chart looks the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface ChartFlag {
  label: string;
  sub?: string;
}

/**
 * The hero's market chart: a rising line drawn in once, candlesticks behind it,
 * and a flag on the latest point naming what the club is doing next.
 */
export function HeroChart({ flag, seed = 7 }: { flag?: ChartFlag; seed?: number }) {
  const id = useId().replace(/:/g, '');
  const W = 1440;
  const H = 400;
  const { line, area, candles, last, mid } = useMemo(() => {
    const r = rng(seed);
    const n = 30;
    const pts: [number, number][] = [];
    let y = H * 0.78;
    for (let i = 0; i < n; i++) {
      const x = (W / (n - 1)) * i;
      const drift = -H * 0.021;
      const noise = (r() - 0.45) * H * 0.06;
      y = Math.max(H * 0.16, Math.min(H * 0.9, y + drift + noise));
      pts.push([x, y]);
    }
    const toPath = (p: [number, number][]) =>
      p.reduce((d, [x, yy], i) => {
        if (i === 0) return `M${x.toFixed(1)},${yy.toFixed(1)}`;
        const [px, py] = p[i - 1];
        const cx = (px + x) / 2;
        return `${d} C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${yy.toFixed(1)} ${x.toFixed(1)},${yy.toFixed(1)}`;
      }, '');
    const linePath = toPath(pts);
    const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
    const cs = pts.slice(1).map(([x, yy], i) => {
      const prev = pts[i][1];
      const open = prev;
      const close = yy;
      const hi = Math.min(open, close) - 8 - r() * 22;
      const lo = Math.max(open, close) + 8 + r() * 22;
      return { x: x - W / (n - 1) / 2, open, close, hi, lo, up: close < open };
    });
    return { line: linePath, area: areaPath, candles: cs, last: pts[pts.length - 6], mid: pts };
  }, [seed]);
  void mid;

  return (
    <svg className="hero-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8db8ff" stopOpacity="0.34" />
          <stop offset="0.55" stopColor="#8db8ff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#8db8ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={`m-${id}`}>
          <rect width={W} height={H} fill={`url(#fade-${id})`} />
        </mask>
      </defs>
      <g className="hc-grid">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} />
        ))}
      </g>
      <g mask={`url(#m-${id})`}>
        <g className="hc-candles">
          {candles.map((c, i) => (
            <g key={i} className={c.up ? 'up' : 'down'} style={{ ['--i' as string]: i }}>
              <line x1={c.x} x2={c.x} y1={c.hi} y2={c.lo} />
              <rect x={c.x - 7} y={Math.min(c.open, c.close)} width="14" height={Math.max(4, Math.abs(c.close - c.open))} rx="2" />
            </g>
          ))}
        </g>
        <path className="hc-area" d={area} fill={`url(#fill-${id})`} />
        <path className="hc-line" d={line} pathLength={1} />
      </g>
      <g className="hc-flag" transform={`translate(${last[0]} ${last[1]})`}>
        <circle className="hc-pulse" r="16" />
        <circle className="hc-dot" r="7" />
        {flag && (
          <g transform="translate(-14 -112)">
            <line x1="14" x2="14" y1="62" y2="104" className="hc-pole" />
            <rect className="hc-tag" x="-196" y="0" width="236" height="62" rx="12" />
            <text className="hc-tag-sub" x="-178" y="25">
              {flag.sub ?? 'Next up'}
            </text>
            <text className="hc-tag-title" x="-178" y="47">
              {flag.label.length > 22 ? flag.label.slice(0, 21) + '…' : flag.label}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

/* ---------- activity pictograms (64×64, two-tone) ---------- */

type IconProps = { size?: number };
const P = ({ size = 64, children }: IconProps & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="pictogram">
    {children}
  </svg>
);

export const Pictograms: Record<string, (p: IconProps) => JSX.Element> = {
  pitch: (p) => (
    <P {...p}>
      <rect x="10" y="40" width="44" height="14" rx="3" className="pg-fill" />
      <path d="M22 40V30a10 10 0 0 1 20 0v10" className="pg-line" />
      <circle cx="32" cy="18" r="7" className="pg-accent" />
      <path d="M32 25v5M26 47h12" className="pg-line" />
      <path d="M45 13l5-4M48 21h6M45 28l5 4" className="pg-line pg-accent-stroke" />
    </P>
  ),
  workshop: (p) => (
    <P {...p}>
      <rect x="8" y="10" width="48" height="32" rx="4" className="pg-fill" />
      <path d="M16 34l9-9 7 6 14-13" className="pg-line pg-accent-stroke" />
      <circle cx="46" cy="18" r="3" className="pg-accent" />
      <path d="M22 42l-6 14M42 42l6 14M32 42v8" className="pg-line" />
    </P>
  ),
  talks: (p) => (
    <P {...p}>
      <path d="M8 14a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H22l-8 7v-7a6 6 0 0 1-6-6z" className="pg-fill" />
      <path d="M26 30h24a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6v6l-7-6H26a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6z" className="pg-accent" />
      <path d="M16 17h20M16 23h12" className="pg-line" />
    </P>
  ),
  ventures: (p) => (
    <P {...p}>
      <rect x="12" y="28" width="40" height="26" rx="2" className="pg-fill" />
      <path d="M8 18l6-10h36l6 10v4a6 6 0 0 1-12 0 6 6 0 0 1-12 0 6 6 0 0 1-12 0 6 6 0 0 1-12 0z" className="pg-accent" />
      <rect x="26" y="38" width="12" height="16" rx="1.5" className="pg-line" />
      <path d="M8 54h48" className="pg-line" />
    </P>
  ),
  competitions: (p) => (
    <P {...p}>
      <path d="M20 8h24v14a12 12 0 0 1-24 0z" className="pg-accent" />
      <path d="M20 12h-8v4a8 8 0 0 0 8 8M44 12h8v4a8 8 0 0 1-8 8" className="pg-line" />
      <path d="M32 34v10" className="pg-line" />
      <rect x="20" y="44" width="24" height="10" rx="2" className="pg-fill" />
    </P>
  ),
  community: (p) => (
    <P {...p}>
      <circle cx="22" cy="22" r="8" className="pg-fill" />
      <circle cx="42" cy="22" r="8" className="pg-accent" />
      <path d="M8 52a14 14 0 0 1 28 0M28 52a14 14 0 0 1 28 0" className="pg-line" />
    </P>
  ),
};
export const PICTOGRAM_KEYS = Object.keys(Pictograms);

/* ---------- avatars ---------- */

const AVATAR_TONES = ['#2350E6', '#0A1633', '#3B6FD9', '#1B4DB5', '#4B5FA8', '#0E6BA8', '#2F4F9E'];
export function toneFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/* ---------- empty-state illustrations ---------- */

const E = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg className="empty-art" width="132" height="96" viewBox="0 0 132 96" role="img" aria-label={label}>
    {children}
  </svg>
);

export const EmptyArt = {
  board: () => (
    <E label="Empty project board">
      <rect x="6" y="14" width="36" height="72" rx="6" className="ea-col" />
      <rect x="48" y="14" width="36" height="72" rx="6" className="ea-col" />
      <rect x="90" y="14" width="36" height="72" rx="6" className="ea-col" />
      <rect x="12" y="22" width="24" height="16" rx="3" className="ea-card" />
      <rect x="54" y="22" width="24" height="16" rx="3" className="ea-card ea-hi" />
      <rect x="54" y="42" width="24" height="12" rx="3" className="ea-card" />
      <path d="M100 30h16M108 22v16" className="ea-plus" />
    </E>
  ),
  tasks: () => (
    <E label="Empty task list">
      <rect x="22" y="8" width="88" height="80" rx="8" className="ea-col" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(34 ${24 + i * 20})`}>
          <rect width="12" height="12" rx="3" className={i === 0 ? 'ea-check-on' : 'ea-card'} />
          {i === 0 && <path d="M3 6l2.5 2.5L9 4" className="ea-tick" />}
          <rect x="20" y="3" width={i === 1 ? 44 : 52} height="6" rx="3" className="ea-bar" />
        </g>
      ))}
    </E>
  ),
  notes: () => (
    <E label="Empty notebook">
      <rect x="30" y="8" width="72" height="80" rx="6" className="ea-col" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx="30" cy={20 + i * 15} r="4" className="ea-ring" />
      ))}
      <rect x="44" y="22" width="44" height="6" rx="3" className="ea-bar ea-hi-fill" />
      <rect x="44" y="36" width="36" height="5" rx="2.5" className="ea-bar" />
      <rect x="44" y="48" width="40" height="5" rx="2.5" className="ea-bar" />
      <rect x="44" y="60" width="28" height="5" rx="2.5" className="ea-bar" />
    </E>
  ),
  money: () => (
    <E label="Empty ledger">
      <ellipse cx="46" cy="76" rx="22" ry="7" className="ea-coin" />
      <rect x="24" y="58" width="44" height="18" className="ea-coin-side" />
      <ellipse cx="46" cy="58" rx="22" ry="7" className="ea-coin" />
      <ellipse cx="46" cy="48" rx="22" ry="7" className="ea-coin ea-hi" />
      <path d="M78 70l12-16 10 8 18-26" className="ea-trend" />
      <circle cx="118" cy="36" r="4" className="ea-dot" />
    </E>
  ),
  people: () => (
    <E label="No people yet">
      <circle cx="46" cy="38" r="14" className="ea-card" />
      <circle cx="86" cy="38" r="14" className="ea-card ea-hi" />
      <path d="M22 84a24 24 0 0 1 48 0M62 84a24 24 0 0 1 48 0" className="ea-line" />
    </E>
  ),
  ticket: () => (
    <E label="No event announced">
      <path d="M10 22h112v16a10 10 0 0 0 0 20v16H10V58a10 10 0 0 0 0-20z" className="ea-col" />
      <path d="M44 26v44" className="ea-perf" />
      <rect x="18" y="38" width="18" height="20" rx="3" className="ea-card ea-hi" />
      <rect x="54" y="36" width="52" height="7" rx="3.5" className="ea-bar" />
      <rect x="54" y="50" width="36" height="6" rx="3" className="ea-bar" />
    </E>
  ),
};
