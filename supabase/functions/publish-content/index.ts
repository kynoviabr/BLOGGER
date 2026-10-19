import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { marked } from "npm:marked@18.0.14";

const SERVICE = "EdgePublisher.publishContent";
const BATCH_SIZE = 5;
const MAX_PUBLISH_ATTEMPTS = 5;
type JsonRecord = Record<string, unknown>;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const basicAuth = (username: string, password: string) => `Basic ${btoa(`${username}:${password}`)}`;

class PublishFailure extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) {
    super(message);
    this.name = "PublishFailure";
  }
}

function contextualFailure(prefix: string, error: unknown): PublishFailure {
  if (error instanceof PublishFailure) {
    return new PublishFailure(`${prefix}: ${error.message}`, error.code, error.retryable);
  }
  return new PublishFailure(`${prefix}: ${errorMessage(error)}`, "UNEXPECTED_ERROR", true);
}

function wordpressConfig(blog: JsonRecord) {
  const editorial = (blog.editorial_config ?? {}) as JsonRecord;
  const wordpress = (editorial.wordpress ?? {}) as JsonRecord;
  const configuredUrl = String(wordpress.wp_site_url ?? "").trim();
  const domain = String(blog.domain ?? "").trim();
  const siteUrl = configuredUrl || domain;
  return {
    siteUrl: siteUrl.trim().replace(/\/+$/, "").replace(/^(?!https?:\/\/)/, "https://"),
    username: String(wordpress.wp_username ?? "").trim(),
    password: String(wordpress.wp_application_password ?? "").trim(),
  };
}

