import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { notify } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import { validatePassword } from './password-policy';
import { useSessionStore } from './session-store';

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Ganti password sendiri (Profil Saya → Ganti Password). */
export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const mustChange = useSessionStore((s) => s.mustChangePassword);
  const refresh = useSessionStore((s) => s.refresh);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validatePassword(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getDataService().auth.changeOwnPassword(next, current || undefined);
      await refresh();
      notify.success('Password berhasil diganti.');
      setCurrent('');
      setNext('');
      setConfirm('');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ganti password"
      description="Password minimal 8 karakter dan tidak boleh sama dengan password sementara."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="form-ganti-password" loading={busy}>
            Simpan password
          </Button>
        </>
      }
    >
      <form id="form-ganti-password" onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}
        {!mustChange && (
          <Field label="Password saat ini" required>
            <div className="relative">
              <LockKeyhole
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-slate-400"
              />
              <Input
                aria-label="Password saat ini"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="pl-10"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          </Field>
        )}
        <Field label="Password baru" required>
          <div className="relative">
            <LockKeyhole
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-slate-400"
            />
            <Input
              aria-label="Password baru"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className="pr-11 pl-10"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
              aria-pressed={show}
              className="pressable absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              {show ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
            </button>
          </div>
        </Field>
        <Field label="Ulangi password baru" required>
          <div className="relative">
            <LockKeyhole
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-slate-400"
            />
            <Input
              aria-label="Ulangi password baru"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className="pl-10"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </Field>
      </form>
    </Modal>
  );
}
