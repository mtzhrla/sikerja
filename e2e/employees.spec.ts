import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsUser } from './helpers';

test.describe('daftar pegawai', () => {
  test('USER: direktori baca-saja tampil tanpa akses profil pegawai lain', async ({ page }) => {
    await loginAsUser(page);
    const nav = page.getByRole('navigation', { name: 'Menu' });
    await nav.getByRole('link', { name: 'Daftar Pegawai' }).click();
    await expect(page).toHaveURL(/\/daftar-pegawai/);

    // Card pegawai tampil
    const kontent = page.locator('#konten-utama');
    await expect(
      kontent.getByRole('button', { name: 'Buka profil Tri Hesti Wahyudiati' }),
    ).toBeVisible();

    // Baca-saja: tidak ada tombol kelola/unggah untuk USER
    await expect(kontent.getByRole('link', { name: 'Kelola pegawai' })).toHaveCount(0);
    await expect(kontent.getByText('Unggah foto')).toHaveCount(0);
    // Status akun hanya untuk Admin
    await expect(kontent.getByLabel('Status akun')).toHaveCount(0);

    // Pencarian menyaring
    await page.getByLabel('Cari pegawai').fill('Thoriq');
    await expect(
      kontent.getByRole('button', { name: 'Buka profil Thoriq Rozaq Rosyadi' }),
    ).toBeVisible();
    await expect(
      kontent.getByRole('button', { name: 'Buka profil Tri Hesti Wahyudiati' }),
    ).toHaveCount(0);

    // Kartu pegawai lain tidak membuka data operasional.
    await kontent.getByRole('button', { name: 'Buka profil Thoriq Rozaq Rosyadi' }).click();
    await expect(page).toHaveURL(/\/daftar-pegawai/);

    // URL langsung tetap ditolak oleh route guard.
    await page.goto('/pegawai/emp-thoriq');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  });

  test('ADMIN: tombol kelola menuju Admin › Pegawai; dialog punya kontrol foto', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/daftar-pegawai');
    await page.locator('#konten-utama').getByRole('link', { name: 'Kelola pegawai' }).click();
    await expect(page).toHaveURL(/\/admin\/pegawai/);

    // Dialog ubah pegawai memiliki unggah foto profil
    await page
      .locator('li', { hasText: 'Tri Hesti Wahyudiati' })
      .getByRole('button', { name: /Ubah/ })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Ubah Pegawai' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Unggah foto|Ganti foto/)).toBeVisible();

    // Validasi format: berkas non-gambar ditolak sebelum diunggah
    await dialog.getByLabel('Unggah foto pegawai').setInputFiles({
      name: 'bukan-gambar.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('bukan gambar'),
    });
    await expect(page.getByText('Foto tidak dapat dipakai')).toBeVisible();

    // Validasi resolusi: PNG 1×1 ditolak (min. 32×32)
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await dialog.getByLabel('Unggah foto pegawai').setInputFiles({
      name: 'kecil.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    await expect(page.getByText(/Resolusi gambar terlalu kecil/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Batal' }).click();
  });

  test('ADMIN: card ringkasan menjadi filter tunggal dan daftar maksimal 10 pekerjaan', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/daftar-pegawai');
    await page
      .locator('#konten-utama')
      .getByRole('button', { name: /^Buka profil/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Profil Pegawai' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Saringan pekerjaan' })).toHaveCount(0);

    const activeCard = page.getByRole('button', { name: /Pekerjaan aktif/ });
    await activeCard.click();
    await expect(activeCard).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('a[href^="/pekerjaan?task="]').count()).toBeLessThanOrEqual(10);
  });
});

