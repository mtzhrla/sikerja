import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, KeyRound, RotateCcw, Save, Upload } from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/layout/BrandMark';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import { clearAllCollections } from '@/services/local/storage';
import { resetSeedMemo } from '@/services/local/db';
import type { BackupPayload } from '@/services/types';
import { SessionsPanel } from '@/features/auth/SessionsDialog';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useAppSettings } from '@/hooks/queries';

interface SettingsForm {
  appName: string;
  activeYear: string;
  userSessionDays: string;
  staleDays: string;
  attachmentMaxMB: string;
  attachmentAllowedExt: string;
  logoDataUrl: string | null;
}

export function SettingsSection() {
  const settingsQ = useAppSettings();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const getCtx = useActorCtx();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = settingsQ.data;
    if (s && s.version !== savedVersion) {
      setForm({
        appName: s.appName,
        activeYear: String(s.activeYear),
        userSessionDays: String(s.userSessionDays),
        staleDays: String(s.staleDays),
        attachmentMaxMB: String(s.attachmentMaxMB),
        attachmentAllowedExt: s.attachmentAllowedExt.join(', '),
        logoDataUrl: s.logoDataUrl,
      });
      setSavedVersion(s.version);
    }
  }, [settingsQ.data, savedVersion]);

  if (settingsQ.isLoading || !form) return <LoadingBlock label="Memuat pengaturan…" />;
  if (settingsQ.isError) {
    return <ErrorState error={settingsQ.error} onRetry={() => void settingsQ.refetch()} />;
  }
  const settings = settingsQ.data!;

  function setField<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleLogoFile(file: File) {
    if (!file.type.startsWith('image/')) {
      notify.error('Logo harus berupa gambar.');
      return;
    }
    if (file.size > 200 * 1024) {
      notify.error('Ukuran logo maksimal 200 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setField('logoDataUrl', String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form) return;
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      const ext = form.attachmentAllowedExt
        .split(/[,\s]+/)
        .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean);
      await getDataService().settings.update(
        {
          appName: form.appName,
          activeYear: Number(form.activeYear),
          userSessionDays: Number(form.userSessionDays),
          staleDays: Number(form.staleDays),
          attachmentMaxMB: Number(form.attachmentMaxMB),
          attachmentAllowedExt: ext,
          logoDataUrl: form.logoDataUrl,
        },
        settings.version,
        ctx,
      );
      notify.success('Pengaturan disimpan.');
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (err) {
      notify.error('Gagal menyimpan pengaturan', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      notify.error('Password minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error('Konfirmasi password tidak sama.');
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    setPasswordBusy(true);
    try {
      await getDataService().settings.changeUserPassword(newPassword, ctx);
      notify.success('Password akun User diganti.', 'Seluruh tim memakai password baru saat login berikutnya.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notify.error('Gagal mengganti password', errorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function exportBackup() {
    try {
      const payload = await getDataService().settings.exportBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-pip-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      notify.success('Backup diunduh.');
    } catch (err) {
      notify.error('Gagal membuat backup', errorMessage(err));
    }
  }

  async function importBackup(file: File) {
    const ok = await confirm({
      title: 'Pulihkan dari backup?',
      description: 'Seluruh data saat ini akan DIGANTI dengan isi berkas backup. Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Pulihkan',
      danger: true,
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      await getDataService().settings.importBackup(payload, ctx);
      notify.success('Backup dipulihkan.', 'Memuat ulang aplikasi…');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      notify.error('Gagal memulihkan backup', errorMessage(err));
    }
  }

  async function resetDemoData() {
    const ok = await confirm({
      title: 'Reset data contoh?',
      description: 'Seluruh data mode lokal dihapus dan diganti data contoh awal. Anda akan keluar dari sesi.',
      confirmLabel: 'Reset data',
      danger: true,
    });
    if (!ok) return;
    clearAllCollections();
    resetSeedMemo();
    window.location.reload();
  }

  return (
    <div className="space-y-3">
      {/* Umum */}
      <Card>
        <CardHeader
          title="Pengaturan Umum"
          description="Identitas aplikasi, tahun aktif, sesi, dan batasan lampiran."
          actions={
            <Button onClick={() => void save()} loading={busy}>
              <Save className="size-4" aria-hidden />
              Simpan
            </Button>
          }
        />
        <div className="grid gap-4 p-4 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Nama aplikasi" required>
            <Input value={form.appName} onChange={(e) => setField('appName', e.target.value)} />
          </Field>
          <Field label="Tahun aktif" hint="Tahun default filter Dashboard.">
            <Input
              type="number"
              value={form.activeYear}
              onChange={(e) => setField('activeYear', e.target.value)}
            />
          </Field>
          <Field label="Durasi sesi User (hari)" hint="Sesi persisten per perangkat.">
            <Input
              type="number"
              min={1}
              value={form.userSessionDays}
              onChange={(e) => setField('userSessionDays', e.target.value)}
            />
          </Field>
          <Field label="Ambang tidak diperbarui (hari)" hint='Untuk "Perlu Perhatian".'>
            <Input
              type="number"
              min={1}
              value={form.staleDays}
              onChange={(e) => setField('staleDays', e.target.value)}
            />
          </Field>
          <Field label="Batas lampiran (MB)">
            <Input
              type="number"
              min={1}
              value={form.attachmentMaxMB}
              onChange={(e) => setField('attachmentMaxMB', e.target.value)}
            />
          </Field>
          <Field label="Tipe berkas diizinkan" hint="Pisahkan dengan koma. Executable selalu ditolak.">
            <Input
              value={form.attachmentAllowedExt}
              onChange={(e) => setField('attachmentAllowedExt', e.target.value)}
            />
          </Field>
          <Field label="Logo" hint="Gambar maks. 200 KB; kosongkan untuk logo bawaan.">
            <div className="flex items-center gap-3">
              <BrandMark logoDataUrl={form.logoDataUrl} />
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Unggah logo"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLogoFile(f);
                    e.target.value = '';
                  }}
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                  <Upload className="size-3.5" aria-hidden />
                  Unggah
                </span>
              </label>
              {form.logoDataUrl && (
                <Button variant="ghost" size="sm" onClick={() => setField('logoDataUrl', null)}>
                  Hapus logo
                </Button>
              )}
            </div>
          </Field>
        </div>
      </Card>

      {/* Password User */}
      <Card>
        <CardHeader
          title="Password Akun User"
          description="Akun bersama seluruh tim. Ganti berkala; seluruh perangkat memakai password baru saat login berikutnya."
        />
        <div className="flex flex-wrap items-end gap-3 p-4 pt-3">
          <Field label="Password baru" className="w-56">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Ulangi password" className="w-56">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => void changePassword()}
            loading={passwordBusy}
            disabled={!newPassword}
          >
            <KeyRound className="size-4" aria-hidden />
            Ganti password
          </Button>
        </div>
      </Card>

      {/* Sesi perangkat */}
      <Card>
        <CardHeader
          title="Pencabutan Sesi"
          description="Cabut sesi untuk memaksa perangkat keluar (mis. TV ruang rapat atau perangkat hilang)."
        />
        <div className="p-4 pt-1">
          <SessionsPanel />
        </div>
      </Card>

      {/* Backup */}
      <Card>
        <CardHeader
          title="Backup & Pemulihan"
          description={
            getDataService().mode === 'local'
              ? 'Mode lokal: backup berupa berkas JSON berisi seluruh data perangkat ini.'
              : 'Unduh salinan data aplikasi sebagai berkas cadangan.'
          }
        />
        <div className="flex flex-wrap items-center gap-3 p-4 pt-3">
          <Button variant="outline" onClick={() => void exportBackup()}>
            <DatabaseBackup className="size-4" aria-hidden />
            Unduh backup
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              aria-label="Pulihkan dari backup"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBackup(f);
                e.target.value = '';
              }}
            />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="size-4" aria-hidden />
              Pulihkan dari berkas
            </span>
          </label>
          {getDataService().mode === 'local' && (
            <Button variant="ghost" onClick={() => void resetDemoData()}>
              <RotateCcw className="size-4" aria-hidden />
              Reset data contoh
              <Badge tone="warning">mode lokal</Badge>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
