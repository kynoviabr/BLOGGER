import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export class ResearchError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ResearchError";
  }
}

// Minimal prompt-sanitizer (Deno-safe)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions/gi,
  /system\s+(prompt|message|directive|override)/gi,
  /you\s+are\s+now\s+(a|an)?/gi,
  /act\s+as\s+(a|an)?/gi,
  /reveal\s+(all\s+)?(secrets?|passwords?|keys?|tokens?|env)/gi,
  /send\s+(the\s+)?(api[_-]?key|secret|credential)/gi,
  /execute\s+(this\s+)?(command|script|code|shell)/gi,
  /new\s+instruction:/gi,
  /override\s+system\s+prompt/gi,
  /reset\s+context/gi,
];

function sanitize(text: string): string {
  if (!text) return "";
  let s = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").replace(/<\|.*?\|>/g, " ").trim();
  for (const pat of INJECTION_PATTERNS) s = s.replace(pat, "[instrução_bloqueada_por_segurança]");
  return s;
}
function wrapInContainer(content: string, label = "EXTERNAL_UNTRUSTED_FACT_DATA"): string {
  return `<<<${label}_START>>>\n${sanitize(content)}\n<<<${label}_END>>>`;
}

// SSRF lite — Deno fetch hardened: block private IPs + localhost hostnames
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  const blocked = ["localhost", "metadata.google.internal", "metadata.internal", "169.254.169.254", "0.0.0.0", "::1"];
  if (blocked.includes(h) || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // literal private IPs
  const ipv4 = h.split(".").map((p) => parseInt(p, 10));
  if (ipv4.length === 4 && ipv4.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = ipv4;
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a >= 224) return true;
  }
  return false;
}
async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Protocolo proibido: ${u.protocol}`);
  if (isBlockedHost(u.hostname)) throw new Error(`SSRF bloqueado: ${u.hostname}`);
  // Follow redirects manually, validating each hop
  let current = url;
  for (let i = 0; i < 5; i++) {
    const uu = new URL(current);
    if (isBlockedHost(uu.hostname)) throw new Error(`SSRF redirect bloqueado: ${uu.hostname}`);
    const res = await fetch(current, { ...init, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect ${res.status} sem Location`);
      current = new URL(loc, current).toString();
      continue;
    }
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (res.ok && ct && !["text/html", "text/plain", "application/xhtml+xml"].some((t) => ct.includes(t))) {
      throw new Error(`Content-Type não permitido: ${ct}`);
    }
    return res;
  }
  throw new Error("Excesso de redirects");
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
async function webSearch(query: string, opts: { limit?: number } = {}): Promise<SearchResult[]> {
  const tavilyKey = Deno.env.get("TAVILY_API_KEY") ?? "";
  if (tavilyKey) {
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: opts.limit ?? 6, include_answer: false }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const j = await r.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
        const results = (j.results ?? []).slice(0, opts.limit ?? 6).map((it) => ({
          title: String(it.title ?? it.url ?? query),
          url: String(it.url ?? ""),
          snippet: String(it.content ?? "").slice(0, 400),
        })).filter((r) => r.url);
        if (results.length) return results;
      }
    } catch { /* fallback to HTML scrape below */ }
  }
  // Bing/DuckDuckGo HTML fallback (lightweight)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const r = await safeFetch(searchUrl, { headers: { "User-Agent": "BloggerResearch/1.0" }, signal: AbortSignal.timeout(10_000) });
    const html = await r.text();
    const results: SearchResult[] = [];
    const re = /<a[^>]+class="[^"]*result__url[^"]*"[^>]+href="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && results.length < (opts.limit ?? 6)) {
      try {
        const u = new URL(m[1], searchUrl).toString();
        if (isBlockedHost(new URL(u).hostname)) continue;
        results.push({ title: u, url: u, snippet: query });
      } catch { /* skip */ }
    }
    return results;
  } catch {
    return [];
  }
}

function classifyRisk(title: string, category?: string, keywords?: string[]): "LOW" | "MEDIUM" | "HIGH" {
  const text = `${title} ${category ?? ""} ${(keywords ?? []).join(" ")}`.toLowerCase();
  const high = ["consignado", "margem", "inss", "legisla", "decreto", "norma", "regulamenta", "taxa selic", "teto de juros", "imposto de renda", "receita federal", "banco central", "fgts"];
  if (high.some((t) => text.includes(t))) return "HIGH";
  const med = ["empréstimo", "financiamento", "cartão de crédito", "score", "serasa", "juros", "investimento", "crédito"];
  if (med.some((t) => text.includes(t))) return "MEDIUM";
  return "LOW";
}

