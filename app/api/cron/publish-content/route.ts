import { NextResponse } from "next/server";
export const maxDuration = 10;
export async function GET() {
  return NextResponse.json({ success: false, error: "Gone: this cron has been retired. Publishing now runs in Supabase Edge (publish-content) via pg_cron -> process-jobs." }, { status: 410 });
}
export async function POST() {
  return NextResponse.json({ success: false, error: "Gone: retired cron route. Use Supabase pg_cron/process-jobs." }, { status: 410 });
}
