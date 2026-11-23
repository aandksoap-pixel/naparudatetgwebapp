import { useEffect, useMemo, useState } from 'react';
import { initials } from '@/lib/format';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #fb7185 0%, #fb923c 100%)',
  'linear-gradient(135deg, #f472b6 0%, #fb7185 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #fb7185 100%)',
  'linear-gradient(135deg, #c084fc 0%, #fb7185 100%)',
  'linear-gradient(135deg, #34d399 0%, #22d3ee 100%)',
  'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function gradientFor(seed: string): string {
  const index = hashString(seed) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index] ?? AVATAR_GRADIENTS[0];
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}

/** Аватар с инициалами и детерминированным градиентом как fallback. */
export function Avatar({
  name,
  src,
  size = 40,
  className = '',
  ring = false,
}: AvatarProps): JSX.Element {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const background = useMemo(() => gradientFor(name || 'user'), [name]);
  const label = initials(name);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${
        ring ? 'ring-2 ring-white/70 dark:ring-white/20' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        background: showImage ? undefined : background,
      }}
      role="img"
      aria-label={name}
    >
      {showImage ? (
        <img
          src={src ?? ''}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="select-none font-semibold leading-none text-white"
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
