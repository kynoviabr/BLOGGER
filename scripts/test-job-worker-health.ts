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

function required(name: string, ...fallbacks: string[]): string {
  const value = process.env[name] ?? fallbacks.map((fallback) => process.env[fallback]).find(Boolean);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  loadLocalEnvironment();
  const url = required('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const cronSecret = required('JOB_WORKER_CRON_SECRET', 'PUBLISH_CRON_SECRET', 'CRON_SECRET');
  const endpoint = `${url}/functions/v1/process-jobs`;
  const baseHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const unauthorized = await fetch(endpoint, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({ healthcheck: true }),
  });
  if (unauthorized.status !== 401) {
    throw new Error(`Worker accepted a request without cron secret (${unauthorized.status})`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...baseHeaders, 'x-cron-secret': cronSecret },
    body: JSON.stringify({ healthcheck: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true || payload?.scheduler !== 'supabase_pg_cron') {
    throw new Error(`Worker healthcheck failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const db = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const health = await db.rpc('get_background_job_health');
  if (health.error) throw new Error(`Queue health RPC failed: ${health.error.message}`);
  const databaseHealth = health.data as Record<string, unknown>;
  if (databaseHealth.cron_active !== true || databaseHealth.cron_schedule !== '* * * * *') {
    throw new Error(`Supabase cron is not active: ${JSON.stringify(databaseHealth)}`);
  }
  const latestRun = databaseHealth.latest_run as Record<string, unknown> | null;
  if (latestRun && latestRun.status !== 'succeeded') {
    throw new Error(`Latest Supabase cron dispatch failed: ${JSON.stringify(latestRun)}`);
  }

  const publicDb = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicHealth = await publicDb.rpc('get_background_job_health');
  if (!publicHealth.error) throw new Error('Queue health RPC is unexpectedly available to anon');

  console.log('Job worker healthcheck passed:', JSON.stringify({
    authenticationEnforced: true,
    cronActive: databaseHealth.cron_active,
    cronSchedule: databaseHealth.cron_schedule,
    latestRunStatus: latestRun?.status ?? 'pending-first-run',
    jobCounts: databaseHealth.job_counts,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
