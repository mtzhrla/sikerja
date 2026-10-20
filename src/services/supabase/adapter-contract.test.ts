import { describe, expect, it } from 'vitest';
import { localAdapter } from '@/services/local/adapter';
import { supabaseAdapter } from './adapter';

/**
 * Uji kontrak: adapter produksi harus menyediakan permukaan API yang sama
 * persis dengan adapter lokal (DataService). Pengujian runtime terhadap
 * Supabase nyata membutuhkan kredensial — lihat DEPLOYMENT.md.
 */
describe('kontrak supabaseAdapter', () => {
  it('memiliki seluruh service & method DataService', () => {
    expect(supabaseAdapter.mode).toBe('supabase');
    const services = Object.keys(localAdapter) as Array<keyof typeof localAdapter>;
    for (const key of services) {
      if (key === 'mode') continue;
      const localSvc = localAdapter[key] as unknown as Record<string, unknown>;
      const supaSvc = supabaseAdapter[key] as unknown as Record<string, unknown>;
      expect(supaSvc, `service ${String(key)}`).toBeDefined();
      for (const method of Object.keys(localSvc)) {
        expect(typeof supaSvc[method], `${String(key)}.${method}`).toBe(
          typeof localSvc[method],
        );
      }
    }
  });
});