test.describe('daftar pegawai — tampilan tunggal, unit, & pagination', () => {
  test('tidak ada Struktur Tim; hanya satu daftar pegawai', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/daftar-pegawai');
    const kontent = page.locator('#konten-utama');
    await expect(page.getByRole('button', { name: 'Struktur Tim' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Semua Pegawai' })).toHaveCount(0);
    await expect(kontent.getByRole('list')).toHaveCount(1);
    // Tidak ada diagram hierarki / daftar kedua
    await expect(kontent.getByText('Belum memiliki atasan langsung')).toHaveCount(0);
  });

  test('filter Unit/Tim tidak tampil karena seluruh pegawai satu unit', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/daftar-pegawai');
    await expect(page.getByLabel('Unit / Tim')).toHaveCount(0);
    // Toolbar ringkas: cari + tingkat
    await expect(page.getByLabel('Cari pegawai')).toBeVisible();
    await expect(page.getByLabel('Tingkat')).toBeVisible();
  });

  test('seluruh pegawai memiliki Unit/Tim "PIP Puslapdik" pada Profil', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/daftar-pegawai');
    const kartu = page.locator('#konten-utama').getByRole('button', { name: /^Buka profil/ });
    await expect(kartu).toHaveCount(12);
    for (let i = 0; i < 5; i += 1) {
      await page.goto('/daftar-pegawai');
      await page
        .locator('#konten-utama')
        .getByRole('button', { name: /^Buka profil/ })
        .nth(i)
        .click();
      await expect(page.getByText('Unit / Tim')).toBeVisible();
      await expect(page.getByText('PIP Puslapdik', { exact: true }).first()).toBeVisible();
      // Relasi atasan tetap terlihat di Profil, bukan menu terpisah.
      await expect(page.getByText('Atasan langsung', { exact: true })).toBeVisible();
    }
  });

  test('pagination: default 12 per halaman, rentang data, dan reset saat filter berubah', async ({
    page,
  }) => {
    await loginAsUser(page);
    await page.goto('/daftar-pegawai');
    const kontent = page.locator('#konten-utama');
    const kartu = kontent.getByRole('button', { name: /^Buka profil/ });

    await expect(kartu).toHaveCount(12);
    await expect(kontent.getByText(/^Menampilkan 1–12 dari \d+ pegawai$/)).toBeVisible();

    // Halaman 2 mengubah rentang; kembali lewat tombol sebelumnya.
    await page.getByRole('button', { name: 'Halaman 2' }).click();
    await expect(kontent.getByText(/^Menampilkan 13–/)).toBeVisible();
    await page.getByRole('button', { name: 'Halaman sebelumnya' }).click();
    await expect(kontent.getByText(/^Menampilkan 1–12/)).toBeVisible();

    // Ukuran halaman 12 / 20 / 40
    await page.getByLabel('Jumlah pegawai per halaman').selectOption('40');
    await expect(kontent.getByText(/^Menampilkan 1–\d+ dari \d+ pegawai$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Halaman 2' })).toHaveCount(0);
    await page.getByLabel('Jumlah pegawai per halaman').selectOption('12');

    // Filter berubah → kembali ke halaman pertama
    await page.getByRole('button', { name: 'Halaman 2' }).click();
    await page.getByLabel('Tingkat').selectOption('LEADER');
    await expect(kontent.getByText(/^Menampilkan 1–/)).toBeVisible();
  });

  test('nama panjang maksimal dua baris, NIP satu baris, dan tinggi kartu konsisten', async ({
    page,
  }) => {
    await loginAsUser(page);
    await page.goto('/daftar-pegawai');
    const kartu = page.locator('#konten-utama').getByRole('button', { name: /^Buka profil/ });
    await expect(kartu).toHaveCount(12);

    const metrik = await kartu.evaluateAll((nodes) =>
      nodes.map((node) => {
        const el = node as HTMLElement;
        const nama = el.querySelector('p.line-clamp-2') as HTMLElement;
        const nip = nama.nextElementSibling as HTMLElement;
        const lh = (n: HTMLElement) => parseFloat(getComputedStyle(n).lineHeight);
        return {
          tinggiKartu: Math.round(el.getBoundingClientRect().height),
          atasKartu: Math.round(el.getBoundingClientRect().top),
          barisNama: Math.round(nama.getBoundingClientRect().height / lh(nama)),
          barisNip: Math.round(nip.getBoundingClientRect().height / lh(nip)),
          nipWrap: getComputedStyle(nip).whiteSpace,
          lebarNipMuat: nip.scrollWidth <= nip.clientWidth + 1,
          keluarContainer:
            el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        };
      }),
    );

    for (const m of metrik) {
      expect(m.barisNama, 'nama maksimal dua baris').toBeLessThanOrEqual(2);
      expect(m.barisNip, 'NIP selalu satu baris').toBe(1);
      expect(m.nipWrap).toBe('nowrap');
      expect(m.lebarNipMuat, 'NIP tidak terpotong').toBe(true);
      expect(m.keluarContainer, 'tidak ada teks keluar container').toBe(false);
    }

    // Kartu pada baris yang sama (top identik) harus setinggi sama.
    const perBaris = new Map<number, number[]>();
    for (const m of metrik) {
      perBaris.set(m.atasKartu, [...(perBaris.get(m.atasKartu) ?? []), m.tinggiKartu]);
    }
    for (const [, tinggi] of perBaris) {
      expect(Math.max(...tinggi) - Math.min(...tinggi), 'tinggi kartu konsisten').toBeLessThanOrEqual(1);
    }
  });

  test('username tampil sebagai badge satu baris dan tidak bertumpuk dengan badge tingkat', async ({
    page,
  }) => {
    await loginAsUser(page);
    await page.goto('/daftar-pegawai');
    const kartu = page.locator('#konten-utama').getByRole('button', { name: /^Buka profil/ }).first();
    const badges = kartu.locator('span.rounded-full');
    await expect(badges.first()).toBeVisible();
    const kotak = await badges.evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
    );
    // Badge pada baris yang sama tidak boleh saling menimpa.
    for (let i = 0; i < kotak.length; i += 1) {
      for (let j = i + 1; j < kotak.length; j += 1) {
        const a = kotak[i]!;
        const b = kotak[j]!;
        const tumpuk =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(tumpuk, 'badge tidak boleh bertumpuk').toBe(false);
      }
    }
  });

  test('ADMIN: pegawai baru mendapat Unit/Tim default PIP Puslapdik', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/pegawai');
    await page.getByRole('button', { name: 'Tambah pegawai' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Tambah Pegawai' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Instansi/Tim')).toHaveValue('PIP Puslapdik');
    await dialog.getByRole('button', { name: 'Batal' }).click();
  });
});

