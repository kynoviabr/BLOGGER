import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }));

import { CannibalizationGuardService, toGuardInput } from './cannibalization-guard.service';

const entry = CannibalizationGuardService.buildEntry.bind(CannibalizationGuardService);

describe('CannibalizationGuardService.scoreAgainst', () => {
  it('flags an identical title in the same blog as a high-risk duplicate', () => {
    const corpus = [entry('CALENDAR', 'Como economizar energia em casa', 'economia energia', { status: 'IDEA' })];
    const result = CannibalizationGuardService.scoreAgainst(corpus, { title: 'Como Economizar Energia em Casa' });

    expect(result.riskLevel).toBe('HIGH');
    expect(result.score).toBe(1);
    expect(result.conflictingItems[0]).toMatchObject({ source: 'CALENDAR', status: 'IDEA' });
  });

  it('does not flag an unrelated topic', () => {
    const corpus = [entry('WORDPRESS', 'Receita de bolo de cenoura fofinho')];
    const result = CannibalizationGuardService.scoreAgainst(corpus, toGuardInput({
      title: 'Melhores investimentos para iniciantes',
      keywords: 'investimentos, renda fixa',
    }));

    expect(result.riskLevel).toBe('NONE');
    expect(result.conflictingItems).toHaveLength(0);
  });

  it('treats a focus keyword already used in a title as high risk', () => {
    const corpus = [entry('CONTENT', 'Guia completo de renda fixa para 2026')];
    const result = CannibalizationGuardService.scoreAgainst(corpus, toGuardInput({
      title: 'Vale a pena começar agora?',
      keywords: 'renda fixa, iniciantes',
    }));

    expect(result.riskLevel).toBe('HIGH');
  });

  it('skips the calendar item being edited', () => {
    const corpus = [entry('CALENDAR', 'Dicas de jardinagem urbana', '', { calendarId: 'cal-1' })];
    const result = CannibalizationGuardService.scoreAgainst(
      corpus,
      { title: 'Dicas de jardinagem urbana' },
      { excludeCalendarId: 'cal-1' }
    );

    expect(result.riskLevel).toBe('NONE');
  });
});

describe('toGuardInput', () => {
  it('uses the first keyword as the focus keyword', () => {
    expect(toGuardInput({ title: 'T', keywords: ' café, chá ,' })).toEqual({
      title: 'T',
      focusKeyword: 'café',
      keywords: ['café', 'chá'],
    });
  });
});
