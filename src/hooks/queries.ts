import { useQuery } from '@tanstack/react-query';
import { getDataService } from '@/services';
import type { ProfileTaskFilter } from '@/services/types';

/**
 * Konvensi kunci query: elemen pertama = topik realtime (ChangeTopic),
 * sehingga invalidasi dari event realtime cukup mencocokkan prefix.
 */
export const qk = {
  employees: (includeInactive = false) => ['employees', { includeInactive }] as const,
  board: () => ['board'] as const,
  steps: (includeDeleted = false) => ['steps', { includeDeleted }] as const,
  tasks: (opts?: { includeArchived?: boolean; includeDeleted?: boolean }) =>
    ['tasks', opts ?? {}] as const,
  employeeProfileTasks: (employeeId: string, filter: ProfileTaskFilter, page: number) =>
    ['tasks', 'employee-profile', employeeId, filter, page] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  attachments: (taskId: string) => ['attachments', taskId] as const,
  taskHistory: (taskId: string) => ['audit', 'task', taskId] as const,
  categories: (includeInactive = false) => ['categories', { includeInactive }] as const,
  labels: (includeInactive = false) => ['labels', { includeInactive }] as const,
  templates: (includeInactive = false) => ['templates', { includeInactive }] as const,
  distributionActive: (year?: number, period?: string) =>
    ['distribution', 'active', year ?? null, period ?? null] as const,
  distributionList: () => ['distribution', 'list'] as const,
  distributionScopes: () => ['distribution', 'scopes'] as const,
  distributionSk: (year?: number, sourceId?: string) =>
    ['distribution', 'sk', year ?? null, sourceId ?? null] as const,
  activity: (limit = 20) => ['audit', 'activity', limit] as const,
  auditList: (filter: unknown) => ['audit', 'list', filter] as const,
  settings: () => ['settings'] as const,
  sessions: () => ['sessions'] as const,
  activities: (year?: number) => ['activities', year ?? null] as const,
  activityYears: () => ['activities', 'years'] as const,
  activitySyncInfo: (year?: number) => ['activities', 'sync', year ?? null] as const,
  sources: (opts?: { includeInactive?: boolean; includeDeleted?: boolean }) =>
    ['integrations', 'sources', opts ?? {}] as const,
  bindings: (sourceId: string) => ['integrations', 'bindings', sourceId] as const,
  mappings: (bindingId: string) => ['integrations', 'mappings', bindingId] as const,
  syncRuns: (sourceId?: string, limit?: number) =>
    ['integrations', 'runs', sourceId ?? null, limit ?? null] as const,
  googleStatus: () => ['integrations', 'google'] as const,
  notifications: (unreadOnly = false) => ['notifications', { unreadOnly }] as const,
  notificationsUnread: () => ['notifications', 'unread'] as const,
  accounts: () => ['accounts', 'list'] as const,
  attachmentGroups: (taskId: string) => ['attachments', 'groups', taskId] as const,
  attachmentCounts: () => ['attachments', 'counts'] as const,
} as const;

/** Notifikasi milik pengguna aktif (popup lonceng pada header). */
export function useNotifications(unreadOnly = false, enabled = true) {
  return useQuery({
    queryKey: qk.notifications(unreadOnly),
    queryFn: () => getDataService().notifications.list({ limit: 30, unreadOnly }),
    enabled,
    staleTime: 10_000,
  });
}

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: qk.notificationsUnread(),
    queryFn: () => getDataService().notifications.unreadCount(),
    enabled,
    staleTime: 10_000,
  });
}

/** Daftar akun pegawai (khusus Admin). */
export function useEmployeeAccounts(enabled: boolean) {
  return useQuery({
    queryKey: qk.accounts(),
    queryFn: () => getDataService().accounts.list(),
    enabled,
  });
}

/** Kelompok lampiran + riwayat versi sebuah pekerjaan. */
export function useAttachmentGroups(taskId: string | null, includeDeleted = false) {
  return useQuery({
    queryKey: [...qk.attachmentGroups(taskId ?? ''), { includeDeleted }] as const,
    queryFn: () =>
      getDataService().attachments.listGroups(taskId ?? '', { includeDeleted }),
    enabled: Boolean(taskId),
  });
}

/** Jumlah lampiran per pekerjaan (indikator kartu board). */
export function useAttachmentCounts() {
  return useQuery({
    queryKey: qk.attachmentCounts(),
    queryFn: () => getDataService().attachments.countsByTask(),
    staleTime: 60_000,
  });
}

export function useEmployees(includeInactive = false) {
  return useQuery({
    queryKey: qk.employees(includeInactive),
    queryFn: () => getDataService().employees.list({ includeInactive }),
  });
}

/**
 * URL foto profil untuk sekumpulan pegawai (signed URL produksi / object URL
 * lokal). Kunci = avatarPath. Pegawai tanpa foto tidak ikut diminta.
 */
