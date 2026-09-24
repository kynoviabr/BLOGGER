import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const envMap: Record<string, string> = {};
for (const line of env.split('\n')) {
  const [k, ...v] = line.trim().split('=');
  if (k) envMap[k] = v.join('=').replace(/^[\"']|[\"']$/g, '');
}

const supabaseAdmin = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);

function detectMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) return 'image/png';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  return null;
}

async function verifyAll() {
  const calendarId = 'befcd0c1-e936-4b87-a4e7-bbac15bb023a';

  console.log('==================================================');
  console.log('VERIFICAÇÃO COMPLETA DO PIPELINE E2E (JPEG)');
  console.log('==================================================\n');

  // 1. CONTENT_ITEMS
  console.log('--- 1. CONTENT_ITEMS ---');
  const { data: contentItem, error: contentErr } = await supabaseAdmin
    .from('content_items')
    .select('*')
    .eq('editorial_calendar_id', calendarId)
    .single();

  console.log('ID:', contentItem?.id);
  console.log('Título:', contentItem?.title);
  console.log('Slug:', contentItem?.slug);
  console.log('Status:', contentItem?.status);
  console.log('featured_image_id:', contentItem?.featured_image_id);

  // 2. MEDIA_ASSETS
  console.log('\n--- 2. MEDIA_ASSETS ---');
  const { data: mediaAsset, error: mediaErr } = await supabaseAdmin
    .from('media_assets')
    .select('*')
    .eq('id', contentItem?.featured_image_id)
    .single();

  console.log('ID:', mediaAsset?.id);
  console.log('content_id:', mediaAsset?.content_id);
  console.log('Provider:', mediaAsset?.provider);
  console.log('Storage path:', mediaAsset?.storage_path);
  console.log('Public URL:', mediaAsset?.public_url);
  console.log('Prompt:', mediaAsset?.prompt);

  // 3. SUPABASE STORAGE (DOWNLOAD & MAGIC BYTES)
  console.log('\n--- 3. SUPABASE STORAGE GET ---');
  const storageRes = await fetch(mediaAsset.public_url);
  console.log('Storage HTTP Status:', storageRes.status);
  console.log('Storage Content-Type:', storageRes.headers.get('content-type'));
  const storageBuf = Buffer.from(await storageRes.arrayBuffer());
  console.log('Storage Buffer length:', storageBuf.length, 'bytes');
  const storageDetectedMime = detectMime(storageBuf);
  console.log('Storage Magic Bytes detectados:', storageDetectedMime);

  // Salvar imagem para inspeção visual local
  // Salvar imagem para inspeção visual local
  const artifactImagePath = '/Users/dempas/.gemini/antigravity/brain/54fc6caf-413a-489d-9a79-529ac0c9d04f/blogger-e2e-published-image.jpg';
  fs.writeFileSync(artifactImagePath, storageBuf);
  console.log(`Imagem salva localmente em: ${artifactImagePath}`);

  // 4. WORDPRESS POST & MEDIA
  console.log('\n--- 4. WORDPRESS REST API ---');
  const wpSiteUrl = envMap.WORDPRESS_SITE_URL.replace(/\/+$/, '');
  const wpUser = envMap.WORDPRESS_USERNAME;
  const wpPass = envMap.WORDPRESS_APPLICATION_PASSWORD;
  const wpAuth = 'Basic ' + Buffer.from(`${wpUser}:${wpPass}`).toString('base64');

  // Recupera wpPostId do log de sucesso do pipeline
  const { data: pipelineLogs } = await supabaseAdmin
    .from('system_logs')
    .select('metadata')
    .eq('service', 'PipelineService')
    .order('created_at', { ascending: false })
    .limit(5);

  const matchedLog = pipelineLogs?.find((l: any) => l.metadata?.calendarId === calendarId);
  const targetPostId = matchedLog?.metadata?.wpPostId;

  console.log('Target WP Post ID detectado:', targetPostId);

  const postUrl = targetPostId
    ? `${wpSiteUrl}/wp-json/wp/v2/posts/${targetPostId}`
    : `${wpSiteUrl}/wp-json/wp/v2/posts?per_page=1&orderby=date&order=desc`;

  const postRes = await fetch(postUrl, {
    headers: { Authorization: wpAuth },
  });
  const postResultRaw = await postRes.json();
  const postData = Array.isArray(postResultRaw) ? postResultRaw[0] : postResultRaw;

  console.log('WP Post ID:', postData.id);
  console.log('WP Post Link:', postData.link);
  console.log('WP Post Status:', postData.status);
  console.log('WP Post featured_media ID:', postData.featured_media);

  const mediaRes = await fetch(`${wpSiteUrl}/wp-json/wp/v2/media/${postData.featured_media}`, {
    headers: { Authorization: wpAuth },
  });
  const mediaData = await mediaRes.json();
  console.log('WP Media ID:', mediaData.id);
  console.log('WP Media MIME:', mediaData.mime_type);
  console.log('WP Media Source URL:', mediaData.source_url);

  // Testar GET no WordPress Media source_url
  const wpMediaFetch = await fetch(mediaData.source_url);
  console.log('WP Media source_url HTTP:', wpMediaFetch.status);
  console.log('WP Media source_url Content-Type:', wpMediaFetch.headers.get('content-type'));
  const wpMediaBuf = Buffer.from(await wpMediaFetch.arrayBuffer());
  console.log('WP Media buffer bytes:', wpMediaBuf.length);
  console.log('WP Media Magic Bytes detectados:', detectMime(wpMediaBuf));

  // 5. SYSTEM_LOGS & AUDIT
  console.log('\n--- 5. SYSTEM_LOGS DO SUPABASE ---');
  const { data: logs } = await supabaseAdmin
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  logs?.forEach((l) => {
    console.log(`[${l.created_at}] [${l.level}] [${l.service}]: ${l.message}`);
    if (l.metadata) console.log('  Metadata:', JSON.stringify(l.metadata));
  });
}

verifyAll().catch((err) => {
  console.error('Erro na verificação:', err);
  process.exit(1);
});
