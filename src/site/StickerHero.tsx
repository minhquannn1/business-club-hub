import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { PublicProject } from '../lib/types';
import { fmtDate } from '../lib/format';
import { Star } from './Doodles';

/* Hero: the club name set huge, covered in stickers like a laptop lid.
   Stickers can be dragged around; they are decoration, so screen readers
   skip them and get the plain heading and links instead. */

interface StickerDef {
  id: string;
  /** position as % of the board, and tilt in degrees */
  x: number;
  y: number;
  r: number;
  node: ReactNode;
  className?: string;
}

function CandyBag() {
  return (
    <svg viewBox="0 0 90 110" width="96" height="118" aria-hidden="true">
      <path d="M14 104 L20 26 L45 12 L70 26 L76 104 Z" fill="#fff" stroke="#0a0a0a" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M24 28 Q45 40 66 28" fill="none" stroke="#1f3dff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="36" cy="62" r="8" fill="#1f3dff" />
      <circle cx="54" cy="74" r="7" fill="#0a0a0a" />
      <circle cx="44" cy="88" r="6" fill="#8fa0ff" />
      <circle cx="58" cy="52" r="5" fill="#8fa0ff" />
    </svg>
  );
}

export function StickerHero({ clubName, kicker, next }: { clubName: string; kicker: string; next?: PublicProject }) {
  const board = useRef<HTMLDivElement>(null);
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number; z: number }>>({});
  const [moved, setMoved] = useState(false);
  const top = useRef(10);
  const drag = useRef<{ id: string; sx: number; sy: number; dx: number; dy: number; el: HTMLElement } | null>(null);

  const stickers: StickerDef[] = [
    { id: 'logo', x: 22, y: 6, r: 6, className: 'sk-round', node: <img src="/club-logo.webp" alt="" width={190} height={190} draggable={false} /> },
    { id: 'run', x: 2, y: 4, r: -8, className: 'sk-black', node: <>100% student run</> },
    {
      id: 'bag',
      x: 8,
      y: 52,
      r: -9,
      className: 'sk-plain',
      node: (
        <span className="sk-bag">
          <CandyBag />
          <span className="sk-tag hand">20k</span>
        </span>
      ),
    },
    { id: 'pitch', x: 64, y: 44, r: 7, className: 'sk-bubble', node: <span className="hand">pitch it!</span> },
    { id: 'star', x: 74, y: 8, r: 14, className: 'sk-star', node: <Star /> },
    {
      id: 'list',
      x: 42,
      y: 66,
      r: 3,
      className: 'sk-note',
      node: (
        <span className="hand">
          <s>Halloween booth</s>
          <s>Christmas booth</s>
          <span>next one?</span>
        </span>
      ),
    },
  ];

  const onDown = (id: string) => (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const o = offsets[id] ?? { dx: 0, dy: 0, z: 0 };
    top.current += 1;
    el.style.zIndex = String(top.current);
    el.classList.add('lifted');
    drag.current = { id, sx: e.clientX, sy: e.clientY, dx: o.dx, dy: o.dy, el };
  };
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const b = board.current?.getBoundingClientRect();
    let dx = d.dx + e.clientX - d.sx;
    let dy = d.dy + e.clientY - d.sy;
    if (b) {
      // keep at least part of the sticker on the board
      const r = d.el.getBoundingClientRect();
      const baseL = r.left - (parseFloat(d.el.dataset.dx || '0') || 0);
      const baseT = r.top - (parseFloat(d.el.dataset.dy || '0') || 0);
      dx = Math.min(Math.max(dx, b.left - baseL - r.width / 2), b.right - baseL - r.width / 2);
      dy = Math.min(Math.max(dy, b.top - baseT - r.height / 2), b.bottom - baseT - r.height / 2);
    }
    d.el.dataset.dx = String(dx);
    d.el.dataset.dy = String(dy);
    d.el.style.setProperty('--dx', `${dx}px`);
    d.el.style.setProperty('--dy', `${dy}px`);
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    d.el.classList.remove('lifted');
    const dx = parseFloat(d.el.dataset.dx || '0');
    const dy = parseFloat(d.el.dataset.dy || '0');
    setOffsets((o) => ({ ...o, [d.id]: { dx, dy, z: top.current } }));
    if (Math.abs(dx - d.dx) + Math.abs(dy - d.dy) > 6) setMoved(true);
    drag.current = null;
  };

  return (
    <section className="hero sticker-hero" aria-labelledby="hero-title">
      <div className="site-wrap hero-grid">
        <div className="hero-copy">
          <p className="hero-kicker">{kicker}</p>
          <h1 id="hero-title" className="board-name">
            {clubName}
          </h1>
          <p className="hero-lead">We run booths at school events, pitch our own ideas and keep our own books. Anyone can join.</p>
          <div className="hero-actions">
            <a href="#join" className="btn btn-blue">
              Join the club <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
            </a>
            <a href="#events" className="btn btn-outline">
              See what's on
            </a>
          </div>
          {next && (
            <Link to={`/p/${next.id}`} className="hero-next">
              <Star />
              Next up: <strong>{next.title}</strong>
              {next.startDate && <span>({fmtDate(next.startDate, 'EEE d MMM')})</span>}
            </Link>
          )}
        </div>
        <div className="board" ref={board} aria-hidden="true">
          <svg className="board-globe" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" />
            <ellipse cx="100" cy="100" rx="40" ry="80" />
            <ellipse cx="100" cy="100" rx="66" ry="80" />
            <line x1="100" y1="20" x2="100" y2="180" />
            <ellipse cx="100" cy="100" rx="80" ry="28" />
            <path d="M28 66 H172 M28 134 H172" />
            <ellipse className="orbit" cx="100" cy="100" rx="98" ry="34" transform="rotate(-18 100 100)" />
          </svg>
          {stickers.map((s) => {
            const o = offsets[s.id];
            return (
              <div
                key={s.id}
                className={`sticker ${s.className ?? ''}`}
                data-dx={o?.dx ?? 0}
                data-dy={o?.dy ?? 0}
                style={
                  {
                    '--x': `${s.x}%`,
                    '--y': `${s.y}%`,
                    '--r': `${s.r}deg`,
                    '--dx': `${o?.dx ?? 0}px`,
                    '--dy': `${o?.dy ?? 0}px`,
                    zIndex: o?.z ?? undefined,
                  } as CSSProperties
                }
                onPointerDown={onDown(s.id)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                {s.node}
              </div>
            );
          })}
          <p className={`hand board-hint ${moved ? 'gone' : ''}`}>psst, the stickers move</p>
        </div>
      </div>
    </section>
  );
}
