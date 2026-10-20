import { useEffect, useState } from 'react';

/** Jam dinding yang diperbarui tiap `intervalMs` (untuk header/TV). */
export function useClock(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
