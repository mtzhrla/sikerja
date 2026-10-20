import { expect, test } from '@playwright/test';
import { collectConsoleErrors, loginAsAdmin } from './helpers';

test.describe('smoke: kerangka aplikasi', () => {
  test('root diarahkan ke login saat belum masuk', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('setelah login: navigasi menu utama & console bersih', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await loginAsAdmin(page);

    const nav = page.getByRole('navigation', { name: 'Menu' });
    await nav.getByRole('link', { name: 'Pekerjaan' }).click();
    await expect(page).toHaveURL(/\/pekerjaan$/);
    await expect(page.getByRole('heading', { name: 'Pekerjaan', exact: true })).toBeVisible();

    await nav.getByRole('link', { name: 'Daftar Pegawai' }).click();
    await expect(page).toHaveURL(/\/daftar-pegawai$/);
    await expect(
      page.getByRole('heading', { name: 'Daftar Pegawai', exact: true }),
    ).toBeVisible();

    await nav.getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();

    await nav.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('route tidak dikenal menampilkan halaman 404', async ({ page }) => {
    await page.goto('/halaman-tidak-ada');
    await expect(page.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeVisible();
  });

  test('mobile: bottom navigation tampil setelah login', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);
    const bottomNavs = page.getByRole('navigation', { name: 'Navigasi utama' });
    await expect(bottomNavs.last()).toBeVisible();
    await expect(bottomNavs.last().getByRole('link', { name: 'Pekerjaan' })).toBeVisible();
  });
});
