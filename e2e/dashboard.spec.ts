import { expect, test } from '@playwright/test';
import { collectConsoleErrors, loginAsUser } from './helpers';

test.describe('dashboard', () => {
  test('KPI penyaluran, penerbitan SK, progres jenjang, dan rekap tampil', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await loginAsUser(page);

    await expect(page.getByRole('heading', { name: 'Penyaluran PIP' })).toBeVisible();
    // Periode seed dipilih eksplisit — periode aktif default bisa berasal dari
    // sinkronisasi Google Sheets produksi (angka berubah setiap hari).
    await page.getByLabel('Periode').selectOption('Termin 1');
    // KPI ringkas (seluruh jenjang) — tanpa duplikasi
    await expect(page.getByText('18.000.000').first()).toBeVisible();
    await expect(page.getByText('Alokasi', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('SK Pemberian', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Progres Siswa', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Progres Dana', { exact: true }).first()).toBeVisible();
    // Chart & panel unik
    await expect(page.getByText('Rekap SK per Bulan')).toBeVisible();
    await expect(page.getByText('Jumlah SK per Jenjang')).toBeVisible();
    // Rekap jenjang + kolom jumlah SK unik
    await expect(page.getByText('Detail Rekap per Jenjang')).toBeVisible();
    const table = page.locator('table');
    await expect(table.getByText('Jumlah SK')).toBeVisible();
    for (const j of ['SD', 'SMP', 'SMA', 'SMK']) {
      await expect(table.getByRole('cell', { name: j, exact: true })).toBeVisible();
    }
    // Status pembaruan data
    await expect(page.getByText(/Terakhir diperbarui/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('filter jenjang & periode bekerja', async ({ page }) => {
    await loginAsUser(page);
    // Periode seed (deterministik) + filter jenjang SD → KPI alokasi berubah
    await page.getByLabel('Periode').selectOption('Termin 1');
    await page.getByLabel('Jenjang', { exact: true }).selectOption('SD');
    await expect(page.getByText('10.400.000').first()).toBeVisible();
    // Periode tanpa snapshot aktif → empty state
    await page.getByLabel('Periode').selectOption('Termin 2');
    await expect(page.getByText('Belum ada data penyaluran')).toBeVisible();
    // Kembali ke periode seed
    await page.getByLabel('Periode').selectOption('Termin 1');
    await expect(page.getByText('10.400.000').first()).toBeVisible();
  });

  test('Dashboard tidak lagi menampilkan seksi pekerjaan tim', async ({ page }) => {
    await loginAsUser(page);
    await expect(page.getByRole('heading', { name: 'Penyaluran PIP' })).toBeVisible();
    // Seluruh elemen "Pekerjaan Tim" pindah ke Pekerjaan › Ringkasan
    await expect(page.getByText('Pekerjaan Tim')).toHaveCount(0);
    await expect(page.getByText('Total Pekerjaan Aktif')).toHaveCount(0);
    await expect(page.getByText('Lihat ringkasan lengkap')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Buka board dengan filter step/ })).toHaveCount(
      0,
    );
  });

  test('halaman Pekerjaan menampilkan indikator cepat, bukan tab Ringkasan', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/pekerjaan');
    const indikator = page.getByRole('group', { name: 'Indikator cepat' });
    await expect(indikator.getByRole('button', { name: /Terlambat/ })).toBeVisible();
    await expect(indikator.getByRole('button', { name: /Mendekati Tenggat/ })).toBeVisible();
    await expect(indikator.getByRole('button', { name: /Terhambat/ })).toBeVisible();
    await expect(indikator.getByRole('button', { name: /Tanpa PIC/ })).toBeVisible();
  });

  test('tidak ada data individual siswa', async ({ page }) => {
    await loginAsUser(page);
    const body = (await page.textContent('body')) ?? '';
    for (const forbidden of ['NISN', 'NIK', 'Virtual Account', 'No. Rekening']) {
      expect(body).not.toContain(forbidden);
    }
  });
});
