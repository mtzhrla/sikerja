-- ============================================================================
-- 0009 — Notifikasi PER PENGGUNA (bukan menu; popup lonceng di header)
--
-- Prinsip keamanan:
--   * Penerima hanya dapat membaca & menandai notifikasi MILIKNYA.
--   * TIDAK ADA policy INSERT untuk klien → notifikasi hanya dibuat oleh
--     trigger/fungsi tepercaya (SECURITY DEFINER) atau server (service role).
--     Dengan begitu pengguna tidak dapat memalsukan notifikasi untuk orang lain.
--   * Isi notifikasi hanya judul pekerjaan & pelaku — tanpa data rahasia.
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_employee_id uuid not null references public.employees (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  task_id uuid references public.tasks (id) on delete cascade,
  actor_employee_id uuid references public.employees (id) on delete set null,
  metadata jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_employee_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_employee_id) where read_at is null;
create index if not exists notifications_task_idx on public.notifications (task_id);

alter table public.notifications enable row level security;

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select
  using (recipient_employee_id = public.current_employee_id() or public.is_admin());

-- Hanya boleh menandai dibaca/belum dibaca miliknya sendiri.
drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update
  using (recipient_employee_id = public.current_employee_id())
  with check (recipient_employee_id = public.current_employee_id());

-- TIDAK ADA policy INSERT/DELETE untuk klien (disengaja).

-- ----------------------------------------------------------------------------
-- Helper — pelaku saat ini & penulisan notifikasi terkendali
-- ----------------------------------------------------------------------------

/** Pegawai pelaku: akun EMPLOYEE → dirinya; ADMIN → pegawai pelaku pada baris. */
create or replace function public.notif_actor(p_fallback uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_employee_id(), p_fallback);
$$;

