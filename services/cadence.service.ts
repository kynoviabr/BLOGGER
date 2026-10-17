export interface CadenceSlotConfig {
  time: string; // "09:00", "14:30"
  preferredCategoryId?: string | null; // Categoria específica para este slot (opcional)
}

export interface CadencePlanOptions {
  startDate: string; // YYYY-MM-DD
  slots: CadenceSlotConfig[]; // Lista de horários por dia (ex: ["09:00", "15:00"])
  daysMode: 'all' | 'workdays' | 'custom';
  customDays?: number[]; // [1, 2, 3, 4, 5] (1 = Seg, 5 = Sex, 6 = Sáb, 0 = Dom)
  distributionMode: 'balanced' | 'sequential' | 'category_slots';
}

export interface PlannedScheduleItem {
  calendarId: string;
  title: string;
  categoryId?: string | null;
  categoryName?: string;
  blogName?: string;
  scheduledAt: string; // ISO 8601 string
  displayDate: string; // "18/10/2026"
  displayTime: string; // "09:00"
  dayOfWeekName: string; // "Segunda-feira"
}

export class CadenceService {
  private static DAY_NAMES = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];

  /**
   * Distribui pautas em janelas de publicação cronológicas com base na cadência informada.
   */
  static calculateSchedule(
    items: Array<{
      id: string;
      proposed_title: string;
      topic: string;
      category_id?: string | null;
      category?: { id: string; name: string } | null;
      blog?: { name: string } | null;
    }>,
    options: CadencePlanOptions
  ): PlannedScheduleItem[] {
    if (!items || items.length === 0 || !options.slots || options.slots.length === 0) {
      return [];
    }

    const { startDate, slots, daysMode, customDays, distributionMode } = options;

    // 1. Organizar pautas de acordo com o modo de distribuição
    const sortedItems = this.organizeItems(items, distributionMode, slots);

    // 2. Preparar gerador de datas
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    let currentDate = new Date(startYear, startMonth - 1, startDay, 12, 0, 0);

    const result: PlannedScheduleItem[] = [];
    let itemIndex = 0;

    // Limite de segurança de 365 dias para evitar loop infinito
    let dayCount = 0;
    while (itemIndex < sortedItems.length && dayCount < 365) {
      dayCount++;
      const dayOfWeek = currentDate.getDay();

      // Verificar se o dia atual é elegível
      let isDayAllowed = true;
      if (daysMode === 'workdays') {
        isDayAllowed = dayOfWeek >= 1 && dayOfWeek <= 5; // Seg (1) a Sex (5)
      } else if (daysMode === 'custom' && customDays) {
        isDayAllowed = customDays.includes(dayOfWeek);
      }

      if (isDayAllowed) {
        // Preencher cada slot do dia
        for (const slot of slots) {
          if (itemIndex >= sortedItems.length) break;

          const item = sortedItems[itemIndex];
          const [hourStr, minuteStr] = slot.time.split(':');
          const hour = parseInt(hourStr, 10) || 9;
          const minute = parseInt(minuteStr, 10) || 0;

          // Cria data com horário específico
          const slotDate = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate(),
            hour,
            minute,
            0,
            0
          );

          const year = slotDate.getFullYear();
          const month = String(slotDate.getMonth() + 1).padStart(2, '0');
          const day = String(slotDate.getDate()).padStart(2, '0');
          const displayDate = `${day}/${month}/${year}`;
          const displayTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

          result.push({
            calendarId: item.id,
            title: item.proposed_title || item.topic,
            categoryId: item.category_id || item.category?.id || null,
            categoryName: item.category?.name || 'Geral',
            blogName: item.blog?.name,
            scheduledAt: slotDate.toISOString(),
            displayDate,
            displayTime,
            dayOfWeekName: this.DAY_NAMES[dayOfWeek],
          });

          itemIndex++;
        }
      }

      // Avança para o próximo dia
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Ordena e intercala pautas por categoria ou sequência para balanceamento.
   */
  private static organizeItems(
    items: Array<{
      id: string;
      proposed_title: string;
      topic: string;
      category_id?: string | null;
      category?: { id: string; name: string } | null;
      blog?: { name: string } | null;
    }>,
    mode: 'balanced' | 'sequential' | 'category_slots',
    slots: CadenceSlotConfig[]
  ) {
    if (mode === 'sequential') {
      return [...items];
    }

    if (mode === 'balanced') {
      // Agrupa por categoria
      const groups = new Map<string, typeof items>();
      for (const item of items) {
        const catKey = item.category_id || item.category?.id || 'uncategorized';
        if (!groups.has(catKey)) {
          groups.set(catKey, []);
        }
        groups.get(catKey)!.push(item);
      }

      // Intercalação Round-Robin (pega 1 de cada categoria alternadamente)
      const interleaved: typeof items = [];
      const categories = Array.from(groups.values());
      let hasMore = true;
      let depth = 0;

      while (hasMore) {
        hasMore = false;
        for (const catList of categories) {
          if (depth < catList.length) {
            interleaved.push(catList[depth]);
            hasMore = true;
          }
        }
        depth++;
      }

      return interleaved;
    }

    // Se for por slots dedicados
    return [...items];
  }
}
