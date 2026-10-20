import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

function loadLocalEnvironment() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  loadLocalEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && serviceKey, 'Supabase service credentials are required');

  const db = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const workerId = `e2e-${crypto.randomUUID()}`;
  let jobId: string | null = null;

  try {
    const { data: blog, error: blogError } = await db
      .from('blogs')
      .select('id, organization_id')
      .eq('status', 'active')
      .limit(1)
      .single();
    assert(!blogError && blog, `Active blog unavailable: ${blogError?.message ?? 'not found'}`);

    const { data: inserted, error: insertError } = await db
      .from('background_jobs')
      .insert({
        organization_id: blog.organization_id,
        blog_id: blog.id,
        job_type: 'publish_content',
        payload: { test: true },
        idempotency_key: workerId,
        max_attempts: 2,
      })
      .select('*')
      .single();
    assert(!insertError && inserted, `Could not insert test job: ${insertError?.message ?? 'unknown'}`);
    jobId = inserted.id;

    const firstClaim = await db.rpc('claim_background_jobs', {
      p_worker_id: workerId,
      p_limit: 1,
      p_lease_seconds: 60,
    });
    assert(!firstClaim.error, `First claim failed: ${firstClaim.error?.message}`);
    assert(firstClaim.data?.[0]?.id === jobId, 'Worker did not claim the expected job');
    assert(firstClaim.data[0].attempts === 1, 'First claim did not increment attempts');

    const failed = await db.rpc('fail_background_job', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error: 'Intentional retry test',
      p_retryable: true,
    });
    assert(!failed.error && failed.data?.status === 'retrying', `Retry transition failed: ${failed.error?.message}`);

    const { error: rescheduleError } = await db
      .from('background_jobs')
      .update({ scheduled_at: new Date().toISOString() })
      .eq('id', jobId);
    assert(!rescheduleError, `Could not accelerate retry: ${rescheduleError?.message}`);

    const secondClaim = await db.rpc('claim_background_jobs', {
      p_worker_id: workerId,
      p_limit: 1,
      p_lease_seconds: 60,
    });
    assert(!secondClaim.error, `Second claim failed: ${secondClaim.error?.message}`);
    assert(secondClaim.data?.[0]?.id === jobId && secondClaim.data[0].attempts === 2, 'Retry claim was not atomic');

    const completed = await db.rpc('complete_background_job', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_result: { verified: true },
    });
    assert(!completed.error && completed.data === true, `Completion failed: ${completed.error?.message}`);

    const { data: events, error: eventsError } = await db
      .from('background_job_events')
      .select('to_status, attempt')
      .eq('job_id', jobId)
      .order('id');
    assert(!eventsError, `Could not read audit events: ${eventsError?.message}`);
    assert(
      events?.map((event) => event.to_status).join(',') === 'queued,running,retrying,running,completed',
      `Unexpected transition history: ${events?.map((event) => event.to_status).join(',')}`,
    );

    console.log('Background job E2E passed: claim, retry, completion and audit history verified.');
  } finally {
    if (jobId) {
      const { error } = await db.from('background_jobs').delete().eq('id', jobId);
      if (error) throw new Error(`Test cleanup failed: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
