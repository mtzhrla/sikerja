import { cn } from '@/lib/utils';
import type { Employee } from '@/services/types';

/**
 * Pasangan gradient lembut per kunci warna — untuk avatar bawaan bergaya
 * maskot login (bentuk geometris, wajah ramah, tanpa foto manusia).
 */
const FACE_GRADIENTS: Record<string, [string, string]> = {
  blue: ['#7dd3fc', '#3579ee'],
  sky: ['#bae6fd', '#0ea5e9'],
  emerald: ['#6ee7b7', '#059669'],
  amber: ['#fde68a', '#f59e0b'],
  rose: ['#fda4af', '#e11d48'],
  violet: ['#c4b5fd', '#7c3aed'],
  fuchsia: ['#f0abfc', '#c026d3'],
  teal: ['#5eead4', '#0d9488'],
  slate: ['#cbd5e1', '#64748b'],
  orange: ['#fdba74', '#ea580c'],
};

const INK = '#1e2a4a';

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface DefaultAvatarProps {
  /** Nama/tag untuk memilih variasi aksen agar tidak monoton. */
  seed: string;
  /** Kunci warna pegawai (token, bukan hex bebas). */
  color: string;
  className?: string;
}

/**
 * Avatar bawaan original satu tema dengan maskot login: profil anonim
 * geometris dengan warna lembut. SVG murni — ringan, tanpa layanan eksternal.
 */
export function DefaultAvatar({ seed, color, className }: DefaultAvatarProps) {
  const [light, dark] = FACE_GRADIENTS[color] ?? FACE_GRADIENTS.slate!;
  const variant = hashString(seed) % 4;
  const gradId = `dfa-${color}`;
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-hidden
      className={cn('block h-full w-full', className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${gradId})`} />
      {/* Aksen variasi (senada maskot: antena / poni / daun) */}
      {variant === 0 && (
        <g fill="#ffffff" opacity="0.85">
          <rect x="30.5" y="6" width="3" height="8" rx="1.5" />
          <circle cx="32" cy="6" r="3.4" />
        </g>
      )}
      {variant === 1 && (
        <path d="M 25 12 Q 32 3 39 12 Q 32 16 25 12 Z" fill="#ffffff" opacity="0.8" />
      )}
      {variant === 2 && (
        <path d="M 32 4 Q 40 6 38 14 Q 32 12 32 4 Z" fill="#ffffff" opacity="0.75" />
      )}
      {/* Mata */}
      <circle cx="24" cy="30" r="3.4" fill={INK} />
      <circle cx="40" cy="30" r="3.4" fill={INK} />
      {/* Senyum */}
      <path
        d="M 25 41 Q 32 48 39 41"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Rona pipi */}
      {variant !== 3 && (
        <g fill="#ffffff" opacity="0.4">
          <circle cx="17" cy="37" r="3.2" />
          <circle cx="47" cy="37" r="3.2" />
        </g>
      )}
    </svg>
  );
}

/**
 * Palet warna avatar — kunci disimpan pada data pegawai, bukan hex bebas.
 * Seluruh warna level 700 agar inisial putih memenuhi kontras WCAG AA (≥4.5:1).
 */
export const AVATAR_COLORS: Record<string, string> = {
  blue: 'bg-brand-700',
  sky: 'bg-info-700',
  emerald: 'bg-success-700',
  amber: 'bg-warning-700',
  rose: 'bg-danger-700',
  violet: 'bg-violet-700',
  fuchsia: 'bg-fuchsia-700',
  teal: 'bg-teal-700',
  slate: 'bg-slate-600',
  orange: 'bg-orange-700',
};

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS);

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, string> = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-12 text-base',
};

interface AvatarProps {
  employee: Pick<Employee, 'displayName' | 'initials' | 'color' | 'active'> | null | undefined;
  size?: AvatarSize;
  className?: string;
  /** Tampilkan tanda nonaktif (untuk histori pegawai nonaktif). */
  showInactive?: boolean;
  /** URL foto profil — bila ada, ditampilkan menggantikan inisial. */
  src?: string | null;
}

export function Avatar({ employee, size = 'md', className, showInactive, src }: AvatarProps) {
  if (!employee) {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 font-bold text-slate-400',
          SIZE[size],
          className,
        )}
      >
        ?
      </span>
    );
  }
  const colorClass = AVATAR_COLORS[employee.color] ?? AVATAR_COLORS.slate;
  const inactive = showInactive && !employee.active;
  return (
    <span
      title={employee.displayName}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2 ring-white',
        colorClass,
        SIZE[size],
        inactive && 'opacity-50 grayscale',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        employee.initials
      )}
    </span>
  );
}

interface AvatarGroupProps {
  employees: Array<
    Pick<Employee, 'displayName' | 'initials' | 'color' | 'active'> & {
      avatarPath?: string | null;
    }
  >;
  max?: number;
  size?: AvatarSize;
  className?: string;
  /** Peta path foto → URL tampil (opsional). */
  photoUrls?: Record<string, string>;
}

export function AvatarGroup({
  employees,
  max = 4,
  size = 'sm',
  className,
  photoUrls,
}: AvatarGroupProps) {
  const shown = employees.slice(0, max);
  const rest = employees.length - shown.length;
  return (
    <span className={cn('inline-flex items-center -space-x-1.5', className)}>
      {shown.map((emp, i) => (
        <Avatar
          key={`${emp.displayName}-${i}`}
          employee={emp}
          size={size}
          src={emp.avatarPath ? photoUrls?.[emp.avatarPath] : null}
        />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ring-2 ring-white',
            SIZE[size],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
