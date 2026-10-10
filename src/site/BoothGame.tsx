import { useMemo, useState } from 'react';

/* The hero is a tiny pricing game: you run the club's candy stall and pick a
   price. Demand falls as the price rises, so profit peaks in the middle.
   Numbers are in thousands of VND. */

const COST = 8; // what one bag costs us
const MIN = 5;
const MAX = 50;
const START = 40;
const demandExact = (p: number) => 160 * Math.exp(-p / 12);
const demand = (p: number) => Math.round(demandExact(p));
const profitAt = (p: number) => (p - COST) * demand(p);
const BEST = (() => {
  let best = MIN;
  for (let p = MIN; p <= MAX; p++) if (profitAt(p) > profitAt(best)) best = p;
  return best;
})();
const BEST_PROFIT = profitAt(BEST);
const SLOTS = 16;

function money(k: number) {
  const sign = k < 0 ? '−' : '';
  const a = Math.abs(k);
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(a >= 10000 ? 0 : 2).replace(/\.?0+$/, '')}M ₫`;
  return `${sign}${a.toLocaleString('en-US')}k ₫`;
}

function verdict(p: number, tries: number) {
  const q = demand(p);
  const pr = profitAt(p);
  if (pr < 0) return `You're paying people to take candy. ${q} bags gone, money lost.`;
  if (Math.abs(p - BEST) <= 2) return 'That is about where we priced it. You would fit in here.';
  if (p < BEST) return q > 60 ? 'Huge queue, tiny margin. Everyone loves you, the treasurer does not.' : 'More sales, thin margin. Try a bit higher.';
  if (q <= 4) return 'Great margin, nobody buying. The stall is very quiet.';
  return tries < 3 ? 'Decent. Keep moving the price and watch the profit.' : 'Fewer buyers than you would like. Try a bit lower.';
}

const TONES = ['#0a0a0a', '#1f3dff', '#8fa0ff', '#55575d', '#1f3dff', '#0a0a0a', '#c9ceff', '#1f3dff'];

