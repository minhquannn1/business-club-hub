/* Hand-drawn marks: wobbly on purpose. All decorative. */
type P = { className?: string };

export function Squiggle({ className = '' }: P) {
  return (
    <svg className={`doodle squiggle ${className}`} viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 15 C 40 6, 70 20, 104 12 S 170 4, 206 13 S 268 19, 296 8" pathLength={1} />
    </svg>
  );
}

export function Star({ className = '' }: P) {
  return (
    <svg className={`doodle star ${className}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 3 L23.5 15.5 L36.5 16 L26 23.5 L30 36 L20 28.5 L10 36 L14 23.5 L3.5 16 L16.5 15.5 Z" />
    </svg>
  );
}

export function Sparkle({ className = '' }: P) {
  return (
    <svg className={`doodle sparkle ${className}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 4 V14 M20 26 V36 M4 20 H14 M26 20 H36 M9 9 L14 14 M26 26 L31 31 M31 9 L26 14 M14 26 L9 31" />
    </svg>
  );
}

/** Loopy arrow. Points to the bottom right by default. */
export function CurlyArrow({ className = '' }: P) {
  return (
    <svg className={`doodle curly-arrow ${className}`} viewBox="0 0 120 90" aria-hidden="true">
      <path d="M6 10 C 30 4, 54 14, 52 32 C 50 48, 30 46, 34 34 C 38 22, 66 26, 80 44 C 90 57, 96 68, 100 80" pathLength={1} />
      <path d="M86 72 L101 82 L106 64" className="head" />
    </svg>
  );
}

export function Circle({ className = '' }: P) {
  return (
    <svg className={`doodle scribble-circle ${className}`} viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
      <path d="M150 10 C 110 0, 30 4, 12 30 C -4 54, 60 76, 120 72 C 176 68, 202 46, 188 26 C 178 12, 150 8, 128 9" pathLength={1} />
    </svg>
  );
}
