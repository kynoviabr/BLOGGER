// Planejamento automático de publicação para artigos aprovados sem data.
// Função pura: não toca no banco, só calcula em quais dias e horários cada artigo entra.

export type WeekdayMode = "all" | "workdays" | "weekends";

export interface AutoScheduleRule {
  categoryId: string;
  perDay: number;
}

export interface AutoScheduleCandidate {
  id: string; // content_items.id
  categoryId: string | null;
  categoryName: string;
  title: string;
}

export interface AutoSchedulePlanOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive)
  weekdayMode: WeekdayMode;
  rules: AutoScheduleRule[]; // ordem de prioridade dentro do dia
  times: string[]; // horários "HH:MM", um por post do dia
  utcOffset?: string; // fuso do blog, padrão BRT
  now?: Date;
}

export interface AutoSchedulePlanItem {
  contentId: string;
  title: string;
  categoryName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  scheduledAt: string; // ISO
}

export interface AutoSchedulePlan {
  items: AutoSchedulePlanItem[];
  leftoverByCategory: Record<string, number>; // artigos que não couberam no intervalo
  skippedPastSlots: number;
}

const DEFAULT_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function matchesWeekday(date: Date, mode: WeekdayMode): boolean {
  const dow = date.getUTCDay(); // 0 = domingo, 6 = sábado
  if (mode === "workdays") return dow >= 1 && dow <= 5;
  if (mode === "weekends") return dow === 0 || dow === 6;
  return true;
}

export function buildAutoSchedulePlan(
  candidates: AutoScheduleCandidate[],
  options: AutoSchedulePlanOptions
): AutoSchedulePlan {
  const offset = options.utcOffset ?? DEFAULT_OFFSET;
  const now = options.now ?? new Date();
  const times = [...new Set(options.times)].filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();

  // Fila por categoria, na ordem recebida (ordem de aprovação).
  const queues = new Map<string, AutoScheduleCandidate[]>();
  for (const rule of options.rules) {
    queues.set(
      rule.categoryId,
      candidates.filter((c) => c.categoryId === rule.categoryId)
    );
  }

  const items: AutoSchedulePlanItem[] = [];
  let skippedPastSlots = 0;

  const start = parseYmd(options.startDate);
  const end = parseYmd(options.endDate);
  if (times.length === 0 || options.rules.length === 0 || end < start) {
    return { items, leftoverByCategory: countLeftovers(queues), skippedPastSlots };
  }

  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const day = new Date(t);
    if (!matchesWeekday(day, options.weekdayMode)) continue;

    // Monta a lista de posts do dia respeitando a quantidade por categoria e o total de horários.
    const picks: AutoScheduleCandidate[] = [];
    for (const rule of options.rules) {
      const queue = queues.get(rule.categoryId);
      if (!queue) continue;
      for (let i = 0; i < rule.perDay && queue.length > 0 && picks.length < times.length; i++) {
        picks.push(queue.shift()!);
      }
    }

    const dateStr = formatYmd(day);
    picks.forEach((pick, index) => {
      const time = times[index];
      const scheduled = new Date(`${dateStr}T${time}:00${offset}`);
      if (scheduled.getTime() <= now.getTime()) {
        // Horário já passou: o artigo volta para a fila para o próximo dia válido.
        skippedPastSlots++;
        queues.get(pick.categoryId ?? "")?.unshift(pick);
        return;
      }
      items.push({
        contentId: pick.id,
        title: pick.title,
        categoryName: pick.categoryName,
        date: dateStr,
        time,
        scheduledAt: scheduled.toISOString(),
      });
    });
  }

  return { items, leftoverByCategory: countLeftovers(queues), skippedPastSlots };
}

function countLeftovers(queues: Map<string, AutoScheduleCandidate[]>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [categoryId, queue] of queues) {
    if (queue.length > 0) result[categoryId] = queue.length;
  }
  return result;
}
