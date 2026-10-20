import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { USER_USERNAME, loginAsAdmin, loginAsUser } from './helpers';

async function makeXlsx(rows: Array<Array<string | number>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow([
    'Jenjang',
    'Alokasi Siswa',
    'Alokasi Anggaran',
    'SK Siswa',
    'SK Anggaran',
    'Siswa Tersalur',
    'Dana Tersalur',
  ]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const VALID_ROWS: Array<Array<string | number>> = [
  ['SD', 1000, 450_000_000, 900, 405_000_000, 500, 225_000_000],
  ['SMP', 500, 375_000_000, 400, 300_000_000, 200, 150_000_000],
  ['SMA', 300, 540_000_000, 250, 450_000_000, 100, 180_000_000],
  ['SMK', 200, 360_000_000, 180, 324_000_000, 80, 144_000_000],
];

test.describe('admin', () => {
  test('Pusat Admin menampilkan modul utama non-integrasi dan dapat dinavigasi', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    // Pusat Admin: modul tampil sebagai card link pada hub launcher dengan
    // bahasa operasional (tanpa istilah teknis backend).
    const hub = page.locator('#konten-utama');
    for (const label of [
      /^Ringkasan/,
      /^Integrasi Data/,
      /^Pegawai/,
      /^Pengaturan Pekerjaan/,
      /^Data Terhapus/,
      /^Riwayat Aktivitas/,
      /^Pengaturan Aplikasi/,
    ]) {
      await expect(hub.getByRole('link', { name: label })).toBeVisible();
    }
    await hub.getByRole('link', { name: /^Pegawai/ }).click();
    await expect(page).toHaveURL(/\/admin\/pegawai/);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Pegawai');
  });

  test('impor Excel: upload → mapping → preview → simpan & aktifkan', async ({ page }) => {
    test.skip(true, 'Integrasi spreadsheet tidak dikerjakan pada tahap ini.');
    await loginAsAdmin(page);
    await page.goto('/admin/integrasi');
    await page.getByRole('tab', { name: 'Snapshot Penyaluran' }).click();
    await page.getByRole('button', { name: 'Unggah data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unggah Data Penyaluran' });

    await dialog.getByLabel('Pilih berkas Excel').setInputFiles({
      name: 'penyaluran-uji.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await makeXlsx(VALID_ROWS),
    });

    // Mapping tertebak otomatis dari header
    await expect(dialog.getByText('4 baris data')).toBeVisible();
    await dialog.getByRole('button', { name: 'Lanjut ke pratinjau' }).click();

    // Preview + validasi lolos
    await expect(dialog.getByText('Validasi lolos — data siap disimpan.')).toBeVisible();
    await dialog.getByLabel(/Tahun/).fill('2027');
    await dialog.getByLabel(/Periode/).selectOption('Termin 1');
    await dialog.getByRole('button', { name: 'Simpan & aktifkan' }).click();
    await expect(page.getByText('Data penyaluran diaktifkan.')).toBeVisible();

    // Tampil di histori sebagai Aktif
    const row = page.locator('tr', { hasText: '2027 · Termin 1' });
    await expect(row.getByText('Aktif')).toBeVisible();
  });

  test('impor Excel: data invalid tidak dapat disimpan/diaktifkan', async ({ page }) => {
    test.skip(true, 'Integrasi spreadsheet tidak dikerjakan pada tahap ini.');
    await loginAsAdmin(page);
    await page.goto('/admin/integrasi');
    await page.getByRole('tab', { name: 'Snapshot Penyaluran' }).click();
    await page.getByRole('button', { name: 'Unggah data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unggah Data Penyaluran' });
    await dialog.getByLabel('Pilih berkas Excel').setInputFiles({
      name: 'penyaluran-invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await makeXlsx([
        ['SLB', 100, 1000, 50, 500, 20, 200], // jenjang tidak valid
        ['SD', -10, 1000, 50, 500, 20, 200], // negatif
      ]),
    });
    await dialog.getByRole('button', { name: 'Lanjut ke pratinjau' }).click();
    await expect(dialog.getByText(/error validasi/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Simpan & aktifkan' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Simpan draft' })).toBeDisabled();
  });

  test('snapshot: batalkan aktivasi lalu pulihkan (aktifkan kembali)', async ({ page }) => {
    test.skip(true, 'Integrasi/snapshot spreadsheet tidak dikerjakan pada tahap ini.');
    await loginAsAdmin(page);
    await page.goto('/admin/integrasi');
    await page.getByRole('tab', { name: 'Snapshot Penyaluran' }).click();
    const activeRow = page
      .locator('tr', { hasText: '2026 · Termin 1' })
      .filter({ has: page.getByText('Aktif', { exact: true }) });
    await expect(activeRow).toBeVisible();
    await activeRow.getByRole('button', { name: 'Batalkan' }).click();
    await page.getByRole('button', { name: 'Batalkan aktivasi' }).click();
    await expect(page.getByText('Aktivasi dibatalkan.')).toBeVisible();
    // Aktifkan kembali (pulihkan)
    const draftRow = page.locator('tr', { hasText: '2026 · Termin 1' }).filter({ hasText: 'Draft' }).first();
    await draftRow.getByRole('button', { name: /^Aktifkan/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aktifkan' }).click();
    await expect(page.getByText('Snapshot diaktifkan.')).toBeVisible();
  });

  test('pegawai: tambah & nonaktifkan', async ({ page }) => {
    test.skip(true, 'Tidak membuat data dummy admin pada tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/admin/pegawai');
    await page.getByRole('button', { name: 'Tambah pegawai' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah Pegawai' });
    await dialog.getByLabel(/Nama lengkap/).fill('Budi Santoso');
    await dialog.getByLabel('Jabatan').fill('Analis Muda');
    await dialog.getByLabel('Tim').fill('Penyaluran');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Pegawai ditambahkan.')).toBeVisible();
    await expect(page.locator('#konten-utama').getByText('Budi Santoso')).toBeVisible();
    // Nonaktifkan
    await page.getByRole('switch', { name: 'Status aktif Budi' }).click();
    await expect(page.getByText('Budi dinonaktifkan.')).toBeVisible();
  });

  test('kategori: tambah baru & tolak duplikat', async ({ page }) => {
    test.skip(true, 'Tidak membuat data dummy admin pada tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/admin/board');
    const kategoriCard = page.locator('div', { hasText: 'Pengelompokan utama pekerjaan.' }).first();
    void kategoriCard;
    await page.getByRole('button', { name: 'Tambah' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Tambah Kategori' });
    await dialog.getByLabel(/Nama kategori/).fill('Monitoring & Evaluasi');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Berhasil ditambahkan.')).toBeVisible();
    await expect(page.locator('#konten-utama').getByText('Monitoring & Evaluasi')).toBeVisible();
    // Duplikat ditolak
    await page.getByRole('button', { name: 'Tambah' }).first().click();
    await page
      .getByRole('dialog', { name: 'Tambah Kategori' })
      .getByLabel(/Nama kategori/)
      .fill('Penyaluran');
    await page
      .getByRole('dialog', { name: 'Tambah Kategori' })
      .getByRole('button', { name: 'Simpan' })
      .click();
    await expect(page.getByText('"Penyaluran" sudah ada.')).toBeVisible();
  });

  test('template: buat template baru dengan checklist', async ({ page }) => {
    test.skip(true, 'Tidak membuat data dummy admin pada tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/admin/board');
    await page.getByRole('tab', { name: 'Template Pekerjaan' }).click();
    await page.getByRole('button', { name: 'Tambah template' }).click();
    const dialog = page.getByRole('dialog', { name: 'Template Baru' });
    await dialog.getByLabel(/Nama template/).fill('Laporan bulanan');
    await dialog.getByLabel(/Judul pekerjaan/).fill('Laporan bulanan [bulan]');
    await dialog.getByLabel(/Target relatif/).fill('5');
    await dialog.getByLabel('Nama kelompok checklist baru').fill('Penyusunan');
    await dialog.getByRole('button', { name: 'Kelompok' }).click();
    await dialog.getByLabel('Tambah item pada Penyusunan').fill('Kompilasi data');
    await dialog.getByLabel('Tambah item pada Penyusunan').press('Enter');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Template dibuat.')).toBeVisible();
    await expect(
      page.locator('#konten-utama').getByText('Laporan bulanan', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('1 item checklist')).toBeVisible();
  });

  test('data terhapus: pulihkan & hapus permanen dengan konfirmasi', async ({ page }) => {
    test.skip(true, 'Tidak menjalankan hapus permanen pada tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/admin/data-terhapus');
    // Seed: satu pekerjaan terhapus dengan alasan
    const row = page.locator('li', { hasText: 'Uji coba formulir pengumpulan data lama' });
    await expect(row).toBeVisible();
    await expect(row.getByText(/Alasan: Duplikat/)).toBeVisible();
    // Hapus permanen (hanya Admin) dengan konfirmasi
    await row.getByRole('button', { name: 'Hapus permanen' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Hapus permanen' }).click();
    await expect(page.getByText('Dihapus permanen.')).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test('audit log: filter dan detail sebelum/sesudah', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/audit');
    await expect(page.getByRole('columnheader', { name: 'Pelaku' })).toBeVisible();
    // Filter aksi LOGIN
    await page.getByLabel('Aksi').selectOption('LOGIN');
    await expect(page.locator('tbody tr').first()).toContainText('LOGIN');
    // Detail expand
    await page.getByLabel('Aksi').selectOption('');
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Sebelum', { exact: true })).toBeVisible();
    await expect(page.getByText('Sesudah', { exact: true })).toBeVisible();
  });

  test('pengaturan: ubah nama aplikasi & ambang; tampil di sidebar', async ({ page }) => {
    test.skip(true, 'Tidak mengubah pengaturan produksi pada tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/admin/pengaturan');
    await page.getByLabel(/Nama aplikasi/).fill('Dashboard PIP Puslapdik');
    await page.getByLabel(/Ambang tidak diperbarui/).fill('10');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
    await expect(page.locator('aside').getByText('Dashboard PIP Puslapdik')).toBeVisible();
  });

  test('pengaturan: ganti password User berlaku untuk login berikutnya', async ({ page }) => {
    test.skip(true, 'Tidak mengganti password akun Supabase Auth.');
    await loginAsAdmin(page);
    await page.goto('/admin/pengaturan');
    await page.getByLabel('Password baru').fill('timpip-2026-baru');
    await page.getByLabel('Ulangi password').fill('timpip-2026-baru');
    await page.getByRole('button', { name: 'Ganti password' }).click();
    await expect(page.getByText('Password akun User diganti.')).toBeVisible();
    const actorDialog = page.getByRole('dialog', { name: 'Siapa yang sedang bekerja?' });
    try {
      await actorDialog.waitFor({ state: 'visible', timeout: 1500 });
      await actorDialog.getByRole('button', { name: /Sucianingsih/ }).click();
      await expect(actorDialog).toBeHidden();
    } catch {
      // Dialog pelaku kadang tidak muncul bila actor perangkat masih valid.
    }
    // Logout lalu login user dengan password baru
    await page.getByRole('button', { name: 'Menu pengguna' }).click();
    await page.getByRole('menuitem', { name: 'Keluar' }).click();
    await page.getByLabel('NIP atau Username').fill(USER_USERNAME);
    await page.getByLabel('Password', { exact: true }).fill('timpip-2026-baru');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('User tidak melihat menu Admin (guard tetap berlaku)', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/admin/pengaturan');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  });
});
