/** Bentuk baris tabel Postgres (snake_case) + konverter ke tipe domain. */
import type {
  ActivityPlanItem,
  AppSettings,
  Attachment,
  AttachmentGroup,
  AttachmentVersion,
  AuditEntry,
  BoardInfo,
  Category,
  ChecklistGroup,
  ColumnMapping,
  DistributionRow,
  DistributionSnapshot,
  Employee,
  Label,
  NotificationItem,
  Role,
  SessionInfo,
  SheetBinding,
  SpreadsheetSource,
  Step,
  SyncRun,
  Task,
  TaskComment,
  TaskTemplate,
} from '@/services/types';

export interface EmployeeRow {
  id: string;
  full_name: string;
  display_name: string;
  initials: string;
  color: string;
  nip: string | null;
  nip_normalized?: string | null;
  username?: string | null;
  position: string;
  team: string;
  level?: Employee['level'] | null;
  supervisor_id?: string | null;
  sort_order: number;
  active: boolean;
  avatar_path: string | null;
  avatar_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export const toEmployee = (r: EmployeeRow): Employee => ({
  id: r.id,
  fullName: r.full_name,
  displayName: r.display_name,
  initials: r.initials,
  color: r.color,
  nip: r.nip ?? null,
  nipNormalized: r.nip_normalized ?? null,
  username: r.username ?? null,
  position: r.position,
  team: r.team,
  level: r.level ?? 'STAFF',
  supervisorId: r.supervisor_id ?? null,
  sortOrder: r.sort_order,
  active: r.active,
  avatarPath: r.avatar_path ?? null,
  avatarUpdatedAt: r.avatar_updated_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface BoardRow {
  id: string;
  title: string;
  updated_at: string;
  version: number;
}

export const toBoard = (r: BoardRow): BoardInfo => ({
  id: r.id,
  title: r.title,
  updatedAt: r.updated_at,
  version: r.version,
});

export interface StepRow {
  id: string;
  board_id: string;
  name: string;
  kind: Step['kind'];
  color: string;
  sort_order: number;
  deleted_at: string | null;
  version: number;
}

export const toStep = (r: StepRow): Step => ({
  id: r.id,
  boardId: r.board_id,
  name: r.name,
  kind: r.kind,
  color: r.color,
  sortOrder: r.sort_order,
  deletedAt: r.deleted_at,
  version: r.version,
});

export interface TaskRow {
  id: string;
  board_id: string;
  step_id: string;
  title: string;
  activity_plan?: string | null;
  description: string;
  duration_type: Task['durationType'];
  category_id: string | null;
  label_ids: string[];
  priority: Task['priority'];
  start_date: string | null;
  due_date: string | null;
  progress_mode: Task['progressMode'];
  manual_progress: number;
  pic_main_ids: string[] | null;
  pic_main_id: string | null;
  pic_ids: string[];
  checklist: ChecklistGroup[];
  is_focus: boolean;
  sort_order: number;
  archived_at: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  owner_employee_id?: string | null;
  task_type?: Task['taskType'] | null;
  disposed_by_employee_id?: string | null;
  drive_folder_id?: string | null;
}

export const toTask = (r: TaskRow): Task => {
  // Baris lama (pra-0006) hanya punya pic_main_id — fallback ke kolom lama.
  const picMainIds =
    r.pic_main_ids && r.pic_main_ids.length > 0
      ? r.pic_main_ids
      : r.pic_main_id
        ? [r.pic_main_id]
        : [];
  return {
  id: r.id,
  boardId: r.board_id,
  stepId: r.step_id,
  title: r.title,
  activityPlan: r.activity_plan ?? '',
  description: r.description,
  durationType: r.duration_type,
  categoryId: r.category_id,
  labelIds: r.label_ids ?? [],
  priority: r.priority,
  startDate: r.start_date,
  dueDate: r.due_date,
  progressMode: r.progress_mode,
  manualProgress: r.manual_progress,
  picMainIds,
  picMainId: picMainIds[0] ?? null,
  picIds: (r.pic_ids ?? []).filter((id) => !picMainIds.includes(id)),
  checklist: r.checklist ?? [],
  isFocus: r.is_focus,
  sortOrder: r.sort_order,
  archivedAt: r.archived_at,
  deletedAt: r.deleted_at,
  deleteReason: r.delete_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
  createdByEmployeeId: r.created_by_employee_id,
  updatedByEmployeeId: r.updated_by_employee_id,
  ownerEmployeeId: r.owner_employee_id ?? r.created_by_employee_id ?? picMainIds[0] ?? null,
  taskType: r.task_type ?? 'MANDIRI',
  disposedByEmployeeId: r.disposed_by_employee_id ?? null,
  driveFolderId: r.drive_folder_id ?? null,
  };
};

export interface CommentRow {
  id: string;
  task_id: string;
  type: TaskComment['type'];
  text: string;
  employee_id: string;
  created_at: string;
}

export const toComment = (r: CommentRow): TaskComment => ({
  id: r.id,
  taskId: r.task_id,
  type: r.type,
  text: r.text,
  employeeId: r.employee_id,
  createdAt: r.created_at,
});

export interface AttachmentRow {
  id: string;
  task_id: string;
  file_name: string;
  size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by_employee_id: string;
  created_at: string;
}

export const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id,
  taskId: r.task_id,
  fileName: r.file_name,
  size: r.size,
  mimeType: r.mime_type,
  uploadedByEmployeeId: r.uploaded_by_employee_id,
  createdAt: r.created_at,
});

export interface TaxonomyRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  active: boolean;
}

