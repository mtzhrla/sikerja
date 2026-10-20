import { cn } from '@/lib/utils';

/**
 * Maskot original halaman login — trio karakter geometris (SVG + CSS murni,
 * tanpa asset pihak ketiga). Ramah, sederhana, tetap pantas untuk aplikasi
 * internal pemerintahan.
 *
 * State:
 *  - idle     : mata terbuka, berkedip ringan, pupil mengikuti kursor.
 *  - lookUser : melihat ke arah field username yang sedang fokus.
 *  - curious  : penasaran/ramah saat username diketik.
 *  - ready    : bersiap menutup mata (field password fokus).
 *  - covering : menutup mata saat password diketik.
 *  - peeking  : mengintip satu mata saat show-password aktif.
 *  - success  : tersenyum + sparkle ringan.
 *  - error    : ekspresi bingung + shake sangat ringan.
 *
 * Pupil mengikuti kursor lewat CSS var --gaze-x/--gaze-y (px, diset LoginPage).
 * Animasi singkat (≤220ms); `prefers-reduced-motion` dihormati oleh aturan
 * global di index.css dan LoginPage tidak memasang mouse-tracking.
 */
export type MascotMood =
  | 'idle'
  | 'lookUser'
  | 'curious'
  | 'ready'
  | 'covering'
  | 'peeking'
  | 'success'
  | 'error';

interface MascotProps {
  mood: MascotMood;
  className?: string;
}

/** Sepasang mata dengan dukungan kedip, tutup, intip, dan pupil bergerak. */
function Eyes({
  cxL,
  cxR,
  cy,
  closed,
  peekLeft,
  happy,
  wide,
}: {
  cxL: number;
  cxR: number;
  cy: number;
  closed: boolean;
  /** Saat mengintip: mata kiri terbuka, kanan tetap tertutup. */
  peekLeft?: boolean;
  happy?: boolean;
  /** Mata sedikit membesar (penasaran). */
  wide?: boolean;
}) {
  if (happy) {
    // Mata melengkung bahagia (^ ^)
    return (
      <g stroke="#1e2a4a" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d={`M ${cxL - 3.5} ${cy + 1} Q ${cxL} ${cy - 3.5} ${cxL + 3.5} ${cy + 1}`} />
        <path d={`M ${cxR - 3.5} ${cy + 1} Q ${cxR} ${cy - 3.5} ${cxR + 3.5} ${cy + 1}`} />
      </g>
    );
  }
  const r = wide ? 3.6 : 3.1;
  const openEye = (cx: number) => <circle cx={cx} cy={cy} r={r} fill="#1e2a4a" />;
  const shutEye = (cx: number) => (
    <path
      d={`M ${cx - 3.5} ${cy} Q ${cx} ${cy + 3} ${cx + 3.5} ${cy}`}
      stroke="#1e2a4a"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
  );
  if (closed && peekLeft) {
    return (
      <g>
        <g className="mascot-pupils">{openEye(cxL)}</g>
        {shutEye(cxR)}
      </g>
    );
  }
  if (closed) {
    return (
      <g>
        {shutEye(cxL)}
        {shutEye(cxR)}
      </g>
    );
  }
  return (
    <g className="mascot-blink">
      <g className="mascot-pupils">
        {openEye(cxL)}
        {openEye(cxR)}
      </g>
    </g>
  );
}