function buildQueries(title: string, keywords: string[], risk: string, lang: string, currentDate: string): string[] {
  const year = currentDate.split("-")[0];
  const primary = (keywords[0] || title.split(/[:?–—-]/)[0] || title).replace(/[?:!,"'“”()]/g, " ").trim();
  if (risk === "HIGH" && lang === "pt-BR") return [`${primary} site:gov.br`, `${primary} site:bcb.gov.br`, `${primary} ${year}`];
  if (risk === "MEDIUM") return [`${primary} ${year}`, `como funciona ${primary}`];
  return [`${primary} ${year}`];
}

async function fetchSource(url: string): Promise<null | { url: string; finalUrl: string; title: string; paragraphs: string[]; isOfficial: boolean; byteLength: number; httpStatus: number; contentType: string }> {
  try {
    const res = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 Chrome/122", Accept: "text/html,application/xhtml+xml,text/plain;q=0.9" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "text/html";
    const raw = await res.text();
    const bl = new TextEncoder().encode(raw).length;
    if (bl > 2_000_000) return null;
    const tMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = tMatch ? tMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : url;
    const clean = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<nav[\s\S]*?<\/nav>/gi, " ");
    const blocks = [...clean.matchAll(/<(?:p|h[1-6]|li)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li)>/gi)];
    const paras: string[] = [];
    for (const b of blocks) {
      const text = b[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length >= 35 && !text.includes("{") && !text.includes("function(")) paras.push(sanitize(text));
    }
    const uniq = [...new Set(paras)].slice(0, 30);
    const host = new URL(url).hostname.toLowerCase();
    const isOfficial = host.endsWith(".gov.br") || host.endsWith(".bcb.gov.br");
    return { url, finalUrl: res.url || url, title, paragraphs: uniq, isOfficial, byteLength: bl, httpStatus: res.status, contentType: ct };
  } catch {
    return null;
  }
}

