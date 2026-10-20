import { snapshotSupabase } from './supabase-state';
import { seedDemoData } from './supabase-seed';

export default async function globalSetup() {
  // Snapshot state bersih DULU, lalu semai data demo efemeral. globalTeardown
  // memulihkan snapshot kosong → produksi tidak menyimpan data uji/dummy.
  await snapshotSupabase();
  await seedDemoData();
}