export function Mascot({ mood, className }: MascotProps) {
  const covering = mood === 'covering';
  const peeking = mood === 'peeking';
  const success = mood === 'success';
  const error = mood === 'error';
  const ready = mood === 'ready';
  const lookUser = mood === 'lookUser' || mood === 'curious';
  const curious = mood === 'curious';

  return (
    <div
      aria-hidden
      data-mood={mood}
      className={cn('mascot select-none', error && 'mascot-shake', className)}
    >
      <svg viewBox="0 0 240 120" role="img" className="block h-auto w-full">
        {/* ------------------------------------------------ Bibo — rounded rectangle (biru) */}
        <g className={cn('mascot-char', (lookUser || ready) && 'mascot-lean', success && 'mascot-hop')}>
          <rect x="26" y="28" width="64" height="76" rx="18" fill="url(#mascot-grad-blue)" />
          {/* antena kecil */}
          <circle cx="58" cy="20" r="5" fill="#7dd3fc" />
          <rect x="56.5" y="22" width="3" height="10" rx="1.5" fill="#7dd3fc" />
          <Eyes
            cxL={46}
            cxR={70}
            cy={58}
            closed={covering || peeking}
            peekLeft={peeking}
            happy={success}
            wide={curious}
          />
          {/* mulut */}
          {error ? (
            <path d="M 50 76 Q 58 70 66 76" stroke="#1e2a4a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          ) : curious ? (
            <ellipse cx="58" cy="76" rx="4" ry="5" fill="#1e2a4a" />
          ) : (
            <path d="M 50 73 Q 58 81 66 73" stroke="#1e2a4a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          )}
          {/* tangan menutup mata (setengah naik saat bersiap) */}
          <g className={cn('mascot-hands', ready && 'mascot-hands-half', covering && 'mascot-hands-up')}>
            <circle cx="46" cy="58" r="8.5" fill="#2361e3" stroke="#1c4dc4" strokeWidth="1.5" />
            <circle cx="70" cy="58" r="8.5" fill="#2361e3" stroke="#1c4dc4" strokeWidth="1.5" />
          </g>
        </g>

        {/* ------------------------------------------------ Pipi — lingkaran (kuning) */}
        <g
          className={cn(
            'mascot-char mascot-delay-1',
            (lookUser || ready || covering || peeking) && 'mascot-turn',
            success && 'mascot-hop',
          )}
        >
          <circle cx="132" cy="78" r="26" fill="url(#mascot-grad-amber)" />
          <Eyes cxL={124} cxR={141} cy={74} closed={covering} happy={success} wide={curious} />
          {error ? (
            <ellipse cx="132.5" cy="88" rx="3.6" ry="4.4" fill="#1e2a4a" />
          ) : curious ? (
            <ellipse cx="132.5" cy="87" rx="3" ry="3.8" fill="#1e2a4a" />
          ) : (
            <path d="M 127 86 Q 132.5 91 138 86" stroke="#1e2a4a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          )}
          {/* rona pipi */}
          <circle cx="117" cy="82" r="3.4" fill="#fb923c" opacity="0.55" />
          <circle cx="148" cy="82" r="3.4" fill="#fb923c" opacity="0.55" />
        </g>

        {/* ------------------------------------------------ Momo — kapsul/semicircle (ungu-pink) */}
        <g
          className={cn(
            'mascot-char mascot-delay-2',
            (lookUser || ready) && 'mascot-lean-left',
            success && 'mascot-hop',
          )}
        >
          <path d="M 172 104 L 172 66 A 22 22 0 0 1 216 66 L 216 104 Z" fill="url(#mascot-grad-violet)" />
          <Eyes cxL={185} cxR={203} cy={72} closed={covering} happy={success} wide={curious} />
          {error ? (
            <path d="M 188 86 L 200 86" stroke="#1e2a4a" strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <path d="M 188 84 Q 194 89 200 84" stroke="#1e2a4a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          )}
          {/* poni segitiga membulat */}
          <path d="M 188 48 Q 194 38 200 48 Q 194 52 188 48 Z" fill="#f0abfc" />
        </g>

        {/* ------------------------------------------------ Sparkle saat sukses */}
        <g className={cn('mascot-sparkles', success && 'mascot-sparkles-on')} fill="#34d399">
          <path d="M 20 18 l 2.2 5 5 2.2 -5 2.2 -2.2 5 -2.2 -5 -5 -2.2 5 -2.2 Z" />
          <path d="M 218 24 l 1.8 4 4 1.8 -4 1.8 -1.8 4 -1.8 -4 -4 -1.8 4 -1.8 Z" fill="#22d3ee" />
          <circle cx="120" cy="16" r="3.2" fill="#facc15" />
        </g>

        <defs>
          <linearGradient id="mascot-grad-blue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#3579ee" />
          </linearGradient>
          <linearGradient id="mascot-grad-amber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="mascot-grad-violet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
