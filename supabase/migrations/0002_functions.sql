-- ============================================================================
-- Fungsi atomik (RPC) — menjaga konsistensi operasi multi-baris di server.
-- Seluruh fungsi memverifikasi role server-side; client hanya memanggil.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Aktivasi snapshot: arsipkan ACTIVE lain pada scope sama, lalu aktifkan target.
-- Atomik dalam satu transaksi fungsi; index unik menjaga 1 aktif per scope.
-- ----------------------------------------------------------------------------
create or replace function public.activate_snapshot(p_id uuid)
returns public.distribution_snapshots
language plpgsql security definer set search_path = public
as $$
declare
  v_snap public.distribution_snapshots;
begin
  if public.current_app_role() <> 'ADMIN' then
    raise exception 'FORBIDDEN: hanya Admin';
  end if;

  select * into v_snap from public.distribution_snapshots where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND: snapshot tidak ditemukan';
  end if;

  update public.distribution_snapshots
     set status = 'ARCHIVED', updated_at = now(), version = version + 1
   where status = 'ACTIVE' and year = v_snap.year and period = v_snap.period and id <> p_id;

  update public.distribution_snapshots
     set status = 'ACTIVE', activated_at = now(), updated_at = now(), version = version + 1
   where id = p_id
   returning * into v_snap;

  return v_snap;
end;
$$;

-- ----------------------------------------------------------------------------
-- Pindah kartu: atomik memperbarui step + urutan kartu pada step sumber/tujuan.
-- ----------------------------------------------------------------------------
create or replace function public.move_task(p_task_id uuid, p_step_id uuid, p_index int)
returns public.tasks
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_from uuid;
  v_ids uuid[];
  v_i int;
begin
  if public.current_app_role() is null then
    raise exception 'FORBIDDEN: tidak terautentikasi';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.deleted_at is not null then
    raise exception 'NOT_FOUND: pekerjaan tidak ditemukan';
  end if;
  v_from := v_task.step_id;

  perform 1 from public.steps where id = p_step_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND: step tujuan tidak ditemukan';
  end if;

  -- Susun ulang step tujuan: sisipkan task pada posisi p_index.
  select coalesce(array_agg(id order by sort_order), '{}') into v_ids
    from public.tasks
   where step_id = p_step_id and deleted_at is null and id <> p_task_id;

  v_i := greatest(0, least(p_index, coalesce(array_length(v_ids, 1), 0)));
  v_ids := v_ids[1:v_i] || p_task_id || v_ids[v_i + 1:];

  update public.tasks t
     set sort_order = u.ord - 1
    from unnest(v_ids) with ordinality as u(id, ord)
   where t.id = u.id;

  -- Rapatkan urutan step sumber (bila pindah antar step).
  if v_from <> p_step_id then
    update public.tasks t
       set sort_order = s.ord - 1
      from (
        select id, row_number() over (order by sort_order) as ord
          from public.tasks
         where step_id = v_from and deleted_at is null and id <> p_task_id
      ) s
     where t.id = s.id;
  end if;

  update public.tasks
     set step_id = p_step_id, updated_at = now(), version = version + 1
   where id = p_task_id
   returning * into v_task;

  return v_task;
end;
$$;

-- ----------------------------------------------------------------------------
-- Hapus step dengan pengamanan: step berisi kartu wajib step tujuan;
-- seluruh kartu dipindahkan dulu (tidak ada kartu hilang), lalu soft delete.
-- ----------------------------------------------------------------------------
create or replace function public.delete_step_safe(p_step_id uuid, p_move_to uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
  v_remaining int;
  v_base int;
begin
  if public.current_app_role() is null then
    raise exception 'FORBIDDEN: tidak terautentikasi';
  end if;

  select count(*) into v_remaining
    from public.steps where deleted_at is null and id <> p_step_id;
  if v_remaining = 0 then
    raise exception 'VALIDATION: step terakhir tidak dapat dihapus';
  end if;

  select count(*) into v_count
    from public.tasks where step_id = p_step_id and deleted_at is null;

  if v_count > 0 then
    if p_move_to is null or p_move_to = p_step_id then
      raise exception 'VALIDATION: step berisi kartu — pilih step tujuan';
    end if;
    perform 1 from public.steps where id = p_move_to and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND: step tujuan tidak ditemukan';
    end if;

    select coalesce(max(sort_order) + 1, 0) into v_base
      from public.tasks where step_id = p_move_to and deleted_at is null;

    update public.tasks t
       set step_id = p_move_to,
           sort_order = v_base + s.ord - 1,
           updated_at = now(),
           version = version + 1
      from (
        select id, row_number() over (order by sort_order) as ord
          from public.tasks
         where step_id = p_step_id and deleted_at is null
      ) s
     where t.id = s.id;
  end if;

  update public.steps
     set deleted_at = now(), version = version + 1
   where id = p_step_id;
end;
$$;

grant execute on function public.activate_snapshot(uuid) to authenticated;
grant execute on function public.move_task(uuid, uuid, int) to authenticated;
grant execute on function public.delete_step_safe(uuid, uuid) to authenticated;