function excerpt(value: string): string {
  const clean = value.replace(/<[^>]*>/g, " ").replace(/[#*_~`|\[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  const truncated = clean.slice(0, 157);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 130 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
}

function disclaimer(article: JsonRecord, blog: JsonRecord): string {
  const editorial = (blog.editorial_config ?? {}) as JsonRecord;
  const custom = String(editorial.disclaimer_html ?? "").trim();
  if (custom) return custom;
  const language = String(article.language ?? "pt-BR").toLowerCase();
  const identity = `${String(blog.name ?? "")} ${String(blog.niche ?? "")}`.toLowerCase();
  if (/britis|car|motoring|automot|ve[ií]cul/.test(identity)) {
    return '<p class="ud-aviso"><strong>Disclaimer:</strong> This content is for general informational purposes only and does not constitute official DVSA, DVLA, or professional mechanical advice. Always verify current regulations on GOV.UK.</p>';
  }
  if (language.startsWith("en")) {
    return '<p class="ud-aviso"><strong>Disclaimer:</strong> This content is for educational and informational purposes only and does not constitute financial advice. Always verify current terms with official institutions.</p>';
  }
  return '<p class="ud-aviso"><strong>Aviso:</strong> conteúdo informativo, não é recomendação financeira. Taxas e regras mudam; confirme nos canais oficiais das instituições.</p>';
}

async function articleHtml(article: JsonRecord, blog: JsonRecord): Promise<string> {
  let source = String(article.body ?? "")
    .replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
    .replace(/^\s*```(?:markdown|html)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "")
    .replace(/^\s*#\s+[^\n]+\n+/i, "")
    .replace(/<!--\s*ADMIN_TOOL_SUGGESTION[\s\S]*?-->/gi, "").trim();
  const title = String(article.title ?? "").trim().toLowerCase();
  const lines = source.split("\n");
  if (lines[0]?.replace(/^#+\s*/, "").trim().toLowerCase() === title) {
    lines.shift();
    source = lines.join("\n").trim();
  }
  let html = String(await marked.parse(source, { gfm: true, breaks: true })).trim();
  html = html.replace(/(<table(?:\s+[^>]*)?>[\s\S]*?<\/table>)/gi,
    '<div class="ud-table-wrapper" style="overflow-x:auto;max-width:100%;margin:28px 0">$1</div>');
  if (!html.includes("ud-aviso")) html = `${html}\n\n${disclaimer(article, blog)}`;
  return html;
}

async function wordpressJson(url: string, auth: string, init: RequestInit = {}): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: auth, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new PublishFailure(
      `WordPress ${response.status}: ${String(payload.message ?? response.statusText)}`,
      `WORDPRESS_HTTP_${response.status}`,
      retryable,
    );
  }
  return payload;
}

async function validateWordpressConnection(siteUrl: string, auth: string): Promise<void> {
  const response = await fetch(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    throw new PublishFailure(
      `Integração WordPress não autenticada (${response.status}): ${String(payload.message ?? response.statusText)}`,
      response.status === 401 ? "WORDPRESS_AUTH_REQUIRED" : `WORDPRESS_PREFLIGHT_${response.status}`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  const capabilities = (payload.capabilities ?? {}) as JsonRecord;
  if (capabilities.publish_posts !== true || capabilities.upload_files !== true) {
    throw new PublishFailure(
      "Usuário WordPress sem permissão para publicar posts e enviar arquivos.",
      "WORDPRESS_INSUFFICIENT_CAPABILITIES",
      false,
    );
  }
}

function normalizedCategoryName(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&#x0*26;/gi, "&")
    .replace(/[’‘]/g, "'")
    .trim()
    .toLocaleLowerCase("en-GB");
}

async function categoryId(siteUrl: string, auth: string, slug: string, name: string): Promise<number> {
  const response = await fetch(`${siteUrl}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(20_000),
  });
  const categories = await response.json().catch(() => []) as Array<JsonRecord>;
  if (!response.ok) throw new PublishFailure(`WordPress ${response.status}: falha ao consultar categoria ${slug}`, `WORDPRESS_HTTP_${response.status}`, response.status >= 500);
  const exactId = Number(categories[0]?.id ?? 0);
  if (exactId > 1) return exactId;

  const fallback = await fetch(
    `${siteUrl}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug`,
    { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
  );
  const matches = await fallback.json().catch(() => []) as Array<JsonRecord>;
  if (!fallback.ok) throw new PublishFailure(`WordPress ${fallback.status}: falha ao consultar categoria ${name}`, `WORDPRESS_HTTP_${fallback.status}`, fallback.status >= 500);
  const normalizedName = normalizedCategoryName(name);
  const match = matches.find((candidate) => normalizedCategoryName(String(candidate.name ?? "")) === normalizedName);
  const fallbackId = Number(match?.id ?? 0);
  if (fallbackId <= 1) throw new PublishFailure(`Categoria WordPress não encontrada: ${slug} (${name})`, "WORDPRESS_CATEGORY_NOT_FOUND", false);
  return fallbackId;
}

async function tagIds(siteUrl: string, auth: string, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const raw of names.slice(0, 12)) {
    const name = raw.trim();
    if (!name) continue;
    const search = await fetch(`${siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=10`, {
      headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(20_000),
    });
    const found = await search.json().catch(() => []) as Array<JsonRecord>;
    if (found[0]?.id) {
      ids.push(Number(found[0].id));
      continue;
    }
    const created = await wordpressJson(`${siteUrl}/wp-json/wp/v2/tags`, auth, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    ids.push(Number(created.id));
  }
  return [...new Set(ids.filter(Number.isFinite))];
}

async function uploadFeaturedMedia(article: JsonRecord, siteUrl: string, auth: string): Promise<number | undefined> {
  const media = article.featured_image as JsonRecord | null;
  const publicUrl = String(media?.public_url ?? "");
  if (!publicUrl) return undefined;
  const image = await fetch(publicUrl, { signal: AbortSignal.timeout(30_000) });
  if (!image.ok) throw new Error(`Falha ao baixar imagem destacada: ${image.status}`);
  const created = await wordpressJson(`${siteUrl}/wp-json/wp/v2/media`, auth, {
    method: "POST",
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(String(article.slug ?? "artigo"))}.webp"`,
      "Content-Type": image.headers.get("content-type") ?? "image/webp",
    },
    body: await image.arrayBuffer(),
  });
  return Number(created.id);
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const expectedSecret = Deno.env.get("PUBLISH_CRON_SECRET") ?? "";
    if (!expectedSecret || req.headers.get("x-cron-secret") !== expectedSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startedAt = Date.now();
    const db = ctx.supabaseAdmin;
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: staleClaims } = await db.from("content_items")
      .select("id, publish_original_status").eq("status", "publishing").lt("publish_claimed_at", stale);
    for (const staleClaim of staleClaims ?? []) {
      await db.from("content_items").update({
        status: staleClaim.publish_original_status === "scheduled" ? "scheduled" : "ready",
        publish_claimed_at: null,
        publish_original_status: null,
      }).eq("id", staleClaim.id).eq("status", "publishing");
    }

    const { data: candidates, error } = await db.from("content_items")
      .select("*, blog:blogs!inner(*), editorial_calendar:editorial_calendar(id, scheduled_at, status, category:categories(id, name, slug)), featured_image:media_assets!content_items_featured_image_id_fkey(*)")
      .in("status", ["ready", "scheduled"])
      .eq("blog.status", "active")
      .lt("publish_attempts", MAX_PUBLISH_ATTEMPTS)
      .or(`next_publish_attempt_at.is.null,next_publish_attempt_at.lte.${now}`)
      .order("created_at", { ascending: true }).limit(10);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const eligible = (candidates ?? []).filter((item: JsonRecord) => {
      const calendar = item.editorial_calendar as JsonRecord | null;
      const scheduledAt = calendar?.scheduled_at ? new Date(String(calendar.scheduled_at)).getTime() : null;
      return scheduledAt ? scheduledAt <= Date.now() : item.status === "ready";
    }).slice(0, BATCH_SIZE);

    const results: JsonRecord[] = [];
    const connectionChecks = new Map<string, Promise<void>>();
    for (const article of eligible) {
      const originalStatus = String(article.status);
      const claim = await db.from("content_items")
        .update({
          status: "publishing",
          publish_claimed_at: now,
          publish_original_status: originalStatus,
          publish_attempts: Number(article.publish_attempts ?? 0) + 1,
        })
        .eq("id", article.id).eq("status", originalStatus).select("id").maybeSingle();
      if (claim.error || !claim.data) continue;

      try {
        if (!String(article.body ?? "").trim()) throw new Error("Artigo sem corpo de texto");
        const blog = article.blog as JsonRecord;
        const config = wordpressConfig(blog);
        if (!config.siteUrl || !config.username || !config.password) {
          throw new PublishFailure(
            `Credenciais WordPress incompletas para o blog ${String(blog.slug ?? blog.id)}`,
            "WORDPRESS_CONFIG_INCOMPLETE",
            false,
          );
        }
        const auth = basicAuth(config.username, config.password);
        const blogId = String(blog.id ?? article.blog_id);
        let connectionCheck = connectionChecks.get(blogId);
        if (!connectionCheck) {
          connectionCheck = validateWordpressConnection(config.siteUrl, auth);
          connectionChecks.set(blogId, connectionCheck);
        }
        await connectionCheck;
        const calendar = article.editorial_calendar as JsonRecord | null;
        const category = calendar?.category as JsonRecord | null;
        const categorySlug = String(category?.slug ?? "");
        const categoryName = String(category?.name ?? "");
        const payload: JsonRecord = {
          title: article.title, slug: article.slug, content: await articleHtml(article, blog),
          excerpt: excerpt(String(article.excerpt ?? article.meta_description ?? article.body ?? "")), status: "publish",
        };
        if (categorySlug) payload.categories = [await categoryId(config.siteUrl, auth, categorySlug, categoryName)];
        if (Array.isArray(article.tags) && article.tags.length) payload.tags = await tagIds(config.siteUrl, auth, article.tags.map(String));
        let featuredMediaId: number | undefined;
        try {
          featuredMediaId = await uploadFeaturedMedia(article, config.siteUrl, auth);
        } catch (mediaError) {
          throw contextualFailure("Upload da imagem destacada", mediaError);
        }
        if (featuredMediaId) payload.featured_media = featuredMediaId;
        payload.meta = {
          rank_math_title: String(article.seo_title ?? article.title).slice(0, 60),
          rank_math_description: String(article.meta_description ?? payload.excerpt).slice(0, 160),
          rank_math_focus_keyword: String(article.focus_keyword ?? ""),
          _yoast_wpseo_metadesc: String(article.meta_description ?? payload.excerpt).slice(0, 160),
          _yoast_wpseo_focuskw: String(article.focus_keyword ?? ""),
        };

        const existingResponse = await fetch(
          `${config.siteUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(String(article.slug))}&status=any`,
          { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
        );
        const existingPosts = existingResponse.ok
          ? await existingResponse.json().catch(() => []) as Array<JsonRecord>
          : [];
        let published = existingPosts[0];
        if (!published) {
          try {
            published = await wordpressJson(`${config.siteUrl}/wp-json/wp/v2/posts`, auth, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });
          } catch (postError) {
            throw contextualFailure("Criação do post", postError);
          }
        }
        const publishedAt = String(published.date_gmt ?? published.date ?? new Date().toISOString());
        await db.from("content_items").update({
          status: "published", published_at: publishedAt, publish_claimed_at: null,
          publish_original_status: null, last_publish_error: null, publish_failure_code: null,
          next_publish_attempt_at: null,
          external_post_id: String(published.id), external_post_url: String(published.link ?? ""),
        }).eq("id", article.id).eq("status", "publishing");
        if (article.editorial_calendar_id) {
          await db.from("editorial_calendar").update({ status: "PUBLISHED", scheduled_at: publishedAt })
            .eq("id", article.editorial_calendar_id);
        }
        results.push({ articleId: article.id, status: "PUBLISHED", postId: published.id, url: published.link });
      } catch (publishError) {
        const message = errorMessage(publishError).slice(0, 1000);
        const attempts = Number(article.publish_attempts ?? 0) + 1;
        const failure = publishError instanceof PublishFailure
          ? publishError
          : new PublishFailure(message, "UNEXPECTED_ERROR", true);
        const exhausted = attempts >= MAX_PUBLISH_ATTEMPTS;
        const terminal = !failure.retryable || exhausted;
        const retryDelayMinutes = Math.min(360, 5 * (2 ** Math.max(0, attempts - 1)));
        const nextAttemptAt = terminal
          ? null
          : new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();
        await db.from("content_items").update({
          status: terminal ? "publish_failed" : originalStatus,
          publish_claimed_at: null,
          publish_original_status: null,
          last_publish_error: message,
          publish_failure_code: exhausted ? "MAX_ATTEMPTS_EXCEEDED" : failure.code,
          next_publish_attempt_at: nextAttemptAt,
        })
          .eq("id", article.id).eq("status", "publishing");
        results.push({
          articleId: article.id,
          blogId: article.blog_id,
          status: terminal ? "FAILED_TERMINAL" : "FAILED_RETRY_SCHEDULED",
          errorCode: exhausted ? "MAX_ATTEMPTS_EXCEEDED" : failure.code,
          nextAttemptAt,
        });
      }
    }

    await db.from("system_logs").insert({
      level: "info", service: SERVICE, message: "Execução do publicador Supabase concluída.",
      metadata: { durationMs: Date.now() - startedAt, eligible: eligible.length, results },
    });
    return Response.json({ success: true, publishedCount: results.filter((r) => r.status === "PUBLISHED").length, results });
  }),
};
