/**
 * Pemrosesan foto profil di sisi client sebelum diunggah:
 * crop 1:1 (tengah otomatis atau diatur manual lewat cropper) →
 * resize maks 512×512 → WebP (fallback JPEG) → turunkan kualitas bertahap
 * hingga di bawah target ukuran.
 */

const MAX_DIM = 512;
/** Target ideal ukuran akhir. */
export const AVATAR_TARGET_BYTES = 150 * 1024;
/** Batas keras — di atas ini upload ditolak. */
export const AVATAR_MAX_BYTES = 300 * 1024;
/** Batas ukuran berkas sumber yang masih masuk akal untuk diproses. */
export const AVATAR_SOURCE_MAX_BYTES = 20 * 1024 * 1024;

export class ImageProcessError extends Error {}

/** Muat berkas gambar menjadi elemen <img> yang siap digambar ke canvas. */
export function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProcessError('Berkas bukan gambar yang valid.'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Kompres canvas persegi → WebP (fallback JPEG), turunkan kualitas hingga ≤ target. */
async function compressSquareCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  // WebP bila didukung; deteksi lewat hasil aktual (Safari lama menghasilkan PNG).
  const webpProbe = await toBlob(canvas, 'image/webp', 0.9);
  const useWebp = webpProbe !== null && webpProbe.type === 'image/webp';
  const mime = useWebp ? 'image/webp' : 'image/jpeg';

  let best: Blob | null = null;
  for (const quality of [0.86, 0.78, 0.68, 0.58, 0.48, 0.38]) {
    const blob = await toBlob(canvas, mime, quality);
    if (!blob) continue;
    best = blob;
    if (blob.size <= AVATAR_TARGET_BYTES) break;
  }
  if (!best) throw new ImageProcessError('Gagal memproses gambar.');
  if (best.size > AVATAR_MAX_BYTES) {
    throw new ImageProcessError(
      'Foto masih melebihi 300 KB setelah kompresi — gunakan gambar lain.',
    );
  }
  return best;
}

/** Validasi berkas sumber sebelum dibuka di cropper (tipe, ukuran berkas). */
export function assertAvatarSource(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new ImageProcessError('Pilih berkas gambar (JPG, PNG, atau WebP).');
  }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) {
    throw new ImageProcessError('Berkas gambar terlalu besar (maksimal 20 MB).');
  }
}

/**
 * Parameter crop dari cropper interaktif. `scale` relatif terhadap skala "cover"
 * minimum (1 = pas menutupi viewport). `offsetX/Y` adalah geser tampilan (px
 * viewport) dari posisi tengah. `viewport` adalah sisi area crop (px CSS).
 */
export interface CropTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  viewport: number;
}

/** Skala "cover" minimum: gambar pas menutupi viewport persegi. */
export function coverScale(img: HTMLImageElement, viewport: number): number {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  return side > 0 ? viewport / side : 1;
}

/** Batas geser (px viewport) agar gambar tetap menutupi viewport pada skala tertentu. */
export function panBounds(
  img: HTMLImageElement,
  viewport: number,
  scale: number,
): { maxX: number; maxY: number } {
  const display = coverScale(img, viewport) * scale;
  return {
    maxX: Math.max(0, (img.naturalWidth * display - viewport) / 2),
    maxY: Math.max(0, (img.naturalHeight * display - viewport) / 2),
  };
}

/**
 * Render hasil crop manual menjadi Blob siap unggah.
 * Memetakan area viewport persegi ke wilayah sumber, lalu kompres 1:1 ≤ 300 KB.
 */
export async function renderAvatarFromCrop(
  img: HTMLImageElement,
  crop: CropTransform,
): Promise<Blob> {
  const display = coverScale(img, crop.viewport) * crop.scale;
  if (!(display > 0)) throw new ImageProcessError('Perangkat tidak mendukung pemrosesan gambar.');

  // Wilayah sumber (px) yang tercakup viewport.
  const srcSide = crop.viewport / display;
  const srcCenterX = img.naturalWidth / 2 - crop.offsetX / display;
  const srcCenterY = img.naturalHeight / 2 - crop.offsetY / display;
  let sx = srcCenterX - srcSide / 2;
  let sy = srcCenterY - srcSide / 2;
  // Jaga tetap di dalam batas gambar.
  sx = Math.max(0, Math.min(sx, img.naturalWidth - srcSide));
  sy = Math.max(0, Math.min(sy, img.naturalHeight - srcSide));

  const out = Math.min(Math.round(srcSide), MAX_DIM);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageProcessError('Perangkat tidak mendukung pemrosesan gambar.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, srcSide, srcSide, 0, 0, out, out);
  return compressSquareCanvas(canvas);
}

/**
 * Proses berkas gambar menjadi foto profil siap unggah dengan crop tengah 1:1.
 * Dipakai sebagai fallback bila cropper interaktif tidak digunakan.
 */
export async function processAvatarImage(file: File): Promise<Blob> {
  assertAvatarSource(file);
  const img = await loadImageElement(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (side < 32) throw new ImageProcessError('Resolusi gambar terlalu kecil (min. 32×32 px).');
  const size = Math.min(side, MAX_DIM);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageProcessError('Perangkat tidak mendukung pemrosesan gambar.');
  ctx.imageSmoothingQuality = 'high';
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return compressSquareCanvas(canvas);
}
