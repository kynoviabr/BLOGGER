import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { LogService } from '@/services/log.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const {
      status,
      requested,
      generated,
      remaining = 0,
      failed = 0,
      totalDurationMs = 0,
      blogId,
      category,
    } = body;

    const eventName = status === 'completed' ? 'API.ideas.queueCompleted' : 'API.ideas.queueInterrupted';
    const message =
      status === 'completed'
        ? `Lote de ${generated}/${requested} pautas concluído com sucesso em ${(totalDurationMs / 1000).toFixed(1)}s`
        : `Geração de pautas interrompida: ${generated}/${requested} geradas, ${remaining} restantes (${failed} falhas)`;

    await LogService.recordLog('info', eventName, message, {
      requested,
      generated,
      remaining,
      failed,
      totalDurationMs,
      blogId,
      category,
      userId: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
