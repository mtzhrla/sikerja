-- Rencana kegiatan yang ditulis langsung pada pekerjaan.
alter table public.tasks
  add column if not exists activity_plan text not null default '';
