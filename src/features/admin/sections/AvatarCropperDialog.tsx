import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { notify } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { errorMessage } from '@/services/errors';
import {
  assertAvatarSource,
  coverScale,
  loadImageElement,
  panBounds,
  renderAvatarFromCrop,
  type CropTransform,
} from '@/lib/image';

const VIEWPORT = 288;
const PREVIEW = 72;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const NUDGE = 14;

interface AvatarCropperDialogProps {
  open: boolean;
  /** Berkas sumber yang dipilih Admin; null saat modal tertutup. */
  file: File | null;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil dengan Blob hasil crop siap unggah (≤300 KB, 1:1). */
  onConfirm: (blob: Blob) => void;
}

function clamp(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}

/**
 * Cropper foto profil 1:1: geser (drag/keyboard), zoom, reset, dan pratinjau
 * hasil sebelum disimpan. Hasil di-render & dikompres hanya saat "Gunakan foto".
 */
export function AvatarCropperDialog({
  open,
  file,
  onOpenChange,
  onConfirm,
}: AvatarCropperDialogProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Muat gambar sumber saat modal dibuka.
  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setImg(null);
    setLoadError(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    (async () => {
      try {
        assertAvatarSource(file);
        const el = await loadImageElement(file);
        if (Math.min(el.naturalWidth, el.naturalHeight) < 32) {
          throw new Error('Resolusi gambar terlalu kecil (min. 32×32 px).');
        }
        if (!cancelled) setImg(el);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file]);

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextScale: number) => {
      if (!img) return { x: 0, y: 0 };
      const { maxX, maxY } = panBounds(img, VIEWPORT, nextScale);
      return { x: clamp(next.x, maxX), y: clamp(next.y, maxY) };
    },
    [img],
  );

  function applyScale(next: number) {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    setScale(s);
    setOffset((o) => clampOffset(o, s));
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // ---- Drag geser ----
  function onPointerDown(e: React.PointerEvent) {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.px);
    const ny = drag.current.oy + (e.clientY - drag.current.py);
    setOffset(clampOffset({ x: nx, y: ny }, scale));
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer sudah lepas */
    }
  }

  // ---- Keyboard / D-pad ----
  function onKeyDown(e: React.KeyboardEvent) {
    if (!img) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setOffset((o) => clampOffset({ x: o.x + NUDGE, y: o.y }, scale));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setOffset((o) => clampOffset({ x: o.x - NUDGE, y: o.y }, scale));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setOffset((o) => clampOffset({ x: o.x, y: o.y + NUDGE }, scale));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setOffset((o) => clampOffset({ x: o.x, y: o.y - NUDGE }, scale));
        break;
      case '+':
      case '=':
        e.preventDefault();
        applyScale(scale + 0.2);
        break;
      case '-':
      case '_':
        e.preventDefault();
        applyScale(scale - 0.2);
        break;
    }
  }

  async function confirm() {
    if (!img) return;
    setBusy(true);
    try {
      const crop: CropTransform = {
        scale,
        offsetX: offset.x,
        offsetY: offset.y,
        viewport: VIEWPORT,
      };
      const blob = await renderAvatarFromCrop(img, crop);
      onConfirm(blob);
      onOpenChange(false);
    } catch (err) {
      notify.error('Foto tidak dapat dipakai', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Gaya penempatan gambar di viewport (dan pratinjau, dengan faktor skala).
  function imageStyle(factor: number): React.CSSProperties {
    if (!img) return { display: 'none' };
    const display = coverScale(img, VIEWPORT) * scale;
    const w = img.naturalWidth * display;
    const h = img.naturalHeight * display;
    return {
      position: 'absolute',
      width: `${w * factor}px`,
      height: `${h * factor}px`,
      left: `${(VIEWPORT / 2 - w / 2 + offset.x) * factor}px`,
      top: `${(VIEWPORT / 2 - h / 2 + offset.y) * factor}px`,
      maxWidth: 'none',
    };
  }

  const previewFactor = PREVIEW / VIEWPORT;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Atur Foto Profil"
      description="Atur posisi foto agar wajah terlihat pas di area profil."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void confirm()} loading={busy} disabled={!img}>
            Gunakan foto
          </Button>
        </>
      }
    >
      {loadError ? (
        <p className="rounded-xl bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{loadError}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-center gap-5">
            {/* Area crop */}
            <div className="flex flex-col items-center gap-3">
              <div
                role="group"
                tabIndex={0}
                aria-label="Area pemotongan foto — seret atau gunakan panah untuk menggeser"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={onKeyDown}
                className="relative overflow-hidden rounded-2xl bg-slate-900 ring-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                style={{
                  width: VIEWPORT,
                  height: VIEWPORT,
                  touchAction: 'none',
                  cursor: img ? 'grab' : 'default',
                }}
              >
                {img ? (
                  <>
                    <img
                      src={img.src}
                      alt="Pratinjau yang sedang diatur"
                      draggable={false}
                      style={imageStyle(1)}
                    />
                    {/* Overlay panduan 1:1 (lingkaran area profil). */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/40"
                    >
                      <div className="absolute inset-6 rounded-full shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
                    </div>
                  </>
                ) : (
                  <div className="flex size-full items-center justify-center text-slate-300">
                    <Loader2 className="size-6 animate-spin" aria-hidden />
                  </div>
                )}
              </div>

              {/* Kontrol zoom */}
              <div className="flex w-full items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Perkecil"
                  disabled={!img}
                  onClick={() => applyScale(scale - 0.2)}
                >
                  <Minus className="size-4" aria-hidden />
                </Button>
                <input
                  type="range"
                  min={MIN_SCALE}
                  max={MAX_SCALE}
                  step={0.01}
                  value={scale}
                  disabled={!img}
                  onChange={(e) => applyScale(Number(e.target.value))}
                  aria-label="Tingkat zoom foto"
                  className="h-1.5 flex-1 cursor-pointer accent-brand-600"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Perbesar"
                  disabled={!img}
                  onClick={() => applyScale(scale + 0.2)}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
              </div>
            </div>

            {/* Pratinjau hasil */}
            <div className="flex flex-col items-center gap-2">
              <span
                className="overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200"
                style={{ width: PREVIEW, height: PREVIEW, position: 'relative', display: 'block' }}
              >
                {img && (
                  <img src={img.src} alt="" draggable={false} style={imageStyle(previewFactor)} />
                )}
              </span>
              <span className="text-[11px] font-medium text-slate-400">Pratinjau</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                disabled={!img}
                onClick={reset}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset
              </Button>
            </div>
          </div>
          <p className="text-center text-xs text-slate-400">
            Seret foto untuk menggeser, atau gunakan tombol panah. Foto disimpan 1:1, maks 512×512
            px, di bawah 300 KB.
          </p>
        </div>
      )}
    </Modal>
  );
}
