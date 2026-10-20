import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers';

function column(page: Page, stepName: string) {
  return page.getByRole('region', { name: `Step ${stepName}`, exact: true });
}

test.describe('board pekerjaan', () => {
  test('board kanban tampil dengan step dan kartu seed', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await expect(page.getByText('Board Pekerjaan Tim PIP')).toBeVisible();
    for (const name of ['Will Do', 'To Do', 'On Progress', 'Done']) {
      await expect(column(page, name)).toBeVisible();
    }
    await expect(
      column(page, 'On Progress').getByText('Finalisasi SK Pemberian PIP Termin 2'),
    ).toBeVisible();
  });

  test('judul board dapat diubah', async ({ page }) => {
    test.skip(true, 'Di luar cakupan E2E tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await page.getByRole('button', { name: 'Ubah judul board' }).click();
    await page.getByRole('textbox', { name: 'Judul board' }).fill('Board PIP 2026');
    await page.getByRole('button', { name: 'Simpan judul' }).click();
    await expect(page.getByText('Judul board diperbarui.')).toBeVisible();
    await expect(page.getByText('Board PIP 2026')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Board PIP 2026')).toBeVisible();
  });

  test('membuat pekerjaan baru (multi-PIC) dan tampil di step tujuan', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await page.getByRole('button', { name: 'Pekerjaan baru' }).click();
    const dialog = page.getByRole('dialog', { name: 'Pekerjaan Baru' });
    await dialog.getByLabel(/Judul pekerjaan/).fill('Uji E2E — surat undangan rapat');
    await dialog.getByLabel(/^Step/).selectOption({ label: 'To Do' });
    await dialog.getByLabel('Prioritas').selectOption({ label: 'Tinggi' });
    // PIC utama — multi-select dengan pencarian & checkbox (komponen sama dgn tambahan)
    await dialog.getByLabel('PIC utama').click();
    await page.getByRole('checkbox', { name: 'Tri Hesti Wahyudiati' }).click();
    await page.keyboard.press('Escape');
    // PIC tambahan
    await dialog.getByLabel('PIC tambahan').click();
    await page.getByRole('checkbox', { name: 'Thoriq Rozaq Rosyadi' }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Buat pekerjaan' }).click();
    await expect(page.getByText('Pekerjaan dibuat.')).toBeVisible();
    await expect(
      column(page, 'To Do').getByText('Uji E2E — surat undangan rapat'),
    ).toBeVisible();
  });

  test('detail: checklist memengaruhi progres otomatis', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await column(page, 'On Progress')
      .getByText('Finalisasi SK Pemberian PIP Termin 2')
      .click();
    const dialog = page.getByRole('dialog', { name: /Finalisasi SK Pemberian/ });
    await expect(dialog).toBeVisible();
    // 4/6 selesai (67%) → centang satu item → 5/6 (83%)
    await expect(dialog.getByRole('tab', { name: /Checklist \(4\/6\)/ })).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'Paraf biro hukum' }).click();
    await expect(dialog.getByRole('tab', { name: /Checklist \(5\/6\)/ })).toBeVisible();
  });

  test('detail: komentar, kendala, dan tindak lanjut tercatat', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await column(page, 'To Do').getByText('Verifikasi usulan penerima tahap susulan').click();
    const dialog = page.getByRole('dialog', { name: /Verifikasi usulan/ });
    await dialog.getByRole('tab', { name: /Catatan/ }).click();
    await dialog.getByRole('radio', { name: 'Kendala' }).click();
    await dialog.getByLabel('Isi catatan').fill('Dokumen dari dinas belum lengkap.');
    await dialog.getByRole('button', { name: 'Kirim' }).click();
    await expect(page.getByText('Catatan ditambahkan.')).toBeVisible();
    await expect(dialog.getByText('Dokumen dari dinas belum lengkap.')).toBeVisible();
    // Riwayat mencatat
    await dialog.getByRole('tab', { name: 'Riwayat' }).click();
    await expect(dialog.getByText(/menambah|membuat/).first()).toBeVisible();
  });

  test('kartu dapat difokuskan dan dipindahkan antar step lewat detail', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    const card = column(page, 'Will Do').getByRole('button', {
      name: 'Buka pekerjaan Permintaan data penyaluran dari Komisi X DPR RI',
    });
    await expect(card).toBeVisible();
    await card.focus();
    await expect(card).toBeFocused();
    await card.click();
    const dialog = page.getByRole('dialog', {
      name: /Permintaan data penyaluran dari Komisi X DPR RI/,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^Step/).selectOption({ label: 'To Do' });
    await expect(page.getByText('Kartu dipindahkan.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      column(page, 'To Do').getByText('Permintaan data penyaluran dari Komisi X DPR RI'),
    ).toBeVisible();
  });

  test('detail: pindah step lewat select (akses keyboard)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await column(page, 'Will Do').getByText('Penyusunan juknis pencairan kolektif').click();
    const dialog = page.getByRole('dialog', { name: /Penyusunan juknis/ });
    await dialog.getByLabel(/^Step/).selectOption({ label: 'On Progress' });
    await expect(page.getByText('Kartu dipindahkan.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      column(page, 'On Progress').getByText('Penyusunan juknis pencairan kolektif'),
    ).toBeVisible();
  });

  test('step: tambah, ubah nama, dan hapus step kosong', async ({ page }) => {
    test.skip(true, 'Di luar cakupan E2E tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    // Tambah
    await page.getByRole('button', { name: 'Tambah step' }).click();
    await page.getByLabel(/Nama step/).fill('Review');
    await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Step ditambahkan.')).toBeVisible();
    await expect(column(page, 'Review')).toBeVisible();
    // Ubah nama
    await column(page, 'Review').getByRole('button', { name: 'Menu step Review' }).click();
    await page.getByRole('menuitem', { name: 'Ubah step' }).click();
    await page.getByLabel(/Nama step/).fill('Reviu Pimpinan');
    await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
    await expect(column(page, 'Reviu Pimpinan')).toBeVisible();
    // Hapus (kosong)
    await column(page, 'Reviu Pimpinan')
      .getByRole('button', { name: 'Menu step Reviu Pimpinan' })
      .click();
    await page.getByRole('menuitem', { name: 'Hapus step' }).click();
    await page.getByRole('button', { name: 'Hapus step', exact: true }).click();
    await expect(page.getByText('Step "Reviu Pimpinan" dihapus.')).toBeVisible();
    await expect(column(page, 'Reviu Pimpinan')).toHaveCount(0);
  });

  

  test('arsip: arsipkan dari detail, buka lewat menu ⋯, lalu pulihkan', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await column(page, 'Done').getByText('Rapat koordinasi teknis dengan bank penyalur').click();
    const dialog = page.getByRole('dialog', { name: /Rapat koordinasi teknis/ });
    await dialog.getByRole('button', { name: 'Arsipkan' }).click();
    await expect(page.getByText('Pekerjaan diarsipkan.')).toBeVisible();

    // Arsip BUKAN tab utama — dibuka lewat menu ⋯.
    await page.getByRole('button', { name: 'Menu lainnya' }).click();
    await page.getByRole('menuitem', { name: /Pekerjaan diarsipkan/ }).click();
    const modal = page.getByRole('dialog', { name: 'Pekerjaan diarsipkan' });
    await expect(modal.getByText('Rapat koordinasi teknis dengan bank penyalur')).toBeVisible();
    await modal
      .locator('li', { hasText: 'Rapat koordinasi teknis' })
      .getByRole('button', { name: 'Pulihkan' })
      .click();
    await expect(page.getByText('Dipulihkan dari arsip.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      column(page, 'Done').getByText('Rapat koordinasi teknis dengan bank penyalur'),
    ).toBeVisible();
  });

  test('halaman Pekerjaan tidak lagi memiliki tab Ringkasan / Arsip / Review', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    const cakupan = page.getByRole('group', { name: 'Cakupan pekerjaan' });
    await expect(cakupan.getByRole('button', { name: 'Semua Pekerjaan' })).toBeVisible();
    await expect(cakupan.getByRole('button', { name: 'Pekerjaan Saya' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ringkasan', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Arsip \(/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Menunggu Review/ })).toHaveCount(0);
    // Indikator cepat menggantikan card ringkasan per step.
    const indikator = page.getByRole('group', { name: 'Indikator cepat' });
    await expect(indikator.getByRole('button', { name: /Terlambat/ })).toBeVisible();
    await expect(indikator.getByRole('button', { name: /Tanpa PIC/ })).toBeVisible();
  });

  test('Pekerjaan Saya memakai record yang sama dengan Semua Pekerjaan', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan?scope=mine');
    await expect(page).toHaveURL(/scope=mine/);
    // Board & step yang sama (bukan board terpisah per pegawai).
    await expect(page.getByText('Board Pekerjaan Tim PIP')).toBeVisible();
    await page.getByRole('button', { name: 'Semua Pekerjaan' }).click();
    await expect(page).not.toHaveURL(/scope=mine/);
    await expect(page.getByText('Board Pekerjaan Tim PIP')).toBeVisible();
  });

  

  test('hapus pekerjaan (soft delete) dengan alasan', async ({ page }) => {
    test.skip(true, 'Di luar cakupan E2E tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await column(page, 'To Do').getByText('Monitoring pengaduan layanan PIP minggu ke-29').click();
    const dialog = page.getByRole('dialog', { name: /Monitoring pengaduan/ });
    await dialog.getByRole('button', { name: 'Hapus', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: /Hapus "Monitoring pengaduan/ });
    await confirm.getByLabel(/Alasan penghapusan/).fill('Sudah tidak diperlukan (uji E2E)');
    await confirm.getByRole('button', { name: 'Hapus pekerjaan' }).click();
    await expect(page.getByText('Pekerjaan dihapus.')).toBeVisible();
    await expect(
      column(page, 'To Do').getByText('Monitoring pengaduan layanan PIP minggu ke-29'),
    ).toHaveCount(0);
  });

  test('lampiran: unggah txt berhasil, executable ditolak', async ({ page }) => {
    test.skip(true, 'Di luar cakupan E2E tahap deploy awal.');
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await column(page, 'On Progress').getByText('Aktivasi rekening siswa SMA wilayah timur').click();
    const dialog = page.getByRole('dialog', { name: /Aktivasi rekening/ });
    await dialog.getByRole('tab', { name: /Lampiran/ }).click();
    // Unggah txt (diizinkan)
    await dialog.getByLabel('Unggah lampiran').setInputFiles({
      name: 'catatan-aktivasi.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('catatan uji e2e'),
    });
    await expect(page.getByText('Lampiran diunggah.')).toBeVisible();
    await expect(dialog.getByText('catatan-aktivasi.txt')).toBeVisible();
    // Executable ditolak
    await dialog.getByLabel('Unggah lampiran').setInputFiles({
      name: 'virus.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });
    await expect(page.getByText('Unggah gagal')).toBeVisible();
  });

  test('realtime antar-sesi: pekerjaan baru tampil tanpa reload', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    await loginAsAdmin(page1);
    await page1.goto('/pekerjaan');
    const page2 = await context2.newPage();
    await loginAsAdmin(page2);
    await page2.goto('/pekerjaan');
    await expect(page2.getByText('Board Pekerjaan Tim PIP')).toBeVisible();
    // Tab 2 di depan agar tidak terkena throttling tab background headless;
    // seluruh aksi berikutnya terjadi di tab 1 (latar belakang).
    await page2.bringToFront();

    // Buat pekerjaan di tab 1
    await page1.getByRole('button', { name: 'Pekerjaan baru' }).click();
    const dialog = page1.getByRole('dialog', { name: 'Pekerjaan Baru' });
    await dialog.getByLabel(/Judul pekerjaan/).fill('Uji realtime antar-tab');
    await dialog.getByLabel(/^Step/).selectOption({ label: 'Will Do' });
    await dialog.getByRole('button', { name: 'Buat pekerjaan' }).click();
    await expect(page1.getByText('Pekerjaan dibuat.')).toBeVisible();

    // Tab 2 menerima tanpa reload
    await expect(column(page2, 'Will Do').getByText('Uji realtime antar-tab')).toBeVisible({
      timeout: 10_000,
    });
    await context1.close();
    await context2.close();
  });
});
