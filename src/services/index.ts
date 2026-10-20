/**
 * Titik akses tunggal ke DataService.
 *
 * Mode ditentukan oleh VITE_DATA_MODE:
 *  - "local"    (default): adapter lokal tanpa backend — untuk development/demo.
 *                Data contoh (mock) HANYA hidup di adapter ini.
 *  - "supabase": adapter produksi; wajib VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY.
 *                Tidak memakai data contoh sama sekali.
 */
import type { DataService } from './types';
import { localAdapter } from './local/adapter';
import { isSupabaseConfigured } from './supabase/client';
import { supabaseAdapter } from './supabase/adapter';

export type DataMode = 'local' | 'supabase';

export function getDataMode(): DataMode {
  const raw = (
    import.meta.env.VITE_DATA_MODE ??
    import.meta.env.NEXT_PUBLIC_DATA_MODE ??
    ''
  ).toLowerCase();
  if (raw === 'supabase') return 'supabase';
  if (raw === 'local') return 'local';
  return isSupabaseConfigured() ? 'supabase' : 'local';
}

let instance: DataService | null = null;

export function getDataService(): DataService {
  if (instance) return instance;
  if (getDataMode() === 'supabase') {
    if (!isSupabaseConfigured()) {
      console.error(
        '[services] VITE_DATA_MODE=supabase tetapi VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY kosong — ' +
          'jatuh kembali ke adapter lokal. Lengkapi .env lalu build ulang.',
      );
      instance = localAdapter;
    } else {
      instance = supabaseAdapter;
    }
  } else {
    instance = localAdapter;
  }
  return instance;
}