/** Tulis notifikasi ke banyak penerima sekaligus (pelaku dilewati). */
create or replace function public.notif_push(
  p_recipients uuid[],
  p_type text,
  p_title text,
  p_body text,
  p_task_id uuid,
  p_actor uuid,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications
    (recipient_employee_id, type, title, body, task_id, actor_employee_id, metadata)
  select distinct r, p_type, p_title, coalesce(p_body, ''), p_task_id, p_actor,
         coalesce(p_metadata, '{}'::jsonb)
    from unnest(p_recipients) as r
   where r is not null
     and (p_actor is null or r <> p_actor)
     and exists (select 1 from public.employees e where e.id = r and e.active);
end;
$$;

/** Seluruh pihak terkait sebuah pekerjaan (owner, PIC utama, anggota, pembuat). */
create or replace function public.task_participants(p_task public.tasks)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select array(
    select distinct x from unnest(
      array[p_task.owner_employee_id, p_task.created_by_employee_id,
            p_task.disposed_by_employee_id, p_task.pic_main_id]
      || p_task.pic_main_ids || p_task.pic_ids
    ) as x
     where x is not null
  );
$$;

-- ----------------------------------------------------------------------------
-- Trigger — pekerjaan dibuat
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public.notif_actor(new.created_by_employee_id);

  if new.task_type = 'DISPOSISI' then
    perform public.notif_push(
      new.pic_main_ids || array[new.pic_main_id],
      'TASK_DISPOSED',
      'Disposisi pekerjaan baru',
      new.title,
      new.id,
      v_actor
    );
  else
    perform public.notif_push(
      new.pic_main_ids || array[new.pic_main_id],
      'TASK_ASSIGNED',
      'Anda ditetapkan sebagai PIC utama',
      new.title,
      new.id,
      v_actor
    );
  end if;

  perform public.notif_push(
    new.pic_ids,
    'MEMBER_ADDED',
    'Anda diundang ke dalam tim pekerjaan',
    new.title,
    new.id,
    v_actor
  );

  return null;
end;
$$;

drop trigger if exists notify_task_insert_trg on public.tasks;
create trigger notify_task_insert_trg
  after insert on public.tasks
  for each row execute function public.notify_task_insert();

-- ----------------------------------------------------------------------------
-- Trigger — pekerjaan berubah
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid;
  v_added uuid[];
  v_removed uuid[];
  v_step_name text;
  v_step_kind text;
  v_old_step text;
  v_progress_old int;
  v_progress_new int;
begin
  v_actor := public.notif_actor(new.updated_by_employee_id);

  -- PIC utama berubah -----------------------------------------------------
  if new.pic_main_ids is distinct from old.pic_main_ids then
    v_added := array(select unnest(new.pic_main_ids) except select unnest(old.pic_main_ids));
    if array_length(v_added, 1) > 0 then
      perform public.notif_push(
        v_added,
        case when new.task_type = 'DISPOSISI' then 'TASK_DISPOSED' else 'TASK_ASSIGNED' end,
        case when new.task_type = 'DISPOSISI'
             then 'Disposisi pekerjaan untuk Anda'
             else 'Anda ditetapkan sebagai PIC utama' end,
        new.title, new.id, v_actor
      );
    end if;
    -- Beri tahu peserta lain bahwa PIC utama berubah.
    perform public.notif_push(
      array(select unnest(public.task_participants(new)) except select unnest(v_added)),
      'PIC_CHANGED', 'PIC utama pekerjaan berubah', new.title, new.id, v_actor
    );
  end if;

  -- Anggota tim ditambah / dikeluarkan ------------------------------------
  if new.pic_ids is distinct from old.pic_ids then
    v_added := array(select unnest(new.pic_ids) except select unnest(old.pic_ids));
    v_removed := array(select unnest(old.pic_ids) except select unnest(new.pic_ids));
    if array_length(v_added, 1) > 0 then
      perform public.notif_push(v_added, 'MEMBER_ADDED',
        'Anda diundang ke dalam tim pekerjaan', new.title, new.id, v_actor);
    end if;
    if array_length(v_removed, 1) > 0 then
      perform public.notif_push(v_removed, 'MEMBER_REMOVED',
        'Anda dikeluarkan dari tim pekerjaan', new.title, new.id, v_actor);
    end if;
  end if;

  -- Tenggat berubah --------------------------------------------------------
  if new.due_date is distinct from old.due_date then
    perform public.notif_push(
      public.task_participants(new), 'DUE_DATE_CHANGED', 'Tenggat pekerjaan berubah',
      new.title, new.id, v_actor,
      jsonb_build_object('from', old.due_date, 'to', new.due_date)
    );
  end if;

  -- Status (langkah board) berubah ----------------------------------------
  if new.step_id is distinct from old.step_id then
    select name, kind into v_step_name, v_step_kind from public.steps where id = new.step_id;
    select name into v_old_step from public.steps where id = old.step_id;
    if v_step_kind = 'BLOCKED' then
      perform public.notif_push(
        public.task_participants(new), 'TASK_BLOCKED', 'Pekerjaan masuk status terhambat',
        new.title, new.id, v_actor,
        jsonb_build_object('step', v_step_name)
      );
    else
      perform public.notif_push(
        public.task_participants(new), 'STATUS_CHANGED', 'Status pekerjaan berubah',
        new.title, new.id, v_actor,
        jsonb_build_object('from', v_old_step, 'to', v_step_name)
      );
    end if;
  end if;

  -- Progres berubah signifikan (≥ 20 poin atau mencapai 100%) -------------
  v_progress_old := old.manual_progress;
  v_progress_new := new.manual_progress;
  if new.progress_mode = 'MANUAL'
     and v_progress_new is distinct from v_progress_old
     and (abs(v_progress_new - v_progress_old) >= 20 or v_progress_new = 100) then
    perform public.notif_push(
      public.task_participants(new), 'PROGRESS_CHANGED', 'Progres pekerjaan diperbarui',
      new.title, new.id, v_actor,
      jsonb_build_object('from', v_progress_old, 'to', v_progress_new)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists notify_task_update_trg on public.tasks;
create trigger notify_task_update_trg
  after update on public.tasks
  for each row execute function public.notify_task_update();

-- ----------------------------------------------------------------------------
-- Trigger — komentar & penyebutan (@displayName)
-- ----------------------------------------------------------------------------
create or replace function public.notify_comment_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_mentions uuid[];
  v_prev uuid[];
  v_label text;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then return null; end if;

  v_label := case new.type
    when 'KENDALA' then 'Kendala baru pada pekerjaan'
    when 'TINDAK_LANJUT' then 'Tindak lanjut baru pada pekerjaan'
    else 'Komentar baru pada pekerjaan'
  end;

  -- Penyebutan: @tag pegawai (display_name atau username).
  select array_agg(distinct e.id) into v_mentions
    from public.employees e
   where e.active
     and (
       new.text ~* ('@' || regexp_replace(e.display_name, '([^\w])', '\\\1', 'g') || '\M')
       or (e.username is not null
           and new.text ~* ('@' || regexp_replace(e.username, '([^\w])', '\\\1', 'g') || '\M'))
     );

  if v_mentions is not null and array_length(v_mentions, 1) > 0 then
    perform public.notif_push(v_mentions, 'MENTIONED',
      'Anda disebut dalam komentar', v_task.title, v_task.id, new.employee_id);
  end if;

  -- Balasan: pegawai yang pernah berkomentar pada pekerjaan yang sama.
  select array_agg(distinct c.employee_id) into v_prev
    from public.task_comments c
   where c.task_id = new.task_id and c.id <> new.id;

  perform public.notif_push(
    array(
      select unnest(public.task_participants(v_task) || coalesce(v_prev, '{}'::uuid[]))
      except select unnest(coalesce(v_mentions, '{}'::uuid[]))
    ),
    case when v_prev is not null then 'COMMENT_REPLY' else 'COMMENT_ADDED' end,
    v_label, v_task.title, v_task.id, new.employee_id
  );

  return null;
end;
$$;

drop trigger if exists notify_comment_insert_trg on public.task_comments;
create trigger notify_comment_insert_trg
  after insert on public.task_comments
  for each row execute function public.notify_comment_insert();

-- ----------------------------------------------------------------------------
-- Notifikasi tenggat (dipanggil cron harian lewat /api/sync/run)
-- Idempotent: tidak menduplikasi notifikasi jenis sama < 20 jam terakhir.
-- ----------------------------------------------------------------------------
create or replace function public.generate_due_notifications(p_soon_days int default 3)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_total int := 0;
  v_type text;
  v_title text;
begin
  for v_task in
    select t.* from public.tasks t
      join public.steps s on s.id = t.step_id
     where t.deleted_at is null
       and t.archived_at is null
       and t.due_date is not null
       and s.kind <> 'DONE'
       and t.due_date <= (current_date + p_soon_days)
  loop
    if v_task.due_date < current_date then
      v_type := 'OVERDUE';
      v_title := 'Pekerjaan terlambat';
    else
      v_type := 'DUE_SOON';
      v_title := 'Tenggat pekerjaan sudah dekat';
    end if;

    if not exists (
      select 1 from public.notifications n
       where n.task_id = v_task.id and n.type = v_type
         and n.created_at > now() - interval '20 hours'
    ) then
      perform public.notif_push(
        public.task_participants(v_task), v_type, v_title, v_task.title, v_task.id, null,
        jsonb_build_object('dueDate', v_task.due_date)
      );
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.generate_due_notifications(int) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — badge & popup diperbarui tanpa reload
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
