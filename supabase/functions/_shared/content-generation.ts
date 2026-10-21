import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export class ContentGenerationError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ContentGenerationError";
  }
}

interface GeneratedArticle {
  title: string;
  slug?: string;
  metaDescription?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  content: string;
  imagePrompt?: string;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 320);
}

function wordCount(value: string): number {
  return value.replace(/<[^>]*>/g, " ").replace(/[#*_`~[\]()]/g, " ")
    .trim().split(/\s+/).filter(Boolean).length;
}

function parseJson(raw: string): GeneratedArticle {
  const clean = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
  let value: GeneratedArticle;
  try {
    value = JSON.parse(clean) as GeneratedArticle;
  } catch {
    throw new ContentGenerationError("O provedor de IA retornou JSON inválido", true);
  }
  if (!value.title?.trim() || !value.content?.trim() || value.content.length < 500) {
    throw new ContentGenerationError("O provedor retornou conteúdo incompleto", true);
  }
  return value;
}

function systemPrompt(language: string, blogName: string, niche: string): string {
  return `Você é um redator editorial sênior e especialista em SEO do portal ${blogName} (${niche}).
Escreva exclusivamente em ${language}. Produza conteúdo natural, útil, preciso e publicável.
Não invente estatísticas, taxas, leis, datas, fontes ou URLs. Se não houver fonte atual para um fato mutável, explique que ele deve ser confirmado em fonte oficial.
Não use H1 no corpo; use Markdown com H2/H3, parágrafos claros, listas apenas quando úteis e FAQ final.
Evite clichês de IA, clickbait e promessas garantidas. Conteúdo financeiro ou de saúde é informativo, não aconselhamento individual.
Responda somente com JSON válido contendo: title, slug, metaDescription, primaryKeyword, secondaryKeywords, content e imagePrompt.
O conteúdo deve ter de 1300 a 2200 palavras. O imagePrompt deve estar em inglês e não pode pedir telas, notebooks, smartphones ou mesas de escritório.`;
}

async function callDeepSeek(system: string, user: string, config?: JsonRecord | null): Promise<{ article: GeneratedArticle; provider: string; model: string; usage: JsonRecord }> {
  const apiKey = String(config?.apiKey ?? Deno.env.get("DEEPSEEK_API_KEY") ?? "");
  if (!apiKey) throw new ContentGenerationError("DEEPSEEK_API_KEY não configurada no Supabase", false);
  const model = String(config?.model ?? Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-chat");
  const baseUrl = String(config?.baseUrl ?? Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 7000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    throw new ContentGenerationError(`DeepSeek HTTP ${response.status}`, response.status === 429 || response.status >= 500);
  }
  const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
  return { article: parseJson(choices?.[0]?.message?.content ?? ""), provider: "DeepSeek", model, usage: (body.usage ?? {}) as JsonRecord };
}

async function callGemini(system: string, user: string, config?: JsonRecord | null): Promise<{ article: GeneratedArticle; provider: string; model: string; usage: JsonRecord }> {
  const apiKey = String(config?.apiKey ?? Deno.env.get("GEMINI_API_KEY") ?? "");
  if (!apiKey) throw new ContentGenerationError("GEMINI_API_KEY não configurada no Supabase", false);
  const model = String(config?.model ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    throw new ContentGenerationError(`Gemini HTTP ${response.status}`, response.status === 429 || response.status >= 500);
  }
  const candidates = body.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return { article: parseJson(candidates?.[0]?.content?.parts?.[0]?.text ?? ""), provider: "Gemini", model, usage: (body.usageMetadata ?? {}) as JsonRecord };
}

export async function generateContentJob(payload: JsonRecord, db?: SupabaseClient): Promise<JsonRecord> {
  const contentId = String(payload.contentId ?? "");
  if (!contentId) throw new ContentGenerationError("content_pipeline requer payload.contentId", false);

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const client = db ?? createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const startedAt = Date.now();

  const { data: item, error } = await client.from("content_items")
    .select("*, editorial_calendar(*), blog:blogs(*)").eq("id", contentId).maybeSingle();
  if (error || !item) throw new ContentGenerationError("Artigo não encontrado para geração", false);

  const blog = item.blog as JsonRecord | null;
  const calendar = item.editorial_calendar as JsonRecord | null;
  if (!blog || String(blog.status ?? "active") !== "active") {
    throw new ContentGenerationError("Blog inativo ou não encontrado", false);
  }
  const language = String(payload.language ?? item.language ?? blog.default_language ?? "pt-BR");
  const topic = String(calendar?.topic ?? item.title);
  const rawKeywords = calendar?.keywords;
  const keywords = Array.isArray(rawKeywords) ? rawKeywords.map(String) : [item.title].filter(Boolean).map(String);

  const { data: sources } = await client.from("content_sources")
    .select("title,url,notes").eq("content_id", contentId).limit(20);
  // Fail-closed: se research marcou review_required, não gera
  const researchStatus = String((item as Record<string, unknown>).research_status ?? "");
  if (researchStatus === "review_required") {
    throw new ContentGenerationError("Research em REVIEW_REQUIRED (YMYL sem fonte oficial) — geração bloqueada até aprovação humana", false);
  }
  // 4F: sem fontes → enfileira research e reagenda este pipeline (idempotente, sem duplicar research)
  if (!sources || sources.length === 0) {
    const { data: existingResearch } = await client.from("background_jobs")
      .select("id,status").eq("payload->>contentId", contentId).eq("job_type", "research")
      .in("status", ["queued", "running", "retrying"]).maybeSingle();
    if (!existingResearch) {
      await client.rpc("enqueue_background_job", {
        p_job_type: "research",
        p_payload: { contentId },
        p_organization_id: String(blog.organization_id ?? ""),
        p_blog_id: item.blog_id,
        p_idempotency_key: `research:${contentId}`.slice(0, 200),
        p_priority: 40,
        p_max_attempts: 3,
      });
      await client.from("content_items").update({ status: "researching" }).eq("id", contentId);
      await client.rpc("enqueue_background_job", {
        p_job_type: "content_pipeline",
        p_payload: payload,
        p_organization_id: String(blog.organization_id ?? ""),
        p_blog_id: item.blog_id,
        p_idempotency_key: `content_pipeline:${contentId}:after-research`.slice(0, 200),
        p_priority: 50,
        p_max_attempts: 3,
        p_scheduled_at: new Date(Date.now() + 90_000).toISOString(),
      });
      return { contentId, status: "chained_research", message: "Research enfileirado; pipeline reagendado em 90s" } as unknown as JsonRecord;
    }
    throw new ContentGenerationError("Research em andamento; tente novamente em 90s", true);
  }
  const research = (sources ?? []).map((source) => `- ${source.title}: ${source.url}${source.notes ? ` — ${source.notes}` : ""}`).join("\n");
  const user = `Data de referência: ${new Date().toISOString().slice(0, 10)}
Tema: ${topic}
Palavras-chave: ${keywords.join(", ")}
Público: ${String(blog.audience ?? "leitores interessados no tema")}
Notas editoriais: ${String(calendar?.notes ?? "")}
Fontes verificadas disponíveis (use somente estas URLs):\n${research || "Nenhuma fonte verificada foi anexada; evite afirmações atuais específicas."}`;

  const globallyPreferred = String(Deno.env.get("AI_PROVIDER") || Deno.env.get("TEXT_PROVIDER") || "deepseek").toLowerCase();
  const organizationId = String(blog.organization_id ?? "");
  const { data: availableCredentials } = await client.from("organization_provider_credentials")
    .select("provider").eq("organization_id", organizationId).eq("enabled", true)
    .in("provider", ["deepseek", "gemini"]);
  const configuredProviders = (availableCredentials ?? []).map((row) => String(row.provider));
  const preferred = configuredProviders.includes(globallyPreferred)
    ? globallyPreferred
    : configuredProviders[0] || globallyPreferred;
  const { data: tenantConfig, error: configError } = await client.rpc("get_provider_runtime_config", {
    p_organization_id: organizationId,
    p_provider: preferred,
  });
  if (configError) throw new ContentGenerationError(`Falha ao carregar credencial da organização: ${configError.message}`, false);
  const completion = preferred === "gemini"
    ? await callGemini(systemPrompt(language, String(blog.name ?? "Portal"), String(blog.niche ?? "conteúdo informativo")), user, tenantConfig as JsonRecord | null)
    : await callDeepSeek(systemPrompt(language, String(blog.name ?? "Portal"), String(blog.niche ?? "conteúdo informativo")), user, tenantConfig as JsonRecord | null);

  const article = completion.article;
  const actualWords = wordCount(article.content);
  if (actualWords < 1300) throw new ContentGenerationError(`Quality gate: artigo com apenas ${actualWords} palavras`, true);

  let slug = slugify(article.slug || article.title || topic);
  const { data: conflict } = await client.from("content_items").select("id")
    .eq("blog_id", item.blog_id).eq("slug", slug).neq("id", contentId).maybeSingle();
  if (conflict) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;

  const { data: updated, error: updateError } = await client.from("content_items").update({
    title: article.title.trim(),
    slug,
    focus_keyword: article.primaryKeyword || keywords[0] || article.title,
    meta_description: article.metaDescription?.trim() || "",
    tags: Array.isArray(article.secondaryKeywords) ? article.secondaryKeywords.slice(0, 6) : keywords.slice(0, 5),
    body: article.content.trim(),
    language,
    status: "reviewing",
  }).eq("id", contentId).select("id,title,slug,status,language,focus_keyword,meta_description,tags,body").single();
  if (updateError) throw new ContentGenerationError(`Falha ao salvar artigo: ${updateError.message}`, true);

  const durationMs = Date.now() - startedAt;
  await client.from("ai_runs").insert({
    content_id: contentId,
    agent: "SupabaseContentWriter",
    provider: completion.provider,
    model: completion.model,
    status: "completed",
    input_summary: `Topic: ${topic} | Keywords: ${keywords.join(", ")}`,
    output_summary: `${actualWords} palavras; aguardando revisão/imagem`,
    duration_ms: durationMs,
    estimated_cost: 0,
  });
  await client.from("system_logs").insert({
    level: "info", service: "EdgeWorker.generateContent",
    message: `Artigo ${contentId} gerado no Supabase`,
    metadata: { contentId, provider: completion.provider, model: completion.model, actualWords, usage: completion.usage },
  });
  return { contentId, status: "reviewing", actualWords, provider: completion.provider, model: completion.model, content: updated };
}
