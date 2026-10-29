// Etapa de uma pauta no fluxo: Ideia → Calendário → Produção → Revisão → Publicação.
// Usada no calendário e no agendador em massa para mostrar onde cada pauta está.

export type EditorialStage = 'idea' | 'pauta' | 'producing' | 'review' | 'approved' | 'published' | 'failed';

export interface StageInfo {
  stage: EditorialStage;
  label: string;
  className: string;
  /** Aviso quando a data está chegando (ou passou) e o artigo ainda não foi aprovado. */
  warning: string | null;
}

const STAGE_LABEL: Record<EditorialStage, { label: string; className: string }> = {
  idea: { label: 'Ideia', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  pauta: { label: 'Pauta agendada', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900' },
  producing: { label: 'Em produção', className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900' },
  review: { label: 'Falta aprovar', className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900' },
  approved: { label: 'Aprovado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900' },
  published: { label: 'Publicado', className: 'bg-emerald-600 text-white border-emerald-700' },
  failed: { label: 'Falha', className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900' },
};

const WARNING_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function editorialStage(item: {
  status: string;
  scheduled_at?: string | null;
  content_item?: { status: string } | null;
}): StageInfo {
  const contentStatus = item.content_item?.status;
  let stage: EditorialStage;
  if (item.status === 'PUBLISHED' || contentStatus === 'published') stage = 'published';
  else if (item.status === 'FAILED' || contentStatus === 'publish_failed') stage = 'failed';
  else if (contentStatus === 'scheduled' || contentStatus === 'ready' || contentStatus === 'publishing') stage = 'approved';
  else if (contentStatus === 'reviewing') stage = 'review';
  else if (contentStatus === 'researching' || (contentStatus === 'draft' && item.status === 'IN_PROGRESS')) stage = 'producing';
  else if (item.status === 'IDEA') stage = 'idea';
  else stage = 'pauta';

  let warning: string | null = null;
  const when = item.scheduled_at ? new Date(item.scheduled_at).getTime() : null;
  if (when && (stage === 'pauta' || stage === 'producing' || stage === 'review')) {
    if (when <= Date.now()) {
      warning = 'A data passou e o artigo não foi aprovado, por isso não foi publicado.';
    } else if (when - Date.now() <= WARNING_WINDOW_MS) {
      warning = 'Sem aprovação, este artigo não será publicado na data.';
    }
  }
  return { stage, ...STAGE_LABEL[stage], warning };
}
