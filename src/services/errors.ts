/** Error domain dengan pesan siap tampil (Bahasa Indonesia). */

export type AppErrorCode =
  | 'VALIDATION'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'STORAGE'
  | 'UNAVAILABLE';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION', message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Autentikasi gagal. Periksa kembali kredensial Anda.') {
    super('AUTH', message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Anda tidak memiliki akses untuk tindakan ini.') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan. Mungkin sudah dihapus.') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

/** Perubahan bersamaan terdeteksi — data di server sudah lebih baru. */
export class ConflictError extends AppError {
  constructor(
    message = 'Data telah diubah oleh pengguna lain. Muat ulang untuk melihat versi terbaru.',
  ) {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.') {
    super('RATE_LIMIT', message);
    this.name = 'RateLimitError';
  }
}

export class StorageError extends AppError {
  constructor(message = 'Penyimpanan berkas gagal. Coba lagi.') {
    super('STORAGE', message);
    this.name = 'StorageError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Pesan aman untuk ditampilkan ke pengguna. */
export function errorMessage(err: unknown): string {
  if (isAppError(err)) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Terjadi kesalahan yang tidak terduga. Coba lagi.';
}
