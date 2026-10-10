import type { CSSProperties, ReactNode } from 'react';
import type { ClubPhoto } from './photos';

export function Polaroid({
  photo,
  tilt = 0,
  small = false,
  eager = false,
  tape = true,
  className = '',
  style,
  children,
}: {
  photo: ClubPhoto;
  tilt?: number;
  small?: boolean;
  eager?: boolean;
  tape?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <figure className={`polaroid ${className}`} style={{ ['--r' as string]: `${tilt}deg`, ...style }}>
      {tape && <span className="tape" aria-hidden="true" />}
      <img
        src={small ? photo.sm : photo.src}
        alt={photo.alt}
        width={photo.w}
        height={photo.h}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        {...(eager ? { fetchpriority: 'high' } : {})}
      />
      <figcaption className="hand">{photo.caption}</figcaption>
      {children}
    </figure>
  );
}
