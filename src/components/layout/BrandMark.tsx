import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  /** Data URL logo kustom dari Pengaturan; null = logo bawaan. */
  logoDataUrl?: string | null;
}

/** Logo aplikasi (bawaan: monogram PIP). */
export function BrandMark({ className, logoDataUrl }: BrandMarkProps) {
  if (logoDataUrl) {
    return (
      <img
        src={logoDataUrl}
        alt=""
        className={cn('size-9 rounded-xl object-contain', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-[13px] font-extrabold tracking-tight text-white shadow-sm',
        className,
      )}
    >
      PIP
    </span>
  );
}
