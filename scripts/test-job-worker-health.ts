import fs from 'node:fs';
import path from 'node:path';

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
  if (!response.ok || payload?.ok !== true || payload?.cronActive !== false) {
    throw new Error(`Worker healthcheck failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  console.log('Job worker healthcheck passed: authentication enforced and cron remains inactive.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
