import { restoreSupabase } from './supabase-state';

export default async function globalTeardown() {
  await restoreSupabase();
}