export function BoothGame() {
  const [price, setPrice] = useState(START);
  const [tried, setTried] = useState<number[]>([START]);
  const q = demand(price);
  const revenue = price * q;
  const cost = COST * q;
  const profit = revenue - cost;
  const found = tried.some((p) => Math.abs(p - BEST) <= 2);
  const shown = Math.min(SLOTS, Math.round(q / 3));

  const set = (p: number) => {
    setPrice(p);
    setTried((t) => (t.includes(p) ? t : [...t, p]));
  };

  // mini chart geometry
  const W = 280;
  const H = 72;
  const x = (p: number) => ((p - MIN) / (MAX - MIN)) * W;
  const lo = profitAt(MIN);
  const y = (v: number) => H - ((v - lo) / (BEST_PROFIT - lo)) * (H - 8) - 4;
  const curve = useMemo(() => {
    let d = '';
    for (let p = MIN; p <= MAX; p += 0.5) d += `${d ? 'L' : 'M'}${x(p).toFixed(1)} ${y((p - COST) * demandExact(p)).toFixed(1)}`;
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game">
      <div className="stall-wrap">
        <svg className="stall" viewBox="0 0 600 340" role="img" aria-label={`The candy stall. ${q} students buy at ${price} thousand dong a bag.`}>
          {/* sky doodles */}
          <path d="M360 70 q6 -18 24 -12 q10 -16 28 -4 q18 -2 16 16 q4 14 -14 14 h-48 q-14 0 -6 -14 z" className="st-cloud" />
          <path d="M470 120 q5 -12 18 -8 q8 -11 20 -2 q13 -1 11 11 q3 10 -10 10 h-34 q-10 0 -5 -11 z" className="st-cloud" />
          <circle cx="545" cy="46" r="16" className="st-sun" />
          {/* ground */}
          <path d="M0 318 H600" className="st-ground" />
          {/* posts */}
          <rect x="34" y="70" width="8" height="248" className="st-post" />
          <rect x="250" y="70" width="8" height="248" className="st-post" />
          {/* awning */}
          <path d="M22 70 L270 70 L282 112 L10 112 Z" className="st-awning" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${22 + i * 41.3} 70 L${22 + (i + 0.5) * 41.3} 70 L${10 + (i + 0.5) * 45.3} 112 L${10 + i * 45.3} 112 Z`} className="st-stripe" />
          ))}
          <path d="M10 112 q22.6 22 45.3 0 q22.6 22 45.3 0 q22.6 22 45.3 0 q22.6 22 45.3 0 q22.6 22 45.3 0 q22.6 22 45.3 0" className="st-scallop" />
          {/* sign */}
          <rect x="86" y="24" width="112" height="40" rx="6" className="st-sign" />
          <text x="142" y="52" textAnchor="middle" className="st-sign-text">
            candy!
          </text>
          {/* table */}
          <rect x="20" y="214" width="250" height="18" rx="3" className="st-top" />
          <path d="M26 232 H264 V318 H26 Z" className="st-cloth" />
          <path d="M60 232 V318 M110 232 V318 M160 232 V318 M210 232 V318" className="st-fold" />
          {/* candy bags */}
          {[48, 92, 136, 180, 224].map((bx, i) => (
            <g key={bx} transform={`translate(${bx} ${i % 2 ? 176 : 172})`}>
              <path d="M0 40 L4 6 L14 0 L24 6 L28 40 Z" className="st-bag" />
              <circle cx="10" cy="24" r="4" className={`st-sweet s${i % 3}`} />
              <circle cx="18" cy="30" r="3.5" className={`st-sweet s${(i + 1) % 3}`} />
              <path d="M6 7 Q14 12 22 7" className="st-tie" />
            </g>
          ))}
          {/* price tag */}
          <g className="st-tag" transform="translate(196 132) rotate(8)">
            <path d="M0 0 H70 L84 18 L70 36 H0 Z" className="st-tag-card" />
            <circle cx="72" cy="18" r="3.5" className="st-tag-hole" />
            <text x="34" y="27" textAnchor="middle" className="st-tag-text">
              {price}k
            </text>
          </g>
          {/* queue */}
          {Array.from({ length: SLOTS }, (_, i) => {
            const row = i % 2;
            const col = Math.floor(i / 2);
            const px = 300 + col * 36 + (row ? 18 : 0);
            const py = row ? 300 : 318;
            const on = i < shown;
            return (
              <g key={i} className={`st-kid ${on ? 'on' : ''} ${row ? 'back' : ''}`} style={{ transitionDelay: `${(on ? i : SLOTS - i) * 18}ms`, ['--tx' as string]: `${px}px`, ['--ty' as string]: `${py}px` }}>
                <circle cx="0" cy="-58" r="10" fill={TONES[i % TONES.length]} />
                <path d="M-13 0 V-30 a13 13 0 0 1 26 0 V0 Z" fill={TONES[(i + 3) % TONES.length]} />
              </g>
            );
          })}
        </svg>
        <p className="hand stall-count" aria-live="polite">
          {q === 0 ? 'nobody...' : `${q} ${q === 1 ? 'bag' : 'bags'} sold this lunch`}
        </p>
      </div>

      <div className="till">
        <div className="till-head">
          <span>Price per bag</span>
          <strong>{price},000 ₫</strong>
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={1}
          value={price}
          onChange={(e) => set(+e.target.value)}
          className="till-range"
          aria-label="Price per bag, in thousands of dong"
          aria-valuetext={`${price},000 dong`}
          style={{ ['--pct' as string]: `${((price - MIN) / (MAX - MIN)) * 100}%` }}
        />
        <div className="till-scale" aria-hidden="true">
          <span>5k</span>
          <span>50k</span>
        </div>
        <dl className="till-rows">
          <div>
            <dt>Bags sold</dt>
            <dd>{q}</dd>
          </div>
          <div>
            <dt>Money in</dt>
            <dd>{money(revenue)}</dd>
          </div>
          <div>
            <dt>Candy cost us</dt>
            <dd>{money(-cost)}</dd>
          </div>
          <div className="till-total">
            <dt>Profit</dt>
            <dd className={profit < 0 ? 'neg' : found && Math.abs(price - BEST) <= 2 ? 'best' : ''}>{money(profit)}</dd>
          </div>
        </dl>
        <svg className="till-chart" viewBox={`-6 -6 ${W + 12} ${H + 12}`} aria-hidden="true">
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="tc-zero" />
          {found && <path d={curve} className="tc-curve" />}
          {tried.map((p) => (
            <circle key={p} cx={x(p)} cy={y(profitAt(p))} r="3" className="tc-dot" />
          ))}
          <circle cx={x(price)} cy={y(profit)} r="6" className="tc-now" />
        </svg>
        <p className="till-note" aria-live="polite">
          {verdict(price, tried.length)}
        </p>
      </div>
    </div>
  );
}
