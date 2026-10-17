import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ImageOptimizer } from '../lib/image-optimizer';

async function main() {
  const envPath = fs.existsSync('.env.migration') ? '.env.migration' : '.env.local';
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envMap: Record<string, string> = {};

  for (const line of envContent.split('\n')) {
    const [k, ...v] = line.trim().split('=');
    if (k) envMap[k] = v.join('=').replace(/^["']|["']$/g, '');
  }

  const supabaseUrl = envMap.NEXT_PUBLIC_SUPABASE_URL || envMap.SUPABASE_URL;
  const supabaseKey = envMap.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL ou SERVICE_ROLE_KEY não configurados.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('====================================================');
  console.log('🔄 MIGRAÇÃO DE IMAGENS DO SUPABASE PARA WEBP');
  console.log('Supabase URL:', supabaseUrl);
  console.log('Bucket alvo: blog-assets');
  console.log('====================================================\n');

  // 1. Função recursiva para listar todos os arquivos no bucket
  async function listAllFiles(folder = ''): Promise<string[]> {
    const { data: items, error } = await supabase.storage.from('blog-assets').list(folder, { limit: 100 });
    if (error || !items) return [];

    let files: string[] = [];
    for (const item of items) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null) {
        const sub = await listAllFiles(fullPath);
        files = files.concat(sub);
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allFiles = await listAllFiles('');
  const nonWebpFiles = allFiles.filter((f) => /\.(jpe?g|png)$/i.test(f));

  console.log(`Encontrados ${allFiles.length} arquivos no bucket.`);
  console.log(`${nonWebpFiles.length} arquivos precisam ser convertidos para WebP.\n`);

  if (nonWebpFiles.length === 0) {
    console.log('✅ Todas as imagens no Supabase Storage já estão em WebP!');
    return;
  }

  let totalOriginalBytes = 0;
  let totalOptimizedBytes = 0;
  let convertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < nonWebpFiles.length; i++) {
    const filePath = nonWebpFiles[i];
    const newPath = filePath.replace(/\.(jpe?g|png)$/i, '.webp');
    console.log(`[${i + 1}/${nonWebpFiles.length}] Convertendo: ${filePath} -> ${newPath}`);

    try {
      // 1. Download do arquivo atual
      const { data: blob, error: dlErr } = await supabase.storage.from('blog-assets').download(filePath);
      if (dlErr || !blob) {
        console.error(`  ❌ Erro ao baixar ${filePath}:`, dlErr?.message);
        errorCount++;
        continue;
      }

      const inputBuffer = Buffer.from(await blob.arrayBuffer());
      const inputMime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      totalOriginalBytes += inputBuffer.length;

      // 2. Otimização para WebP
      const optimized = await ImageOptimizer.optimize(inputBuffer, inputMime, { format: 'webp', quality: 82 });
      totalOptimizedBytes += optimized.buffer.length;

      // 3. Upload do novo WebP para o Supabase Storage
      const { error: upErr } = await supabase.storage
        .from('blog-assets')
        .upload(newPath, optimized.buffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (upErr) {
        console.error(`  ❌ Erro ao subir ${newPath}:`, upErr.message);
        errorCount++;
        continue;
      }

      // 4. Obter a nova URL pública
      const { data: pubUrlData } = supabase.storage.from('blog-assets').getPublicUrl(newPath);
      const newPublicUrl = pubUrlData.publicUrl;

      // 5. Atualizar registros em media_assets
      const { error: dbErr } = await supabase
        .from('media_assets')
        .update({
          storage_path: newPath,
          public_url: newPublicUrl,
        })
        .or(`storage_path.eq.${filePath},public_url.ilike.%${encodeURIComponent(path.basename(filePath))}%`);

      if (dbErr) {
        console.warn(`  ⚠️ Aviso ao atualizar media_assets para ${filePath}:`, dbErr.message);
      }

      // 6. Remover o arquivo antigo JPG/PNG para liberar espaço
      const { error: rmErr } = await supabase.storage.from('blog-assets').remove([filePath]);
      if (rmErr) {
        console.warn(`  ⚠️ Aviso ao remover arquivo antigo ${filePath}:`, rmErr.message);
      }

      const savedPct = (
        ((inputBuffer.length - optimized.buffer.length) / inputBuffer.length) *
        100
      ).toFixed(1);

      console.log(`  ✅ Sucesso: ${(inputBuffer.length / 1024).toFixed(1)} KB -> ${(optimized.buffer.length / 1024).toFixed(1)} KB (Economia de ${savedPct}%)`);
      convertedCount++;
    } catch (err) {
      console.error(`  ❌ Falha no processamento de ${filePath}:`, err);
      errorCount++;
    }
  }

  const totalSavedMB = ((totalOriginalBytes - totalOptimizedBytes) / (1024 * 1024)).toFixed(2);
  const totalSavedPct = (((totalOriginalBytes - totalOptimizedBytes) / totalOriginalBytes) * 100).toFixed(1);

  console.log('\n====================================================');
  console.log('🎉 MIGRAÇÃO CONCLUÍDA!');
  console.log(`Arquivos convertidos com sucesso: ${convertedCount}/${nonWebpFiles.length}`);
  if (errorCount > 0) console.log(`Erros: ${errorCount}`);
  console.log(`Espaço original: ${(totalOriginalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Espaço após WebP: ${(totalOptimizedBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Espaço total liberado no Supabase: ${totalSavedMB} MB (${totalSavedPct}% de redução)`);
  console.log('====================================================');
}

main().catch(console.error);
