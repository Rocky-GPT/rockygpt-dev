'use client';

import { useEffect, useRef, useState } from 'react';

/** A person's published photo; their initials when it is missing or fails to load. */
export function Photo({ src, name, className, hideIfMissing }: { src?: string | null; name: string; className?: string; hideIfMissing?: boolean }) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // A photo that failed before the page came alive never fires onError; check once on mount.
  useEffect(() => {
    const shown = image.current;
    if (shown && shown.complete && shown.naturalWidth === 0) setFailed(true);
  }, [src]);
  const initials = name.split(/\s+/).filter(word => /^\p{L}/u.test(word)).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  if ((!src || failed) && hideIfMissing) return <p className="text-sm text-zinc-500">The picture could not be loaded.</p>;
  if (!src || failed) {
    return (
      <span role="img" aria-label={name} className={`grid place-items-center bg-[#2a2a2a] font-bold text-[var(--k,#a78bfa)] ${className ?? ''}`}>
        {initials || '?'}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a ramapo.edu photo, shown as published
  return <img ref={image} src={src} alt={name} onError={() => setFailed(true)} className={`object-cover ${className ?? ''}`} />;
}
