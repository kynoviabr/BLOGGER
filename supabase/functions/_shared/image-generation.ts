import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export class ImageGenerationError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

function detectMime(buffer: Uint8Array): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (String.fromCharCode(...buffer.subarray(0, 4)) === "RIFF" && String.fromCharCode(...buffer.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function callTogether(prompt: string, config: JsonRecord | null): Promise<Uint8Array> {
  const apiKey = String(config?.apiKey ?? Deno.env.get("TOGETHER_API_KEY") ?? "");
  if (!apiKey) throw new ImageGenerationError("TOGETHER_API_KEY não configurada", false);
  const model = String(config?.model ?? Deno.env.get("TOGETHER_IMAGE_MODEL") ?? "black-forest-labs/FLUX.1.1-pro");
  const response = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, width: 1216, height: 672, n: 1, response_format: model.includes("pro") ? undefined : "b64_json", steps: model.includes("pro") ? undefined : 28 }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new ImageGenerationError(`Together HTTP ${response.status}: ${String((body as { error?: { message?: string } }).error?.message ?? response.statusText)}`, response.status === 429 || response.status >= 500);
  const data = (body.data as Array<{ b64_json?: string; url?: string }> | undefined);
  const item = data?.[0];
  if (!item) throw new ImageGenerationError("Together: nenhuma imagem retornada", true);
  if (item.b64_json) return Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0));
  if (item.url) {
    const r = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new ImageGenerationError(`Falha ao baixar imagem Together: ${r.status}`, true);
    return new Uint8Array(await r.arrayBuffer());
  }
  throw new ImageGenerationError("Together: payload sem b64_json nem url", true);
}

async function callOpenAI(prompt: string, config: JsonRecord | null): Promise<Uint8Array> {
  const apiKey = String(config?.apiKey ?? Deno.env.get("OPENAI_API_KEY") ?? "");
  if (!apiKey) throw new ImageGenerationError("OPENAI_API_KEY não configurada", false);
  const model = String(config?.model ?? Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1-mini");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, n: 1, size: Deno.env.get("OPENAI_IMAGE_SIZE") ?? "1536x1024", quality: Deno.env.get("OPENAI_IMAGE_QUALITY") ?? "medium" }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new ImageGenerationError(`OpenAI HTTP ${response.status}`, response.status === 429 || response.status >= 500);
  const data = (body.data as Array<{ b64_json?: string; url?: string }> | undefined);
  const item = data?.[0];
  if (!item) throw new ImageGenerationError("OpenAI: nenhuma imagem retornada", true);
  if (item.b64_json) return Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0));
  if (item.url) {
    const r = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new ImageGenerationError(`Falha ao baixar imagem OpenAI: ${r.status}`, true);
    return new Uint8Array(await r.arrayBuffer());
  }
  throw new ImageGenerationError("OpenAI: payload sem imagem", true);
}

