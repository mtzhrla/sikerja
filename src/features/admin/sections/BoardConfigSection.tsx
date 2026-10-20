import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { ROUTES } from '@/lib/routes';
import { useSteps } from '@/hooks/queries';
import type { StepKind } from '@/services/types';
import { TaxonomySection } from './TaxonomySection';
import { TemplatesSection } from './TemplatesSection';

const KIND_LABEL: Record<StepKind, { label: string; tone: 'neutral' | 'danger' | 'success' }> = {
  NORMAL: { label: 'Normal', tone: 'neutral' },
  BLOCKED: { label: 'Terhambat', tone: 'danger' },
  DONE: { label: 'Selesai', tone: 'success' },
};

/**
 * Board & Aktivitas (Docs/09 §M.4) — konfigurasi manual yang berhubungan
 * dengan Board: kategori, label, template pekerjaan, dan kolom board.
 * Modul ini BUKAN tempat mengedit Rencana Kegiatan (read-only dari spreadsheet).
 */
export function BoardConfigSection() {
  return (
    <Tabs defaultValue="kategori">
      <TabsList>
        <TabsTrigger value="kategori">Kategori & Label</TabsTrigger>
        <TabsTrigger value="template">Template Pekerjaan</TabsTrigger>
        <TabsTrigger value="kolom">Kolom Board</TabsTrigger>
      </TabsList>
      <TabsContent value="kategori">
        <div className="mt-4">
          <TaxonomySection />
        </div>
      </TabsContent>
      <TabsContent value="template">
        <div className="mt-4">
          <TemplatesSection />
        </div>
      </TabsContent>
      <TabsContent value="kolom">
        <div className="mt-4">
          <BoardColumnsCard />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function BoardColumnsCard() {
  const { data: steps, isLoading } = useSteps();

  if (isLoading) return <LoadingBlock label="Memuat kolom board…" />;

  return (
    <Card>
      <CardHeader
        title="Kolom Board"
        description="Urutan, nama, warna, dan aturan status setiap kolom. Penyuntingan (tambah/ubah/urutkan/hapus) dilakukan langsung di Board — kolom terhapus dapat dipulihkan lewat Data Terhapus."
        actions={
          <Link
            to={ROUTES.pekerjaan}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Buka Board
            <ExternalLink className="size-4" aria-hidden />
          </Link>
        }
      />
      <ul className="divide-y divide-slate-100 p-4 pt-2">
        {(steps ?? []).map((step, i) => {
          const kind = KIND_LABEL[step.kind];
          return (
            <li key={step.id} className="flex items-center gap-3 py-2.5">
              <span className="tnum w-6 text-center text-xs font-bold text-slate-400">{i + 1}</span>
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: step.color }}
              />
              <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{step.name}</p>
              <Badge tone={kind.tone}>{kind.label}</Badge>
            </li>
          );
        })}
      </ul>
      <p className="px-4 pb-4 text-xs leading-relaxed text-slate-400">
        Aturan status: kolom bertanda <strong>Terhambat</strong> membuat kartu masuk daftar “Perlu
        Perhatian” di Dashboard (bukan kolom board); kolom <strong>Selesai</strong> menandai
        pekerjaan rampung untuk perhitungan progres.
      </p>
    </Card>
  );
}
