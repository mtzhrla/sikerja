import { create } from 'zustand';
import { getDataService } from '@/services';
import type { AccountType, SessionInfo } from '@/services/types';
import { readCollection, writeCollection } from '@/services/local/storage';

const ACTOR_KEY = 'actorId';

interface SessionState {
  status: 'loading' | 'ready';
  session: SessionInfo | null;
  role: AccountType | null;
  /** Pegawai yang terhubung ke akun (akun EMPLOYEE). Null untuk ADMIN & DEMO. */
  accountEmployeeId: string | null;
  /** true → pengguna wajib mengganti password sebelum memakai aplikasi. */
  mustChangePassword: boolean;
  /**
   * Pegawai pelaku untuk pencatatan perubahan.
   * Akun EMPLOYEE: selalu dirinya sendiri (tidak dapat diganti).
   * Akun ADMIN: dipilih dari master pegawai lewat dialog.
   */
  actorId: string | null;
  actorPickerOpen: boolean;
  init(): Promise<void>;
  refresh(): Promise<void>;
  /** Login dengan NIP, username pegawai, atau nama akun sistem. */
  login(identifier: string, password: string): Promise<AccountType>;
  logout(): Promise<void>;
  setActor(id: string | null): void;
  openActorPicker(): void;
  closeActorPicker(): void;
  /** Dipanggil jembatan realtime saat ada sesi dicabut. */
  onSessionsChanged(revokedSessionId?: string): Promise<void>;
}

let initPromise: Promise<void> | null = null;

function applyState(
  state: {
    session: SessionInfo | null;
    role: AccountType | null;
    employeeId: string | null;
    mustChangePassword: boolean;
  },
  currentActorId: string | null,
): Partial<SessionState> {
  // Akun pegawai selalu bertindak atas namanya sendiri — tidak ada pemilihan pelaku.
  const actorId = state.employeeId ?? currentActorId;
  if (state.employeeId && state.employeeId !== currentActorId) {
    writeCollection(ACTOR_KEY, state.employeeId);
  }
  return {
    session: state.session,
    role: state.role,
    accountEmployeeId: state.employeeId,
    mustChangePassword: state.mustChangePassword,
    actorId: state.session ? actorId : currentActorId,
    status: 'ready',
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  session: null,
  role: null,
  accountEmployeeId: null,
  mustChangePassword: false,
  actorId: readCollection<string | null>(ACTOR_KEY, null),
  actorPickerOpen: false,

  async init() {
    if (!initPromise) {
      initPromise = (async () => {
        const state = await getDataService().auth.getState();
        set(applyState(state, get().actorId));
      })();
    }
    return initPromise;
  },

  async refresh() {
    const state = await getDataService().auth.getState();
    set(applyState(state, get().actorId));
  },

  async login(identifier, password) {
    const session = await getDataService().auth.login(identifier, password);
    const state = await getDataService().auth.getState();
    set(applyState({ ...state, session }, get().actorId));
    return session.role;
  },

  async logout() {
    await getDataService().auth.logout();
    initPromise = null;
    set({
      session: null,
      role: null,
      accountEmployeeId: null,
      mustChangePassword: false,
    });
  },

  setActor(id) {
    // Akun pegawai tidak dapat berganti pelaku.
    if (get().accountEmployeeId) return;
    writeCollection(ACTOR_KEY, id);
    set({ actorId: id, actorPickerOpen: false });
  },

  openActorPicker() {
    if (get().accountEmployeeId) return;
    set({ actorPickerOpen: true });
  },

  closeActorPicker() {
    set({ actorPickerOpen: false });
  },

  async onSessionsChanged(revokedSessionId) {
    const current = get().session;
    if (!current) return;
    if (revokedSessionId && revokedSessionId !== current.id) return;
    // Sesi ini mungkin dicabut — verifikasi ulang ke service.
    const state = await getDataService().auth.getState();
    if (!state.session) {
      initPromise = null;
      set({ session: null, role: null, accountEmployeeId: null, mustChangePassword: false });
    }
  },
}));

/** Konteks pelaku untuk mutasi; null bila pegawai pelaku belum dipilih. */
export function getActorContext(): { employeeId: string } | null {
  const { actorId } = useSessionStore.getState();
  return actorId ? { employeeId: actorId } : null;
}
