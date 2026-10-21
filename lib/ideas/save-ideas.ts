interface DuplicateInfo {
  index: number;
  title: string;
  score: number;
  conflict?: { title: string; source: string };
}

const SOURCE_LABELS: Record<string, string> = {
  WORDPRESS: "post publicado",
  CALENDAR: "pauta",
  CONTENT: "artigo",
  BATCH: "outra ideia deste lote",
};

/**
 * Envia ideias para /api/content/ideas/batch. Se o servidor apontar pautas muito
 * parecidas com o que já existe no blog, pergunta ao usuário antes de salvar.
 * Retorna null quando o usuário desiste.
 */
export async function saveIdeasBatch(body: Record<string, unknown>): Promise<{ count: number; data: Array<{ id: string }> } | null> {
  const post = (extra: Record<string, unknown> = {}) =>
    fetch("/api/content/ideas/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ...extra }),
    });

  let response = await post();
  let data = await response.json().catch(() => ({}));

  if (response.status === 409 && Array.isArray(data.duplicates)) {
    const lines = (data.duplicates as DuplicateInfo[]).slice(0, 5).map((d) => {
      const what = d.conflict ? `${SOURCE_LABELS[d.conflict.source] ?? "conteúdo"} "${d.conflict.title}"` : "conteúdo existente";
      return `• "${d.title}" (${Math.round(d.score * 100)}% parecida com ${what})`;
    });
    const confirmed = window.confirm(
      `Estas pautas são muito parecidas com conteúdo que já existe neste blog:\n\n${lines.join("\n")}\n\nSalvar mesmo assim?`
    );
    if (!confirmed) return null;

    response = await post({ allowDuplicates: true });
    data = await response.json().catch(() => ({}));
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Erro ao salvar as pautas (HTTP ${response.status}).`);
  }
  return { count: data.count, data: data.data };
}