async function callPollinations(prompt: string): Promise<Uint8Array> {
  const seed = Math.floor(Math.random() * 1e7);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1216&height=672&seed=${seed}&model=flux&nologo=true`;
  const r = await fetch(url, { headers: { Accept: "image/*" }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new ImageGenerationError(`Pollinations HTTP ${r.status}`, r.status === 429 || r.status >= 500);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (!detectMime(buf)) throw new ImageGenerationError("Pollinations: resposta não é imagem válida", false);
  return buf;
}

export async function generateImageJob(payload: JsonRecord, db?: SupabaseClient): Promise<JsonRecord> {
  const contentId = String(payload.contentId ?? "");
  if (!contentId) throw new ImageGenerationError("image_generation requer payload.contentId", false);

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const client = db ?? createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const startedAt = Date.now();

  const { data: item, error } = await client.from("content_items")
    .select("*, blog:blogs(*), featured_image:media_assets!content_items_featured_image_id_fkey(*)").eq("id", contentId).maybeSingle();
  if (error || !item) throw new ImageGenerationError("Artigo não encontrado para geração de imagem", false);
  const blog = item.blog as JsonRecord | null;
  if (!blog) throw new ImageGenerationError("Blog não encontrado", false);

  // Idempotência: se já tem featured_image, retorna sem regenerar
  if (item.featured_image_id) {
    return { contentId, status: "already_has_image", mediaAssetId: item.featured_image_id };
  }

  // Dedupe por contentId: se já existe media_asset para este content, reutiliza
  const { data: existingMedia } = await client.from("media_assets").select("id,public_url").eq("content_id", contentId).maybeSingle();
  if (existingMedia) {
    await client.from("content_items").update({ featured_image_id: existingMedia.id }).eq("id", contentId).is("featured_image_id", null);
    return { contentId, status: "deduplicated", mediaAssetId: existingMedia.id };
  }

  const title = String(item.title ?? "");
  const promptOverride = String(payload.prompt ?? "").trim();
  const visualStyles = [
    "Conceptual minimalist still life photography, real physical objects in elegant studio composition (golden keys, precision scales, metallic gears, growing green plants on solid marble)",
    "Editorial isometric 3D render, minimalist Blender/C4D aesthetic, smooth matte textures, soft studio lighting, abstract geometric shapes representing balance and progress",
    "Modern architectural and urban photography, grand perspective, majestic concrete and glass facades, illuminated bridges, dynamic urban geometry conveying scale and future",
    "Artistic macro photography, extreme close-up of rich textures, brushed metal, intricate watchmaking mechanics, watermark paper fibers, dramatic chiaroscuro lighting",
    "Editorial conceptual flat illustration and collage, The New Yorker and The Economist cover style, bold contrasting colors, modern graphic design",
  ];
  const style = visualStyles[Math.floor(Math.random() * visualStyles.length)];
  const prompt = promptOverride || `${style}. Visual metaphor for editorial theme: "${title}". Editorial studio lighting, shallow depth of field, 8k, hyper-detailed, clean elegant composition, no text, no logos, no watermarks, no screens, no laptops, no smartphones, no office desks`;

  // Pollinations (gratuito, baixa qualidade) só roda quando escolhido explicitamente em IMAGE_PROVIDER.
  const explicitProvider = String(Deno.env.get("IMAGE_PROVIDER") ?? Deno.env.get("IMAGE_PROVIDER_TYPE") ?? "").toLowerCase();
  const globallyPreferred = explicitProvider || (Deno.env.get("TOGETHER_API_KEY") ? "together" : Deno.env.get("OPENAI_API_KEY") ? "openai" : "");
  const organizationId = String(blog.organization_id ?? "");
  const { data: creds } = await client.from("organization_provider_credentials").select("provider").eq("organization_id", organizationId).eq("enabled", true).in("provider", ["together", "openai"]);
  const configured = (creds ?? []).map((r) => String(r.provider));
  const preferred = configured.includes(globallyPreferred) ? globallyPreferred : configured[0] ?? globallyPreferred;

  let buffer: Uint8Array;
  let providerName: string;
  let tenantConfig: JsonRecord | null = null;
  if (preferred === "together" || preferred === "openai") {
    const { data } = await client.rpc("get_provider_runtime_config", { p_organization_id: organizationId, p_provider: preferred });
    tenantConfig = (data as JsonRecord | null) ?? null;
  }

  if (preferred === "openai") {
    buffer = await callOpenAI(prompt, tenantConfig);
    providerName = "OpenAIImageProvider";
  } else if (preferred === "together") {
    buffer = await callTogether(prompt, tenantConfig);
    providerName = "TogetherImageProvider";
  } else if (preferred === "pollinations") {
    buffer = await callPollinations(prompt);
    providerName = "PollinationsImageProvider";
  } else {
    throw new ImageGenerationError("Nenhuma chave de imagem configurada. Cadastre uma chave da Together AI (FLUX) ou da OpenAI em Settings.", false);
  }

  const mime = detectMime(buffer) ?? "image/jpeg";
  // Upload para blog-assets/{blog_id}/{contentId}/featured-{ts}.webp|jpg
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const filePath = `${item.blog_id}/${contentId}/featured-${Date.now()}.${ext}`;
  const { data: uploadData, error: uploadErr } = await client.storage.from("blog-assets").upload(filePath, buffer, { contentType: mime, upsert: false });
  let storagePath: string;
  let publicUrl: string;
  if (!uploadErr && uploadData) {
    storagePath = uploadData.path;
    const { data: pub } = client.storage.from("blog-assets").getPublicUrl(uploadData.path);
    publicUrl = pub.publicUrl;
  } else {
    // Se já existe (race), busca existente
    if (uploadErr?.message?.includes("already exists") || uploadErr?.message?.includes("Duplicate")) {
      const { data: dup } = await client.from("media_assets").select("id").eq("content_id", contentId).maybeSingle();
      if (dup) return { contentId, status: "deduplicated", mediaAssetId: dup.id };
    }
    throw new ImageGenerationError(`Falha no upload blog-assets: ${uploadErr?.message ?? "desconhecido"}`, true);
  }

  const { data: mediaAsset, error: mediaErr } = await client.from("media_assets").insert({
    blog_id: item.blog_id, content_id: contentId, type: "image", storage_path: storagePath, public_url: publicUrl, alt_text: `Imagem de destaque para ${title}`.slice(0, 300), prompt, provider: providerName,
  }).select("id").single();
  if (mediaErr) throw new ImageGenerationError(`Falha ao registrar media_asset: ${mediaErr.message}`, true);

  await client.from("content_items").update({ featured_image_id: mediaAsset.id }).eq("id", contentId);
  const durationMs = Date.now() - startedAt;
  await client.from("ai_runs").insert({ content_id: contentId, agent: "SupabaseImageWorker", provider: providerName, model: String(tenantConfig?.model ?? preferred), status: "completed", input_summary: prompt.slice(0, 200), output_summary: `Imagem ${publicUrl.slice(0, 80)}`, duration_ms: durationMs, estimated_cost: 0 });
  await client.from("system_logs").insert({ level: "info", service: "EdgeWorker.generateImage", message: `Imagem ${contentId} gerada via ${providerName}`, metadata: { contentId, provider: providerName, durationMs } });
  return { contentId, status: "completed", mediaAssetId: mediaAsset.id, publicUrl, provider: providerName };
}