export const toTaxonomy = (r: TaxonomyRow): Category | Label => ({
  id: r.id,
  name: r.name,
  color: r.color,
  sortOrder: r.sort_order,
  active: r.active,
});

export interface TemplateRow {
  id: string;
  name: string;
  title: string;
  description: string;
  category_id: string | null;
  label_ids: string[];
  duration_type: TaskTemplate['durationType'];
  priority: TaskTemplate['priority'];
  initial_step_id: string | null;
  target_offset_days: number | null;
  checklist: ChecklistGroup[];
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const toTemplate = (r: TemplateRow): TaskTemplate => ({
  id: r.id,
  name: r.name,
  title: r.title,
  description: r.description,
  categoryId: r.category_id,
  labelIds: r.label_ids ?? [],
  durationType: r.duration_type,
  priority: r.priority,
  initialStepId: r.initial_step_id,
  targetOffsetDays: r.target_offset_days,
  checklist: r.checklist ?? [],
  sortOrder: r.sort_order,
  active: r.active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface SnapshotRow {
  id: string;
  year: number;
  period: string;
  status: DistributionSnapshot['status'];
  rows: DistributionRow[];
  source_file_name: string | null;
  note: string | null;
  created_at: string;
  created_by_employee_id: string | null;
  activated_at: string | null;
  updated_at: string;
  version: number;
}

export const toSnapshot = (r: SnapshotRow): DistributionSnapshot => ({
  id: r.id,
  year: r.year,
  period: r.period,
  status: r.status,
  rows: r.rows ?? [],
  sourceFileName: r.source_file_name,
  note: r.note,
  createdAt: r.created_at,
  createdByEmployeeId: r.created_by_employee_id,
  activatedAt: r.activated_at,
  updatedAt: r.updated_at,
  version: r.version,
});

export interface AuditRow {
  id: string;
  at: string;
  actor_role: Role;
  actor_account: string;
  employee_id: string | null;
  action: AuditEntry['action'];
  entity_type: AuditEntry['entityType'];
  entity_id: string | null;
  entity_label: string | null;
  before: unknown;
  after: unknown;
  success: boolean;
  error_message: string | null;
  session_id: string | null;
  device_label: string | null;
}

export const toAudit = (r: AuditRow): AuditEntry => ({
  id: r.id,
  at: r.at,
  actorRole: r.actor_role,
  actorAccount: r.actor_account,
  employeeId: r.employee_id,
  action: r.action,
  entityType: r.entity_type,
  entityId: r.entity_id,
  entityLabel: r.entity_label,
  before: r.before,
  after: r.after,
  success: r.success,
  errorMessage: r.error_message,
  sessionId: r.session_id,
  deviceLabel: r.device_label,
});

export interface SessionRow {
  id: string;
  user_id: string;
  role: Role;
  account: string;
  device_label: string;
  created_at: string;
  last_active_at: string;
  revoked_at: string | null;
}

export const toSession = (r: SessionRow): SessionInfo => ({
  id: r.id,
  role: r.role,
  account: r.account,
  deviceLabel: r.device_label,
  createdAt: r.created_at,
  lastActiveAt: r.last_active_at,
  revokedAt: r.revoked_at,
});

export interface SettingsRow {
  id: number;
  app_name: string;
  logo_data_url: string | null;
  active_year: number;
  user_session_days: number;
  stale_days: number;
  attachment_max_mb: number;
  attachment_allowed_ext: string[];
  updated_at: string;
  version: number;
}

export const toSettings = (r: SettingsRow): AppSettings => ({
  appName: r.app_name,
  logoDataUrl: r.logo_data_url,
  activeYear: r.active_year,
  userSessionDays: r.user_session_days,
  staleDays: r.stale_days,
  attachmentMaxMB: r.attachment_max_mb,
  attachmentAllowedExt: r.attachment_allowed_ext ?? [],
  updatedAt: r.updated_at,
  version: r.version,
});

// ---------------------------------------------------------------------------
// Integrasi Google Sheets & Rencana Kegiatan
// ---------------------------------------------------------------------------

export interface SourceRow {
  id: string;
  source_type: SpreadsheetSource['sourceType'];
  year: number;
  name: string;
  spreadsheet_url: string;
  spreadsheet_id: string;
  is_active: boolean;
  is_primary: boolean;
  sync_mode: SpreadsheetSource['syncMode'];
  last_synced_at: string | null;
  last_sync_status: SpreadsheetSource['lastSyncStatus'];
  last_error: string | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const toSource = (r: SourceRow): SpreadsheetSource => ({
  id: r.id,
  sourceType: r.source_type,
  year: r.year,
  name: r.name,
  spreadsheetUrl: r.spreadsheet_url,
  spreadsheetId: r.spreadsheet_id,
  isActive: r.is_active,
  isPrimary: r.is_primary,
  syncMode: r.sync_mode,
  lastSyncedAt: r.last_synced_at,
  lastSyncStatus: r.last_sync_status,
  lastError: r.last_error,
  createdByEmployeeId: r.created_by_employee_id,
  updatedByEmployeeId: r.updated_by_employee_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export interface BindingRow {
  id: string;
  source_id: string;
  binding_type: SheetBinding['bindingType'];
  sheet_name: string;
  header_row: number;
  data_start_row: number;
  optional_range: string | null;
  mapping_status: SheetBinding['mappingStatus'];
}

export const toBinding = (r: BindingRow): SheetBinding => ({
  id: r.id,
  sourceId: r.source_id,
  bindingType: r.binding_type,
  sheetName: r.sheet_name,
  headerRow: r.header_row,
  dataStartRow: r.data_start_row,
  optionalRange: r.optional_range,
  mappingStatus: r.mapping_status,
});

export interface MappingRow {
  id: string;
  binding_id: string;
  detected_header: string;
  target_field: string;
  parser_type: ColumnMapping['parserType'];
  transform_rule: string | null;
  required: boolean;
  validation_status: ColumnMapping['validationStatus'];
}

export const toMapping = (r: MappingRow): ColumnMapping => ({
  id: r.id,
  bindingId: r.binding_id,
  detectedHeader: r.detected_header,
  targetField: r.target_field,
  parserType: r.parser_type,
  transformRule: r.transform_rule,
  required: r.required,
  validationStatus: r.validation_status,
});

export interface SyncRunRow {
  id: string;
  source_id: string;
  trigger: SyncRun['trigger'];
  status: SyncRun['status'];
  started_at: string;
  finished_at: string | null;
  rows_read: number;
  rows_upserted: number;
  message: string | null;
  error_message: string | null;
}

export const toSyncRun = (r: SyncRunRow): SyncRun => ({
  id: r.id,
  sourceId: r.source_id,
  trigger: r.trigger,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  rowsRead: r.rows_read,
  rowsUpserted: r.rows_upserted,
  message: r.message,
  errorMessage: r.error_message,
});

export interface ActivityRow {
  id: string;
  source_id: string | null;
  year: number;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string;
  category: string;
  pic_names: string[];
  pic_employee_ids: string[];
  participants: string;
  status: ActivityPlanItem['status'];
  notes: string;
  meeting_link: string | null;
  document_link: string | null;
  source_row_key: string;
  created_at: string;
  updated_at: string;
}

export const toActivity = (r: ActivityRow): ActivityPlanItem => ({
  id: r.id,
  sourceId: r.source_id,
  year: r.year,
  title: r.title,
  startDate: r.start_date,
  endDate: r.end_date,
  startTime: r.start_time ? r.start_time.slice(0, 5) : null,
  endTime: r.end_time ? r.end_time.slice(0, 5) : null,
  allDay: r.all_day,
  location: r.location ?? '',
  category: r.category ?? '',
  picNames: r.pic_names ?? [],
  picEmployeeIds: r.pic_employee_ids ?? [],
  participants: r.participants ?? '',
  status: r.status,
  notes: r.notes ?? '',
  meetingLink: r.meeting_link,
  documentLink: r.document_link,
  sourceRowKey: r.source_row_key,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface GoogleConnRow {
  id: number;
  email: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  token_status: 'AKTIF' | 'KEDALUWARSA' | 'DICABUT' | null;
}

// ---------------------------------------------------------------------------
// Notifikasi per pengguna
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  recipient_employee_id: string;
  type: NotificationItem['type'];
  title: string;
  body: string;
  task_id: string | null;
  actor_employee_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export const toNotification = (r: NotificationRow): NotificationItem => ({
  id: r.id,
  recipientEmployeeId: r.recipient_employee_id,
  type: r.type,
  title: r.title,
  body: r.body ?? '',
  taskId: r.task_id,
  actorEmployeeId: r.actor_employee_id,
  metadata: r.metadata ?? {},
  readAt: r.read_at,
  createdAt: r.created_at,
});

// ---------------------------------------------------------------------------
// Lampiran berkelompok + riwayat versi
// ---------------------------------------------------------------------------

export interface AttachmentVersionRow {
  id: string;
  group_id: string;
  version: number;
  file_name: string;
  size: number;
  mime_type: string;
  storage_backend: AttachmentVersion['storageBackend'];
  drive_file_id: string | null;
  drive_web_view_link: string | null;
  storage_path: string | null;
  checksum: string | null;
  change_note: string;
  uploaded_by_employee_id: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by_employee_id: string | null;
}

export const toAttachmentVersion = (r: AttachmentVersionRow): AttachmentVersion => ({
  id: r.id,
  groupId: r.group_id,
  version: r.version,
  fileName: r.file_name,
  size: Number(r.size),
  mimeType: r.mime_type,
  storageBackend: r.storage_backend,
  driveFileId: r.drive_file_id,
  driveWebViewLink: r.drive_web_view_link,
  checksum: r.checksum,
  changeNote: r.change_note ?? '',
  uploadedByEmployeeId: r.uploaded_by_employee_id,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
  deletedByEmployeeId: r.deleted_by_employee_id,
});

export interface AttachmentGroupRow {
  id: string;
  task_id: string;
  title: string;
  drive_folder_id: string | null;
  created_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by_employee_id: string | null;
  attachment_versions?: AttachmentVersionRow[];
}

export const toAttachmentGroup = (r: AttachmentGroupRow): AttachmentGroup => ({
  id: r.id,
  taskId: r.task_id,
  title: r.title,
  driveFolderId: r.drive_folder_id,
  createdByEmployeeId: r.created_by_employee_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  deletedByEmployeeId: r.deleted_by_employee_id,
  versions: (r.attachment_versions ?? [])
    .map(toAttachmentVersion)
    .sort((a, b) => b.version - a.version),
});
