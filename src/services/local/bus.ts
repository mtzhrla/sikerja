import type { ChangeEvent, Unsubscribe } from '@/services/types';

type Listener = (event: ChangeEvent) => void;

const CHANNEL_NAME = 'pip-dashboard-realtime';

/**
 * Bus realtime mode lokal:
 * - listener dalam tab yang sama dipanggil langsung;
 * - tab lain menerima lewat BroadcastChannel (perubahan tampil tanpa reload).
 */
class LocalBus {
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (msg: MessageEvent<ChangeEvent>) => {
        this.dispatch(msg.data, false);
      };
    }
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ChangeEvent): void {
    this.dispatch(event, true);
  }

  private dispatch(event: ChangeEvent, broadcast: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener tidak boleh mematahkan bus
      }
    }
    if (broadcast) {
      this.channel?.postMessage(event);
    }
  }
}

export const localBus = new LocalBus();
