import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers';

/**
 * Audit aksesibilitas (axe-core, WCAG 2.x A/AA).
 * Gagal bila ada pelanggaran berdampak serious/critical.
 */

async function expectNoSeriousViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // Toast bersifat transien dan mengikuti style bawaan sonner; dikecualikan
    // dari scan otomatis (konten toast selalu menyertai aksi yang barusan
    // dilakukan pengguna, bukan satu-satunya penanda status).
    .exclude('[data-sonner-toaster]')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = serious
    .map((v) => {
      const combos = new Set<string>();
      for (const n of v.nodes) {
        const data = n.any[0]?.data as
          | { fgColor?: string; bgColor?: string; contrastRatio?: number }
          | undefined;
        const target = String(n.target[0]).slice(0, 90);
        combos.add(
          data?.fgColor
            ? `${data.fgColor} on ${data.bgColor} (${data.contrastRatio}) :: ${target}`
            : `${n.failureSummary?.slice(0, 120)} :: ${target}`,
        );
      }
      return `${v.id} (${v.impact}) ${v.nodes.length} node:\n  ${[...combos].slice(0, 14).join('\n  ')}`;
    })
    .join('\n');
  expect(serious, `${context}\n${summary}`).toEqual([]);
}

test.describe('aksesibilitas', () => {
  test.beforeEach(async ({ page }) => {
    // Animasi masuk (fade) membuat axe membaca warna saat opacity < 1;
    // aplikasi menghormati prefers-reduced-motion, jadi emulasikan.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('halaman login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expectNoSeriousViolations(page, 'login');
  });

  test('dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');
    await expectNoSeriousViolations(page, 'dashboard');
  });

  test('board pekerjaan', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await page.waitForLoadState('networkidle');
    await expectNoSeriousViolations(page, 'pekerjaan');
  });

  test('ringkasan pekerjaan & daftar pegawai', async ({ page }) => {
    await loginAsAdmin(page);
    for (const path of ['/pekerjaan?scope=mine', '/daftar-pegawai']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoSeriousViolations(page, path);
    }
  });

  test('detail pekerjaan (dialog)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await page
      .getByRole('region', { name: 'Step On Progress', exact: true })
      .getByText('Finalisasi SK Pemberian PIP Termin 2')
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousViolations(page, 'detail pekerjaan');
  });

  test('admin: audit dan pengaturan', async ({ page }) => {
    await loginAsAdmin(page);
    for (const path of ['/admin/audit', '/admin/pengaturan']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoSeriousViolations(page, path);
    }
  });
});
