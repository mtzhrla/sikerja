import { expect, test } from '@playwright/test';
import { IS_SUPABASE_E2E, loginAsAdmin, loginAsUser, submitLogin } from './helpers';

/**
 * Akun pegawai, login NIP/username, notifikasi, & profil.
 *
 * Uji ini hanya berjalan pada mode Supabase (akun pegawai nyata). Uji TIDAK
 * mengganti password akun produksi mana pun. Password default seluruh akun
 * adalah 12345678 dan pengguna langsung masuk tanpa dipaksa ganti password.
 */
test.describe('akun pegawai & login NIP/username', () => {
  test.skip(!IS_SUPABASE_E2E, 'Butuh akun pegawai pada Supabase.');

  test('pesan gagal login bersifat generik (anti-enumerasi akun)', async ({ page }) => {
    await submitLogin(page, 'pegawai-tidak-ada', 'apapun123');
    const pesanTidakAda = await page.getByRole('alert').textContent();
    await submitLogin(page, 'nur', 'password-salah-sekali');
    const pesanSalahPassword = await page.getByRole('alert').textContent();
    expect(pesanTidakAda).toBe(pesanSalahPassword);
    expect(pesanTidakAda).toContain('NIP/username atau password salah');
  });

  test('halaman login memakai field "NIP atau Username"', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('NIP atau Username')).toBeVisible();
    await expect(page.getByRole('button', { name: /Tampilkan password/ })).toBeVisible();
  });

  test('Admin melihat modul Pengguna & Akses', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: /Pengguna & Akses/ })).toBeVisible();
    await page.goto('/admin/pengguna');
    await expect(page.getByRole('heading', { name: 'Pengguna & Akses' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Buat akun untuk semua pegawai aktif/ }),
    ).toBeVisible();
  });

  test('Daftar Pegawai hanya SATU tampilan — tanpa tab Struktur Tim', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/daftar-pegawai');
    const nav = page.getByRole('navigation', { name: 'Menu' });
    await expect(nav.getByRole('link', { name: 'Tim Kerja' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Notifikasi' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Profil' })).toHaveCount(0);

    // Tidak ada segmented control / daftar kedua dengan data yang sama.
    await expect(page.getByRole('button', { name: 'Struktur Tim' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Semua Pegawai' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Tampilan daftar pegawai' })).toHaveCount(0);
    await expect(page.locator('#konten-utama').getByRole('list')).toHaveCount(1);

    // Tingkat Pimpinan/Staf tetap terbaca lewat badge & filter tingkat.
    await expect(page.getByLabel('Tingkat')).toBeVisible();
    await expect(
      page
        .locator('#konten-utama')
        .getByRole('button', { name: /^Buka profil/ })
        .first()
        .getByText(/^(Pimpinan|Staf)$/),
    ).toBeVisible();
  });

  test('foto/nama pegawai membuka halaman Profil Pegawai', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/daftar-pegawai');
    await page.getByRole('button', { name: /Buka profil/ }).first().click();
    await expect(page).toHaveURL(/\/pegawai\//);
    await expect(page.getByRole('heading', { name: 'Profil Pegawai' })).toBeVisible();
    await expect(page.getByText('Ringkasan pekerjaan')).toBeVisible();
    await expect(page.getByText('Pekerjaan terkait')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Saringan pekerjaan' })).toHaveCount(0);

    const activeCard = page.getByRole('button', { name: /Pekerjaan aktif/ });
    await activeCard.click();
    await expect(activeCard).toHaveAttribute('aria-pressed', 'true');
    const taskLinks = page.locator('a[href^="/pekerjaan?task="]');
    expect(await taskLinks.count()).toBeLessThanOrEqual(10);
    // Bukan penilaian kinerja: tidak ada predikat/peringkat.
    const body = (await page.textContent('body')) ?? '';
    for (const terlarang of ['Predikat', 'Peringkat', 'SKP', 'Ranking']) {
      expect(body).not.toContain(terlarang);
    }
  });

  test('akun DEMO tidak menampilkan lonceng notifikasi personal', async ({ page }) => {
    await loginAsUser(page);
    await expect(page.getByRole('button', { name: /^Notifikasi/ })).toHaveCount(0);
  });
});
