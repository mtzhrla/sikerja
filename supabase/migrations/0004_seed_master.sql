-- ============================================================================
-- 0004 — Seed master: 25 pegawai (Docs/09 §P) + sumber spreadsheet 2026 (§S, §V)
-- Idempotent: memakai UUID tetap + ON CONFLICT DO NOTHING; aman dijalankan ulang.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Pegawai (tag board satu kata & unik; NIP null bila tidak tersedia)
-- ----------------------------------------------------------------------------
insert into public.employees
  (id, full_name, display_name, initials, color, nip, position, team, sort_order, active)
values
  ('a1000000-0000-4000-8000-000000000001', 'Rakean Sundayana, S.Pd., M.A', 'Rakean', 'RS', 'blue',    '198102082005011003', 'Ketua Tim Kerja Kemitraan dan Tata Kelola Program', 'Puslapdik', 0,  true),
  ('a1000000-0000-4000-8000-000000000002', 'Thoriq Rozaq Rosyadi',         'Thoriq', 'TR', 'emerald', '199412252022031015', 'Penelaah Teknis Kebijakan',        'Puslapdik', 1,  true),
  ('a1000000-0000-4000-8000-000000000003', 'Tri Hesti Wahyudiati',         'Hesti',  'TH', 'rose',    '197008102007102001', 'Penelaah Teknis Kebijakan',        'Puslapdik', 2,  true),
  ('a1000000-0000-4000-8000-000000000004', 'Erna Fitriawati Novi Hastuti', 'Erna',   'EF', 'violet',  '198309252008122002', 'Penelaah Teknis Kebijakan',        'Puslapdik', 3,  true),
  ('a1000000-0000-4000-8000-000000000005', 'Yusna Yurita',                 'Yusna',  'YY', 'teal',    '198209242014042001', 'Penelaah Teknis Kebijakan',        'Puslapdik', 4,  true),
  ('a1000000-0000-4000-8000-000000000006', 'Sucianingsih',                 'Sucianingsih', 'SC', 'amber', '1990031020015042003', 'Perencana Ahli Pertama',      'Puslapdik', 5,  true),
  ('a1000000-0000-4000-8000-000000000007', 'Entin Jainingsih',             'Entin',  'EJ', 'fuchsia', '196903111990022001', 'Pengadministrasian Perkantoran',   'Puslapdik', 6,  true),
  ('a1000000-0000-4000-8000-000000000008', 'Suyadi',                       'Suyadi', 'SY', 'sky',     '196907151994031010', 'Pengadministrasian Perkantoran',   'Puslapdik', 7,  true),
  ('a1000000-0000-4000-8000-000000000009', 'Drajat Sujarwo',               'Drajat', 'DS', 'orange',  '198102032007011001', 'Pengolah Data dan Informasi',      'Puslapdik', 8,  true),
  ('a1000000-0000-4000-8000-000000000010', 'Sirda Eldita',                 'Sirda',  'SE', 'blue',    '199204152018012002', 'Penelaah Teknis Kebijakan',        'Puslapdik', 9,  true),
  ('a1000000-0000-4000-8000-000000000011', 'Linda Eri Jayanti',            'Linda',  'LJ', 'emerald', '199101032025212048', 'Penata Layanan Operasional',       'Puslapdik', 10, true),
  ('a1000000-0000-4000-8000-000000000012', 'Rendy Pamungkas',              'Rendy',  'RP', 'rose',    '199105062025211055', 'Penata Layanan Operasional',       'Puslapdik', 11, true),
  ('a1000000-0000-4000-8000-000000000013', 'Muhammad Nur',                 'Nur',    'MN', 'violet',  '199503102025211034', 'Penata Layanan Operasional',       'Puslapdik', 12, true),
  ('a1000000-0000-4000-8000-000000000014', 'Muhammad Rifai',               'Rifai',  'MR', 'teal',    '199608292025211031', 'Penata Layanan Operasional',       'Puslapdik', 13, true),
  ('a1000000-0000-4000-8000-000000000015', 'Lina Fitriani',                'Lina',   'LF', 'amber',   '198602032025212037', 'Pengadministrasi Perkantoran',     'Puslapdik', 14, true),
  ('a1000000-0000-4000-8000-000000000016', 'Mulkirom',                     'Mulkirom', 'MK', 'fuchsia', null, '', 'Pusat Layanan Pembiayaan Pendidikan', 15, true),
  ('a1000000-0000-4000-8000-000000000017', 'Eka Dewi Pertiwi',             'Eka',    'ED', 'sky',     null, '', 'Pusat Layanan Pembiayaan Pendidikan', 16, true),
  ('a1000000-0000-4000-8000-000000000018', 'Santika Indah Pratiwi',        'Santika', 'SP', 'orange', null, '', 'Pusat Layanan Pembiayaan Pendidikan', 17, true),
  ('a1000000-0000-4000-8000-000000000019', 'Vyja Tona Rapolo',             'Vyja',   'VR', 'blue',    null, '', 'Pusat Layanan Pembiayaan Pendidikan', 18, true),
  ('a1000000-0000-4000-8000-000000000020', 'Achmad Ulfi',                  'Ulfi',   'AU', 'emerald', null, '', 'Pusat Layanan Pembiayaan Pendidikan', 19, true),
  ('a1000000-0000-4000-8000-000000000021', 'Dhani Prayudi',                'Dhani',  'DP', 'rose',    null, '', 'Pusat Layanan Pembiayaan Pendidikan', 20, true),
  ('a1000000-0000-4000-8000-000000000022', 'Sendi Irjansaputra',           'Sendi',  'SD', 'violet',  null, '', 'Pusat Layanan Pembiayaan Pendidikan', 21, true),
  ('a1000000-0000-4000-8000-000000000023', 'Fajar Robbyana',               'Fajar',  'FR', 'teal',    null, '', 'Pusat Layanan Pembiayaan Pendidikan', 22, true),
  ('a1000000-0000-4000-8000-000000000024', 'Ferry Widiarta',               'Ferry',  'FW', 'amber',   null, '', 'Pusat Layanan Pembiayaan Pendidikan', 23, true),
  ('a1000000-0000-4000-8000-000000000025', 'Muhammad Lazuardy Kamil',      'Kamil',  'MZ', 'fuchsia', null, '', 'Pusat Layanan Pembiayaan Pendidikan', 24, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Sumber spreadsheet 2026 (metadata; sinkronisasi menunggu Google terhubung)
-- ----------------------------------------------------------------------------
insert into public.spreadsheet_sources
  (id, source_type, year, name, spreadsheet_url, spreadsheet_id, is_active, is_primary)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'pip_progress', 2026, 'Progres Penyaluran SK 2026',
    'https://docs.google.com/spreadsheets/d/11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8/edit',
    '11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8',
    true, true
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'activity_plan', 2026, 'Rencana Kegiatan 2026',
    'https://docs.google.com/spreadsheets/d/16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98/edit',
    '16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98',
    true, true
  )
on conflict (id) do nothing;

-- Sheet binding: sumber penyaluran membaca DUA sheet; Rencana Kegiatan satu.
-- mapping_status tetap BELUM_DIKONFIRMASI — dikonfirmasi Admin setelah
-- header terdeteksi (tidak mengaktifkan mapping palsu, Docs/09 §T).
insert into public.spreadsheet_sheet_bindings
  (id, source_id, binding_type, sheet_name, header_row, data_start_row, mapping_status)
values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'detail_realisasi',   'Pemberian',      1, 2, 'BELUM_DIKONFIRMASI'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'allocation_summary', 'REKAP PROGRESS', 1, 2, 'BELUM_DIKONFIRMASI'),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002', 'activity_rows',      'Sheet1',         1, 2, 'BELUM_DIKONFIRMASI')
on conflict (id) do nothing;