test.describe('sidebar', () => {
  test('hanya ada SATU kontrol toggle; siklus perkecil → sembunyikan → tampilkan', async ({
    page,
  }) => {
    await loginAsUser(page);
    const toggle = page.getByRole('button', {
      name: /Perkecil sidebar|Sembunyikan sidebar|Tampilkan sidebar/,
    });
    // Satu kontrol saja pada satu waktu
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAccessibleName('Perkecil sidebar');

    await toggle.click(); // → compact
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAccessibleName('Sembunyikan sidebar');

    await toggle.click(); // → hidden; tombol tampil di kiri-atas
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAccessibleName('Tampilkan sidebar');

    await toggle.click(); // → kembali expanded
    await expect(toggle).toHaveAccessibleName('Perkecil sidebar');
    // Preferensi tersimpan; navigasi tetap tampil
    await expect(
      page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Dashboard' }),
    ).toBeVisible();
  });
});

test.describe('login maskot', () => {
  test('animasi maskot tidak menghambat pengisian & submit login', async ({ page }) => {
    await page.goto('/login');
    // Interaksi cepat username → password → toggle lihat password → submit
    const username = page.getByLabel('NIP atau Username');
    const password = page.getByLabel('Password', { exact: true });
    await username.click();
    await username.pressSequentially('x', { delay: 10 });
    await username.fill('');
    await password.click();
    await password.fill('salah');
    await page.getByRole('button', { name: 'Tampilkan password' }).click();
    await page.getByRole('button', { name: 'Sembunyikan password' }).click();
    // Form tetap responsif: submit kosong menampilkan error validasi segera
    await username.fill('');
    await password.fill('');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('alert')).toContainText('Masukkan username dan password');
  });
});