export function useEmployeePhotos(
  employees:
    ReadonlyArray<{ avatarPath: string | null; avatarUpdatedAt?: string | null }> | undefined,
) {
  const paths = (employees ?? [])
    .map((e) => e.avatarPath)
    .filter((p): p is string => !!p)
    .sort();
  return useQuery({
    queryKey: ['employees', 'photos', paths] as const,
    queryFn: () => getDataService().employees.photoUrls(paths),
    enabled: paths.length > 0,
    // Signed URL berlaku 1 jam — segarkan sebelum kedaluwarsa.
    staleTime: 45 * 60_000,
    gcTime: 50 * 60_000,
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: qk.settings(),
    queryFn: () => getDataService().settings.get(),
    staleTime: 60_000,
  });
}

export function useSessions(enabled: boolean) {
  return useQuery({
    queryKey: qk.sessions(),
    queryFn: () => getDataService().auth.listSessions(),
    enabled,
  });
}

export function useBoard() {
  return useQuery({
    queryKey: qk.board(),
    queryFn: () => getDataService().board.get(),
  });
}

export function useSteps(includeDeleted = false) {
  return useQuery({
    queryKey: qk.steps(includeDeleted),
    queryFn: () => getDataService().board.listSteps({ includeDeleted }),
  });
}

export function useTasks(opts?: { includeArchived?: boolean; includeDeleted?: boolean }) {
  return useQuery({
    queryKey: qk.tasks(opts),
    queryFn: () => getDataService().tasks.list(opts),
  });
}

export function useEmployeeProfileTasks(
  employeeId: string | null,
  filter: ProfileTaskFilter,
  page: number,
  today: string,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.employeeProfileTasks(employeeId ?? '', filter, page),
    queryFn: () =>
      getDataService().tasks.listForEmployeeProfile(employeeId ?? '', { filter, page, today }),
    enabled: enabled && Boolean(employeeId),
  });
}

export function useAllComments() {
  return useQuery({
    queryKey: ['comments', 'all'] as const,
    queryFn: () => getDataService().tasks.listAllComments(),
  });
}

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: qk.categories(includeInactive),
    queryFn: () => getDataService().taxonomy.listCategories({ includeInactive }),
  });
}

export function useLabels(includeInactive = false) {
  return useQuery({
    queryKey: qk.labels(includeInactive),
    queryFn: () => getDataService().taxonomy.listLabels({ includeInactive }),
  });
}

export function useActiveSnapshot(year?: number, period?: string) {
  return useQuery({
    queryKey: qk.distributionActive(year, period),
    queryFn: () => getDataService().distribution.getActive(year, period),
  });
}

export function useSnapshots() {
  return useQuery({
    queryKey: qk.distributionList(),
    queryFn: () => getDataService().distribution.list(),
  });
}

/** Baris SK Pemberian (agregasi SK unik Dashboard). */
export function usePipSkRecords(year?: number, sourceId?: string) {
  return useQuery({
    queryKey: qk.distributionSk(year, sourceId),
    queryFn: () => getDataService().distribution.listSkRecords({ year, sourceId }),
  });
}

export function useDistributionScopes() {
  return useQuery({
    queryKey: qk.distributionScopes(),
    queryFn: () => getDataService().distribution.listScopes(),
  });
}

export function useRecentActivity(limit = 15) {
  return useQuery({
    queryKey: qk.activity(limit),
    queryFn: () => getDataService().audit.recentActivity(limit),
  });
}

// ---------------------------------------------------------------------------
// Rencana Kegiatan & Integrasi Spreadsheet
// ---------------------------------------------------------------------------

export function useActivities(year?: number) {
  return useQuery({
    queryKey: qk.activities(year),
    queryFn: () => getDataService().activities.list(year ? { year } : undefined),
  });
}

export function useActivityYears() {
  return useQuery({
    queryKey: qk.activityYears(),
    queryFn: () => getDataService().activities.listYears(),
    staleTime: 60_000,
  });
}

export function useActivitySyncInfo(year?: number) {
  return useQuery({
    queryKey: qk.activitySyncInfo(year),
    queryFn: () => getDataService().activities.syncInfo(year),
  });
}

export function useSources(opts?: { includeInactive?: boolean; includeDeleted?: boolean }) {
  return useQuery({
    queryKey: qk.sources(opts),
    queryFn: () => getDataService().integrations.listSources(opts),
  });
}

export function useBindings(sourceId: string | null) {
  return useQuery({
    queryKey: qk.bindings(sourceId ?? ''),
    queryFn: () => getDataService().integrations.listBindings(sourceId ?? ''),
    enabled: sourceId !== null,
  });
}

export function useMappings(bindingId: string | null) {
  return useQuery({
    queryKey: qk.mappings(bindingId ?? ''),
    queryFn: () => getDataService().integrations.listMappings(bindingId ?? ''),
    enabled: bindingId !== null,
  });
}

export function useSyncRuns(sourceId?: string, limit?: number) {
  return useQuery({
    queryKey: qk.syncRuns(sourceId, limit),
    queryFn: () => getDataService().integrations.listSyncRuns({ sourceId, limit }),
  });
}

export function useGoogleStatus() {
  return useQuery({
    queryKey: qk.googleStatus(),
    queryFn: () => getDataService().integrations.googleStatus(),
    staleTime: 30_000,
  });
}
