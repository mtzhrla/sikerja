import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Avatar, AvatarGroup } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';

const demoEmployee = {
  displayName: 'Rina W.',
  initials: 'RW',
  color: 'emerald',
  active: true,
};

/** Galeri komponen — hanya tersedia pada mode development (bukan menu aplikasi). */
export default function UiGalleryPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const confirm = useConfirm();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Galeri UI (dev)</h1>

      <Card>
        <CardHeader title="Button" />
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Button>
            <Plus className="size-4" aria-hidden /> Primer
          </Button>
          <Button variant="secondary">Sekunder</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Hapus</Button>
          <Button loading>Menyimpan…</Button>
          <Button disabled>Nonaktif</Button>
          <Button size="sm" variant="outline">
            Kecil
          </Button>
          <Button size="lg">Besar</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Form controls" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Nama pekerjaan" required hint="Judul singkat yang mudah dikenali.">
            <Input placeholder="cth. Rekonsiliasi Termin 2" />
          </Field>
          <Field label="Kategori" error="Kategori wajib dipilih.">
            <Select aria-invalid>
              <option value="">Pilih kategori…</option>
              <option>Penyaluran</option>
              <option>Rapat</option>
            </Select>
          </Field>
          <Field label="Deskripsi" className="sm:col-span-2">
            <Textarea placeholder="Uraian pekerjaan…" />
          </Field>
          <div className="flex items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
              Checklist item
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
              Aktif
            </label>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input className="pl-9" placeholder="Cari pekerjaan…" aria-label="Cari" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Badge, Avatar, Progres" />
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">Penyaluran</Badge>
            <Badge tone="success">Selesai</Badge>
            <Badge tone="warning">Prioritas tinggi</Badge>
            <Badge tone="danger">Terlambat</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="outline" dotColor="#7c3aed">
              Label ungu
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <Avatar employee={demoEmployee} size="lg" />
            <Avatar employee={demoEmployee} />
            <Avatar employee={null} />
            <AvatarGroup
              employees={[
                demoEmployee,
                { ...demoEmployee, initials: 'AD', color: 'blue' },
                { ...demoEmployee, initials: 'BS', color: 'amber' },
                { ...demoEmployee, initials: 'CT', color: 'rose' },
                { ...demoEmployee, initials: 'DE', color: 'violet' },
              ]}
            />
          </div>
          <div className="max-w-sm space-y-3">
            <ProgressBar value={35} showValue />
            <ProgressBar value={72} showValue />
            <ProgressBar value={100} showValue />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Overlay & feedback" />
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            Buka modal
          </Button>
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button variant="outline">Dropdown</Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem>Ubah</DropdownItem>
              <DropdownItem>Arsipkan</DropdownItem>
              <DropdownSeparator />
              <DropdownItem danger>Hapus</DropdownItem>
            </DropdownContent>
          </DropdownRoot>
          <Tooltip content="Penjelasan singkat">
            <Button variant="ghost">Tooltip</Button>
          </Tooltip>
          <Button variant="secondary" onClick={() => notify.success('Berhasil disimpan')}>
            Toast sukses
          </Button>
          <Button variant="secondary" onClick={() => notify.error('Gagal menyimpan', 'Coba lagi.')}>
            Toast gagal
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: 'Hapus pekerjaan?',
                description: 'Pekerjaan dipindahkan ke Data Terhapus dan dapat dipulihkan Admin.',
                danger: true,
                confirmLabel: 'Hapus',
              });
              if (ok) notify.success('Terhapus');
            }}
          >
            Konfirmasi hapus
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Status konten" />
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100">
            <LoadingBlock compact />
          </div>
          <div className="rounded-xl border border-slate-100">
            <EmptyState compact title="Belum ada data" description="Tambahkan data pertama Anda." />
          </div>
          <div className="rounded-xl border border-slate-100">
            <ErrorState compact error={new Error('Koneksi terputus')} onRetry={() => undefined} />
          </div>
        </div>
        <div className="space-y-2 p-4 pt-0">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>

      <Card>
        <CardHeader title="Tabs" />
        <div className="p-4">
          <Tabs defaultValue="aktif">
            <TabsList>
              <TabsTrigger value="aktif">Aktif</TabsTrigger>
              <TabsTrigger value="arsip">Arsip</TabsTrigger>
            </TabsList>
            <TabsContent value="aktif" className="pt-3 text-sm text-slate-600">
              Konten tab aktif.
            </TabsContent>
            <TabsContent value="arsip" className="pt-3 text-sm text-slate-600">
              Konten tab arsip.
            </TabsContent>
          </Tabs>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Contoh modal"
        description="Fokus terkunci di dalam dialog; Esc menutup."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
                notify.success('Tersimpan');
              }}
            >
              Simpan
            </Button>
          </>
        }
      >
        <Field label="Contoh isian">
          <Input placeholder="Ketik sesuatu…" />
        </Field>
      </Modal>
    </main>
  );
}
