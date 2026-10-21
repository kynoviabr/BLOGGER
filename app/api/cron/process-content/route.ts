import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 10;

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Gone: this cron has been retired. Scheduling now runs in Supabase (pg_cron → process-jobs).',
      hint: 'Use POST /api/content/[id]/generate (enqueue content_pipeline) or trigger the Supabase worker directly.',
    },
    { status: 410 }
  );
}

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { success: false, error: 'Gone: retired cron route.' },
    { status: 410 }
  );
}
