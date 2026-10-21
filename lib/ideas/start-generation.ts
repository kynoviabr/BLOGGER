import { revertIdeasToSavedAction } from "@/app/actions/calendar";

/**
 * Dispara, a partir do navegador, a geração do artigo de cada pauta. O artigo
 * aparece em Content como "Em revisão" quando o worker do Supabase terminar.
 */
export async function startArticleGeneration(
  calendarIds: string[]
): Promise<{ started: Array<{ calendarId: string; contentId: string }>; failed: string[] }> {
  const started: Array<{ calendarId: string; contentId: string }> = [];
  const failed: string[] = [];

  for (const calendarId of calendarIds) {
    try {
      const res = await fetch(`/api/calendar/${calendarId}/execute`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success || !data.contentId) throw new Error(data.error);
      started.push({ calendarId, contentId: data.contentId });
    } catch {
      failed.push(calendarId);
    }
  }

  // Sem isso a pauta ficaria IN_PROGRESS sem artigo, invisível em todas as telas.
  if (failed.length > 0) {
    await revertIdeasToSavedAction(failed).catch(() => undefined);
  }

  return { started, failed };
}
