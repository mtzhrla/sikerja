import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronDown, ChevronUp, Pencil, Trash2, UserPlus } from 'lucide-react';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Avatar, AVATAR_COLOR_KEYS, AVATAR_COLORS, DefaultAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_TEAM } from '@/lib/org';
import { arrayMove, cn, initialsFromName } from '@/lib/utils';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { Employee, EmployeeAccount, EmployeeInput } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useEmployeeAccounts, useEmployeePhotos, useEmployees } from '@/hooks/queries';
import { AvatarCropperDialog } from './AvatarCropperDialog';

export function EmployeesSection() {
  const employeesQ = useEmployees(true);
  const accountsQ = useEmployeeAccounts(true);
  const photosQ = useEmployeePhotos(employeesQ.data);
  const photoUrls = photosQ.data ?? {};
  const [editing, setEditing] = useState<Employee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  const employees = employeesQ.data ?? [];
  const accounts = new Map((accountsQ.data ?? []).map((account) => [account.employeeId, account]));

  async function toggleActive(emp: Employee) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().employees.setActive(emp.id, !emp.active, ctx);
      notify.success(
        emp.active ? `${emp.displayName} dinonaktifkan.` : `${emp.displayName} diaktifkan.`,
        emp.active
          ? 'Tidak dapat dipilih untuk pekerjaan baru; histori lama tetap tampil.'
          : undefined,
      );
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err) {
      notify.error('Gagal mengubah status', errorMessage(err));
    }
  }

  async function move(emp: Employee, dir: -1 | 1) {
    const ids = employees.map((e) => e.id);
    const from = ids.indexOf(emp.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().employees.reorder(arrayMove(ids, from, to), ctx);
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err) {
      notify.error('Gagal mengubah urutan', errorMessage(err));
    }
  }

  if (employeesQ.isLoading) return <LoadingBlock label="Memuat pegawai…" />;
  if (employeesQ.isError) {
    return <ErrorState error={employeesQ.error} onRetry={() => void employeesQ.refetch()} />;
  }

  return (
    <Card>
      <CardHeader
        title="Pegawai"
        description="Data pegawai, tag board, jabatan, dan foto profil. Pegawai dengan histori tidak dapat dihapus — gunakan nonaktif."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <UserPlus className="size-4" aria-hidden />
            Tambah pegawai
          </Button>
        }
      />
      <ul className="divide-y divide-slate-100 p-4 pt-2">
        {employees.map((emp, i) => (
          <li key={emp.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar
              employee={emp}
              showInactive
              src={emp.avatarPath ? photoUrls[emp.avatarPath] : null}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                {emp.fullName}
                {!emp.active && <Badge tone="neutral">Nonaktif</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                {[emp.position, emp.team, emp.nip ? `NIP ${emp.nip}` : null]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                · tag board “{emp.displayName}”
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Naikkan urutan ${emp.displayName}`}
                disabled={i === 0}
                onClick={() => void move(emp, -1)}
              >
                <ChevronUp className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Turunkan urutan ${emp.displayName}`}
                disabled={i === employees.length - 1}
                onClick={() => void move(emp, 1)}
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Ubah ${emp.displayName}`}
                onClick={() => {
                  setEditing(emp);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Switch
                checked={emp.active}
                onCheckedChange={() => void toggleActive(emp)}
                aria-label={`Status aktif ${emp.displayName}`}
              />
            </div>
          </li>
        ))}
      </ul>
      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={editing}
        account={editing ? (accounts.get(editing.id) ?? null) : null}
        photoUrl={editing?.avatarPath ? photoUrls[editing.avatarPath] : undefined}
      />
    </Card>
  );
}

function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  account,
  photoUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  account: EmployeeAccount | null;
  /** URL foto saat ini (bila pegawai sudah punya foto). */
  photoUrl?: string;
}) {
  const [form, setForm] = useState<EmployeeInput>({
    fullName: '',
    displayName: '',
    initials: '',
    color: AVATAR_COLOR_KEYS[0] ?? 'blue',
    nip: '',
    position: '',
    team: DEFAULT_TEAM,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  // Foto: blob baru menunggu disimpan / tanda hapus; preview object URL lokal.
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  // Cropper: berkas sumber yang sedang diatur sebelum disimpan.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  useEffect(() => () => clearPreview(), []);

  /** Buka cropper untuk berkas terpilih (belum disimpan hingga dikonfirmasi). */
  function openCropper(file: File) {
    setCropFile(file);
    setCropOpen(true);
  }

  /** Foto sudah dipotong & dikompres di cropper — siapkan preview & blob. */
  function handleCroppedBlob(blob: Blob) {
    clearPreview();
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPhotoBlob(blob);
    setPhotoPreview(url);
    setPhotoRemoved(false);
  }

  useEffect(() => {
    if (open) {
      clearPreview();
      setPhotoBlob(null);
      setPhotoPreview(null);
      setPhotoRemoved(false);
      setCropOpen(false);
      setCropFile(null);
      setForm(
        employee
          ? {
              fullName: employee.fullName,
              displayName: employee.displayName,
              initials: employee.initials,
              color: employee.color,
              nip: employee.nip ?? '',
              position: employee.position,
              team: employee.team,
            }
          : {
              fullName: '',
              displayName: '',
              initials: '',
              color: AVATAR_COLOR_KEYS[0] ?? 'blue',
              nip: '',
              position: '',
              team: DEFAULT_TEAM,
            },
      );
      setError(null);
    }
  }, [open, employee]);

  async function submit() {
    if (!form.fullName.trim()) {
      setError('Nama lengkap wajib diisi.');
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    const payload: EmployeeInput = {
      ...form,
      displayName: form.displayName.trim() || form.fullName.trim().split(/\s+/)[0]!,
      initials: form.initials.trim() || initialsFromName(form.fullName),
    };
    setBusy(true);
    try {
      let saved: Employee;
      if (employee) {
        saved = await getDataService().employees.update(employee.id, payload, ctx);
      } else {
        saved = await getDataService().employees.create(payload, ctx);
      }
      // Foto disimpan setelah data pegawai tersimpan.
      if (photoBlob) {
        await getDataService().employees.setPhoto(saved.id, photoBlob, ctx);
      } else if (photoRemoved && employee?.avatarPath) {
        await getDataService().employees.removePhoto(saved.id, ctx);
      }
      notify.success(employee ? 'Pegawai diperbarui.' : 'Pegawai ditambahkan.', payload.fullName);
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onOpenChange(false);
    } catch (err) {
      notify.error('Gagal menyimpan pegawai', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const showPhoto = photoPreview ?? (photoRemoved ? null : (photoUrl ?? null));

  return (
    <>
      <AvatarCropperDialog
        open={cropOpen}
        file={cropFile}
        onOpenChange={setCropOpen}
        onConfirm={handleCroppedBlob}
      />
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={employee ? 'Ubah Pegawai' : 'Tambah Pegawai'}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Foto profil"
            hint="Atur posisi & zoom sebelum disimpan (1:1, maks 512×512 px, ≤300 KB). Tanpa foto → avatar bawaan."
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                {showPhoto ? (
                  <img
                    src={showPhoto}
                    alt="Pratinjau foto pegawai"
                    className="size-full object-cover"
                  />
                ) : (
                  <DefaultAvatar
                    seed={form.displayName || form.fullName || '?'}
                    color={form.color}
                  />
                )}
              </span>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Unggah foto pegawai"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openCropper(f);
                    e.target.value = '';
                  }}
                />
                <span className="pressable inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                  <Camera className="size-3.5" aria-hidden />
                  {showPhoto ? 'Ganti foto' : 'Unggah foto'}
                </span>
              </label>
              {showPhoto && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearPreview();
                    setPhotoBlob(null);
                    setPhotoPreview(null);
                    setPhotoRemoved(true);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Hapus foto
                </Button>
              )}
            </div>
          </Field>
          <Field label="Nama lengkap" required error={error ?? undefined}>
            <Input
              value={form.fullName}
              onChange={(e) => {
                setForm((f) => ({ ...f, fullName: e.target.value }));
                setError(null);
              }}
              placeholder="cth. Budi Santoso"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Tag board"
              hint="Satu kata, unik antar pegawai aktif. Kosongkan = kata pertama nama."
            >
              <Input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="cth. Budi"
              />
            </Field>
            <Field label="Inisial" hint="Kosongkan = otomatis dari nama.">
              <Input
                value={form.initials}
                onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value.toUpperCase() }))}
                maxLength={3}
                placeholder="BS"
              />
            </Field>
            <Field label="NIP" hint="Kosongkan bila tidak ada.">
              <Input
                value={form.nip ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, nip: e.target.value }))}
                inputMode="numeric"
                placeholder="cth. 198102082005011003"
              />
            </Field>
            <Field label="Jabatan">
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="cth. Analis Data"
              />
            </Field>
            <Field label="Instansi/Tim">
              <Input
                value={form.team}
                onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}
                placeholder={DEFAULT_TEAM}
              />
            </Field>
          </div>
          <Field label="Warna avatar">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Warna avatar">
              {AVATAR_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={form.color === key}
                  aria-label={`Warna ${key}`}
                  onClick={() => setForm((f) => ({ ...f, color: key }))}
                  className={cn(
                    'size-7 cursor-pointer rounded-full transition-transform hover:scale-110',
                    AVATAR_COLORS[key],
                    form.color === key && 'ring-2 ring-slate-900 ring-offset-2',
                  )}
                />
              ))}
            </div>
          </Field>
          {employee && (
            <section className="space-y-3 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">Akses akun</h3>
              {!account?.hasAccount ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !employee.active}
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await getDataService().accounts.provision(employee.id);
                      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
                      notify.success(
                        `Akun ${employee.displayName} dibuat dengan password sementara.`,
                      );
                    } catch (err) {
                      notify.error('Gagal membuat akun', errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Buat akun pegawai
                </Button>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Status akun">
                      <div className="flex min-h-10 items-center gap-2">
                        <Switch
                          checked={account.isActive}
                          disabled={busy}
                          onCheckedChange={async (active) => {
                            setBusy(true);
                            try {
                              await getDataService().accounts.setActive(employee.id, active);
                              await queryClient.invalidateQueries({ queryKey: ['accounts'] });
                              notify.success(active ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.');
                            } catch (err) {
                              notify.error('Gagal mengubah status akun', errorMessage(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          aria-label={`Akun ${employee.fullName} aktif`}
                        />
                        <span className="text-sm text-slate-600">
                          {account.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </Field>
                    <Field
                      label="Status akses"
                      hint="Admin dapat mengelola seluruh pengaturan aplikasi."
                    >
                      <Select
                        value={account.accountType === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'}
                        disabled={busy}
                        aria-label={`Status akses ${employee.fullName}`}
                        onChange={async (event) => {
                          const role = event.target.value as 'ADMIN' | 'EMPLOYEE';
                          const confirmed = await confirm({
                            title: `Ubah akses ${employee.displayName}?`,
                            description:
                              role === 'ADMIN'
                                ? 'Pegawai ini akan mendapat hak Admin. Sesi saat ini dicabut dan perlu login kembali.'
                                : 'Hak Admin akan dicabut. Sesi saat ini dicabut dan pegawai masuk sebagai User.',
                            confirmLabel: 'Ubah akses',
                          });
                          if (!confirmed) return;
                          setBusy(true);
                          try {
                            await getDataService().accounts.setRole(employee.id, role);
                            await queryClient.invalidateQueries({ queryKey: ['accounts'] });
                            notify.success(
                              `Akses diubah menjadi ${role === 'ADMIN' ? 'Admin' : 'User'}.`,
                            );
                          } catch (err) {
                            notify.error('Gagal mengubah akses akun', errorMessage(err));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <option value="EMPLOYEE">User</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: `Reset password ${employee.displayName}?`,
                        description:
                          'Password dikembalikan ke password sementara dan semua sesi lama dicabut.',
                        confirmLabel: 'Reset password',
                        danger: true,
                      });
                      if (!confirmed) return;
                      setBusy(true);
                      try {
                        await getDataService().accounts.resetPassword(employee.id);
                        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
                        notify.success('Password akun direset ke password sementara.');
                      } catch (err) {
                        notify.error('Gagal mereset password', errorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Reset password
                  </Button>
                </>
              )}
            </section>
          )}
        </div>
      </Modal>
    </>
  );
}
