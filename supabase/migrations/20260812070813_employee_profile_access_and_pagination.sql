-- Profil pegawai: akses pekerjaan hanya untuk Admin atau pegawai terkait,
-- sedangkan daftar profil memakai RPC terotorisasi dengan page size tetap 10.

create index if not exists tasks_created_by_employee_idx
  on public.tasks (created_by_employee_id) where deleted_at is null;
create index if not exists tasks_pic_main_id_idx
  on public.tasks (pic_main_id) where deleted_at is null;
create index if not exists tasks_disposed_by_employee_idx
  on public.tasks (disposed_by_employee_id) where deleted_at is null;

-- Board/detail pekerjaan: Admin penuh; pegawai hanya baris yang melibatkan
-- dirinya. DEMO tetap mempertahankan perilaku read-only existing.
drop policy if exists "read all authenticated" on public.tasks;
drop policy if exists "tasks read authorized" on public.tasks;
create policy "tasks read authorized" on public.tasks for select
to authenticated
using (
  public.is_admin()
  or public.current_account_type() = 'DEMO'
  or (
    public.current_account_type() = 'EMPLOYEE'
    and public.current_employee_id() is not null
    and public.task_role_for_current(tasks) in ('OWNER', 'MEMBER')
  )
);

-- Metadata turunan tidak boleh menjadi jalan memintas policy pekerjaan.
drop policy if exists "read all authenticated" on public.task_comments;
drop policy if exists "task comments read authorized" on public.task_comments;
create policy "task comments read authorized" on public.task_comments for select
to authenticated
using (
  exists (select 1 from public.tasks t where t.id = task_comments.task_id)
);

drop policy if exists "read all authenticated" on public.attachments;
drop policy if exists "attachments read authorized" on public.attachments;
create policy "attachments read authorized" on public.attachments for select
to authenticated
using (
  exists (select 1 from public.tasks t where t.id = attachments.task_id)
);

drop policy if exists "attachment groups read" on public.attachment_groups;
create policy "attachment groups read" on public.attachment_groups for select
to authenticated
using (
  exists (select 1 from public.tasks t where t.id = attachment_groups.task_id)
);

drop policy if exists "attachment versions read" on public.attachment_versions;
create policy "attachment versions read" on public.attachment_versions for select
to authenticated
using (
  exists (
    select 1
    from public.attachment_groups g
    where g.id = attachment_versions.group_id
  )
);

drop policy if exists "lampiran read authenticated" on storage.objects;
drop policy if exists "lampiran read authorized" on storage.objects;
create policy "lampiran read authorized" on storage.objects for select
to authenticated
using (
  bucket_id = 'lampiran'
  and (
    public.current_account_type() = 'DEMO'
    or exists (
      select 1 from public.attachments a where a.storage_path = storage.objects.name
    )
    or exists (
      select 1 from public.attachment_versions v
      where v.storage_path = storage.objects.name
    )
  )
);