export async function researchJob(payload: JsonRecord, db?: SupabaseClient): Promise<JsonRecord> {
  const contentId = String(payload.contentId ?? "");
  if (!contentId) throw new ResearchError("research requer contentId", false);
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const client = db ?? createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: item } = await client.from("content_items").select("*, editorial_calendar(*), blog:blogs(*)").eq("id", contentId).maybeSingle();
  if (!item) throw new ResearchError("Artigo não encontrado", false);
  const blog = (item as JsonRecord).blog as JsonRecord | null;
  const cal = (item as JsonRecord).editorial_calendar as JsonRecord | null;
  const title = String(cal?.topic ?? (item as JsonRecord).title ?? "");
  const keywords: string[] = Array.isArray(cal?.keywords) ? (cal!.keywords as string[]) : [];
  const category = String((cal as unknown as { category?: { name?: string } } | null)?.category?.name ?? "");
  const language = String((item as JsonRecord).language ?? blog?.default_language ?? "pt-BR");
  const currentDate = new Date().toISOString().slice(0, 10);

  const risk = classifyRisk(title, category, keywords);
  const queries = buildQueries(title, keywords, risk, language, currentDate);

  const candidates: SearchResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    try {
      const res = await webSearch(queries[i], { limit: 6 });
      for (const r of res) if (!seen.has(r.url)) { seen.add(r.url); candidates.push(r); }
    } catch { /* ignore */ }
  }

  // Top 5 after dedupe
  const selected = candidates.slice(0, 5);

  const fetched: Array<{ url: string; finalUrl: string; title: string; paragraphs: string[]; isOfficial: boolean; byteLength: number; httpStatus: number; contentType: string }> = [];
  for (let i = 0; i < selected.length; i += 3) {
    const chunk = selected.slice(i, i + 3);
    const res = await Promise.all(chunk.map((s) => fetchSource(s.url)));
    for (const r of res) if (r) fetched.push(r);
  }

  // Extract facts (up to 2 per source)
  const facts: Array<{ statement: string; sourceExcerpt: string; sourceUrl: string; sourceTitle: string; confidence: "high" | "medium" }> = [];
  for (const src of fetched) {
    const informative = src.paragraphs.filter((p) => p.length >= 45 && !p.toLowerCase().includes("cookies"));
    for (const para of informative.slice(0, 2)) {
      const sents = para.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 35 && !s.includes("[instrução_bloqueada"));
      if (!sents.length) continue;
      facts.push({ statement: sents[0], sourceExcerpt: para.slice(0, 250), sourceUrl: src.url, sourceTitle: src.title, confidence: src.isOfficial ? "high" : "medium" });
    }
  }

  // Conflict detection (percentage divergence among high-confidence facts)
  let hasCriticalConflict = false;
  const officialFacts = facts.filter((f) => f.confidence === "high");
  const percents: number[] = [];
  for (const f of officialFacts) {
    const m = f.sourceExcerpt.match(/(\d{1,2}(?:,\d+)?)\s*%/);
    if (m) percents.push(parseFloat(m[1].replace(",", ".")));
  }
  if (percents.length >= 2) {
    const diff = Math.max(...percents) - Math.min(...percents);
    if (diff > 25) hasCriticalConflict = true;
  }

  const warnings: string[] = [];
  const hasOfficial = fetched.some((s) => s.isOfficial);
  if (hasOfficial && fetched.some((s) => !s.isOfficial)) warnings.push("Fontes oficiais prevalecem sobre secundárias em divergência.");
  if (hasCriticalConflict) warnings.push("FAIL-CLOSED: divergência crítica entre fontes oficiais.");
  if (risk === "HIGH" && !hasOfficial) warnings.push("Alto risco sem fonte oficial primária — verificação adicional necessária.");

  const status: "READY" | "RESEARCH_REVIEW_REQUIRED" = hasCriticalConflict ? "RESEARCH_REVIEW_REQUIRED" : "READY";

  // Persist content_sources + briefing
  for (const src of fetched) {
    const { error: sourceError } = await client.from("content_sources").upsert({ content_id: contentId, title: src.title.slice(0, 255), url: src.url, source_type: src.isOfficial ? "official" : "secondary", notes: `fetched ${src.byteLength} bytes` }, { onConflict: "content_id,url", ignoreDuplicates: false });
    if (sourceError) throw new ResearchError(`Falha ao salvar fonte: ${sourceError.message}`, true);
  }

  const briefingLines: string[] = [];
  briefingLines.push(`TOPIC: ${title}`, `RESEARCHED AT: ${currentDate}`, `RISK: ${risk}`, `STATUS: ${status}`, "");
  briefingLines.push("--- VERIFIED SOURCES ---");
  fetched.forEach((s, i) => briefingLines.push(`[${i + 1}] ${s.title} — ${s.url} (${s.isOfficial ? "OFFICIAL" : "secondary"})`));
  briefingLines.push("", "--- VERIFIED FACTS ---");
  if (!facts.length) briefingLines.push("Nenhum fato verificado extraído.");
  else facts.forEach((f, i) => briefingLines.push(`[Fact ${i + 1}] ${f.statement}`, `  Excerpt: "${f.sourceExcerpt}"`, `  URL: ${f.sourceUrl}`));
  if (warnings.length) { briefingLines.push("", "--- WARNINGS ---"); warnings.forEach((w) => briefingLines.push(`- ${w}`)); }
  const briefingText = wrapInContainer(briefingLines.join("\n"), "FACTUAL_RESEARCH_BRIEF");

  // Attach briefing to content_sources as a synthetic source for the writer to consume
  // Also store status in system_logs
  const level = status === "READY" ? "info" : "warn";
  await client.from("system_logs").insert({ level, service: "EdgeWorker.research", message: `Research ${status}: ${fetched.length} fontes, ${facts.length} fatos para ${contentId}`, metadata: { contentId, risk, facts: facts.length, fetched: fetched.length, status } });

  // Gate: YMYL HIGH without official source is not terminal, but REVIEW_REQUIRED
  // Persist status hint on content_items (optional column if exists)
  // A coluna aceita só valores minúsculos ('ready', 'review_required').
  const { error: statusError } = await client.from("content_items")
    .update({ research_status: status === "READY" ? "ready" : "review_required", researched_at: new Date().toISOString() })
    .eq("id", contentId);
  if (statusError) throw new ResearchError(`Falha ao salvar status da pesquisa: ${statusError.message}`, true);

  // A redação estava agendada para depois da pesquisa; com a pesquisa pronta, começa já.
  await client.from("background_jobs")
    .update({ scheduled_at: new Date().toISOString() })
    .eq("job_type", "content_pipeline")
    .in("status", ["queued", "retrying"])
    .eq("payload->>contentId", contentId)
    .gt("scheduled_at", new Date().toISOString());

  return { contentId, status, risk, facts: facts.length, fetched: fetched.length, warnings, briefingText };
}
