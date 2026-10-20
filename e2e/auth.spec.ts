import { expect, test } from '@playwright/test';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  USER_PASSWORD,
  USER_USERNAME,
  IS_SUPABASE_E2E,
  collectConsoleErrors,
  loginAsAdmin,
  loginAsUser,
} from './helpers';

test.describe('login & akses', () => {
  test('tanpa sesi, halaman dilindungi diarahkan ke login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
  });

  test('password salah menampilkan pesan error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('NIP atau Username').fill(USER_USERNAME);
    await page.getByLabel('Password', { exact: true }).fill('password-salah');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('alert')).toContainText('NIP/username atau password salah');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login akun DEMO: masuk, menu terkunci, sesi persisten setelah reload', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await loginAsUser(page);
    await expect(page.getByRole('button', { name: 'Menu pengguna' })).toBeVisible();

    // Navigasi User: Dashboard, Pekerjaan, Daftar Pegawai tampil; Admin tidak ada
    const nav = page.getByRole('navigation', { name: 'Menu' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Pekerjaan' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Daftar Pegawai' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);

    // Sesi persisten
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(errors).toEqual([]);
  });

  test('akun DEMO tidak dapat membuka halaman Admin (akses ditolak)', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  });

  test('logout mengakhiri sesi', async ({ page }) => {
    await loginAsUser(page);
    await page.getByRole('button', { name: 'Menu pengguna' }).click();
    await page.getByRole('menuitem', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login Admin: menu Admin tampil dan dapat dibuka', async ({ page }) => {
    await loginAsAdmin(page);
    const nav = page.getByRole('navigation', { name: 'Menu' });
    await expect(nav.getByRole('link', { name: 'Admin' })).toBeVisible();
    await nav.getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  });

  test('Admin dapat melihat dan mencabut sesi User', async ({ page }) => {
    test.skip(IS_SUPABASE_E2E, 'Simulasi sesi localStorage hanya berlaku untuk adapter lokal.');
    await loginAsAdmin(page);

    // Fixture: sesi USER aktif dari "perangkat lain" (satu perangkat hanya
    // memegang satu sesi, jadi sesi lintas perangkat disimulasikan lewat storage).
    await page.evaluate(() => {
      const key = 'pipdash:v1:sessions';
      const sessions = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
      sessions.push({
        id: 'ses_e2e_perangkat_lain',
        role: 'USER',
        account: 'tim-pip',
        deviceLabel: 'Chrome · Android',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        revokedAt: null,
      });
      localStorage.setItem(key, JSON.stringify(sessions));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: 'Menu pengguna' }).click();
    await page.getByRole('menuitem', { name: 'Kelola sesi perangkat' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sesi perangkat' });
    await expect(dialog).toBeVisible();

    // Sesi USER perangkat lain tampil — cabut.
    const userRow = dialog.locator('li', { hasText: 'Chrome · Android' });
    await expect(userRow).toBeVisible();
    await userRow.getByRole('button', { name: 'Cabut' }).click();
    await page.getByRole('button', { name: 'Cabut sesi' }).click();
    await expect(page.getByText('Sesi dicabut.')).toBeVisible();
    await expect(userRow.getByText('Dicabut')).toBeVisible();
    await expect(userRow.getByRole('button', { name: 'Cabut' })).toHaveCount(0);
  });

  test('Admin dapat mengganti pegawai pelaku dari menu pengguna', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'Menu pengguna' }).click();
    await page.getByRole('menuitem', { name: 'Ganti pegawai pelaku' }).click();
    const dialog = page.getByRole('dialog', { name: 'Siapa yang sedang bekerja?' });
    await dialog.getByRole('button', { name: /Rakean Sundayana/ }).click();
    await expect(page.getByRole('button', { name: 'Menu pengguna' })).toContainText('Rakean');
  });

  test('rate limit: input berulang kali salah tetap aman (pesan jelas)', async ({ page }) => {
    test.skip(IS_SUPABASE_E2E, 'Tidak memicu rate-limit pada akun Supabase Auth nyata.');
    await page.goto('/login');
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel('NIP atau Username').fill(ADMIN_USERNAME);
      await page.getByLabel('Password', { exact: true }).fill('salah-terus');
      await page.getByRole('button', { name: 'Masuk' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('alert')).toContainText('Terlalu banyak percobaan');
  });

  test('kredensial development tidak tampil di halaman login', async ({ page }) => {
    await page.goto('/login');
    const body = await page.textContent('body');
    expect(body).not.toContain(USER_PASSWORD);
    expect(body).not.toContain(ADMIN_PASSWORD);
  });
});