create or replace function public.employee_profile_tasks(
  p_employee_id uuid,
  p_filter text default 'SEMUA',
  p_page integer default 1,
  p_today date default current_date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role text := public.current_account_type();
  v_page_size constant integer := 10;
  v_total bigint := 0;
  v_total_pages integer := 1;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_offset integer := 0;
  v_summary_total bigint := 0;
  v_active bigint := 0;
  v_done bigint := 0;
  v_overdue bigint := 0;
  v_blocked bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if v_role is null then
    raise exception 'FORBIDDEN: sesi tidak valid' using errcode = '42501';
  end if;

  if not (
    v_role = 'ADMIN'
    or (
      v_role = 'EMPLOYEE'
      and p_employee_id = public.current_employee_id()
    )
  ) then
    raise exception 'FORBIDDEN: profil pekerjaan pegawai lain hanya dapat dibuka Admin'
      using errcode = '42501';
  end if;

  if p_filter not in ('SEMUA', 'AKTIF', 'SELESAI', 'TERLAMBAT', 'TERHAMBAT') then
    raise exception 'VALIDATION: filter profil tidak valid' using errcode = '22023';
  end if;

  with related as (
    select t.*, s.kind as step_kind
    from public.tasks t
    join public.steps s on s.id = t.step_id
    where t.deleted_at is null
      and (
        t.owner_employee_id = p_employee_id
        or t.created_by_employee_id = p_employee_id
        or t.pic_main_id = p_employee_id
        or p_employee_id = any(coalesce(t.pic_main_ids, '{}'::uuid[]))
        or p_employee_id = any(coalesce(t.pic_ids, '{}'::uuid[]))
      )
  )
  select
    count(*),
    count(*) filter (where archived_at is null and step_kind <> 'DONE'),
    count(*) filter (where step_kind = 'DONE'),
    count(*) filter (
      where archived_at is null
        and step_kind <> 'DONE'
        and due_date is not null
        and due_date < p_today
    ),
    count(*) filter (where archived_at is null and step_kind = 'BLOCKED')
  into v_summary_total, v_active, v_done, v_overdue, v_blocked
  from related;

  with related as (
    select t.*, s.kind as step_kind
    from public.tasks t
    join public.steps s on s.id = t.step_id
    where t.deleted_at is null
      and (
        t.owner_employee_id = p_employee_id
        or t.created_by_employee_id = p_employee_id
        or t.pic_main_id = p_employee_id
        or p_employee_id = any(coalesce(t.pic_main_ids, '{}'::uuid[]))
        or p_employee_id = any(coalesce(t.pic_ids, '{}'::uuid[]))
      )
  )
  select count(*)
  into v_total
  from related
  where
    p_filter = 'SEMUA'
    or (p_filter = 'AKTIF' and archived_at is null and step_kind <> 'DONE')
    or (p_filter = 'SELESAI' and step_kind = 'DONE')
    or (
      p_filter = 'TERLAMBAT'
      and archived_at is null
      and step_kind <> 'DONE'
      and due_date is not null
      and due_date < p_today
    )
    or (p_filter = 'TERHAMBAT' and archived_at is null and step_kind = 'BLOCKED');

  v_total_pages := greatest(1, ceil(v_total::numeric / v_page_size)::integer);
  v_page := least(v_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  with related as (
    select t, t.sort_order, t.id, t.archived_at, t.due_date, s.kind as step_kind
    from public.tasks t
    join public.steps s on s.id = t.step_id
    where t.deleted_at is null
      and (
        t.owner_employee_id = p_employee_id
        or t.created_by_employee_id = p_employee_id
        or t.pic_main_id = p_employee_id
        or p_employee_id = any(coalesce(t.pic_main_ids, '{}'::uuid[]))
        or p_employee_id = any(coalesce(t.pic_ids, '{}'::uuid[]))
      )
  ),
  page_rows as (
    select t, sort_order, id
    from related
    where
      p_filter = 'SEMUA'
      or (p_filter = 'AKTIF' and archived_at is null and step_kind <> 'DONE')
      or (p_filter = 'SELESAI' and step_kind = 'DONE')
      or (
        p_filter = 'TERLAMBAT'
        and archived_at is null
        and step_kind <> 'DONE'
        and due_date is not null
        and due_date < p_today
      )
      or (p_filter = 'TERHAMBAT' and archived_at is null and step_kind = 'BLOCKED')
    order by sort_order, id
    limit v_page_size offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by sort_order, id), '[]'::jsonb)
  into v_items
  from page_rows;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'pageSize', v_page_size,
    'total', v_total,
    'totalPages', v_total_pages,
    'from', case when v_total = 0 then 0 else v_offset + 1 end,
    'to', case when v_total = 0 then 0 else least(v_offset + v_page_size, v_total) end,
    'summary', jsonb_build_object(
      'active', v_active,
      'done', v_done,
      'overdue', v_overdue,
      'blocked', v_blocked,
      'total', v_summary_total,
      'completionPercent', case
        when v_summary_total = 0 then 0
        else round((v_done::numeric / v_summary_total::numeric) * 100)::integer
      end
    )
  );
end;
$$;

revoke all on function public.employee_profile_tasks(uuid, text, integer, date)
  from public, anon;
grant execute on function public.employee_profile_tasks(uuid, text, integer, date)
  to authenticated;
