import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAIProvider } from "@/services/ai";
import { CannibalizationGuardService } from "@/services/editorial/cannibalization-guard.service";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    await requireAuth();

    const body = await request.json();
    const { rawText, blogId, language = "pt-BR", categoryId } = body;

    if (!rawText || !rawText.trim()) {
      return NextResponse.json(
        { success: false, error: "O texto ou tema da pauta bruta é obrigatório." },
        { status: 400 }
      );
    }

    if (!blogId) {
      return NextResponse.json(
        { success: false, error: "O blog de destino (blogId) é obrigatório." },
        { status: 400 }
      );
    }

    const adminSupabase = getSupabaseAdminClient();

    // 1. Buscar contexto do blog e suas categorias
    const { data: blog, error: blogErr } = await adminSupabase
      .from("blogs")
      .select("*, categories(id, name, slug)")
      .eq("id", blogId)
      .maybeSingle();

    if (blogErr || !blog) {
      return NextResponse.json(
        { success: false, error: "Blog não encontrado no banco de dados." },
        { status: 404 }
      );
    }

    const categories = blog.categories || [];
    const categoriesNames = categories.map((c: { name: string; slug: string }) => `${c.name} (${c.slug})`).join(", ");

    // 2. Chamar IA para refinar a pauta bruta
    const aiProvider = createAIProvider();

    const prompt = `Você é um Estrategista de Conteúdo, Especialista em SEO e Editor-Chefe Sênior.
O usuário colou a seguinte pauta bruta, notícia ou anotação:
"""
${rawText.trim()}
"""

Contexto do Portal:
- Nome do Blog: ${blog.name}
- Nicho: ${blog.niche || "Finanças e Economia"}
- Público-Alvo: ${blog.audience || "Público geral"}
- Idioma do Artigo: ${language}
- Categorias Disponíveis: ${categoriesNames || "Geral"}

Sua missão é APRIMORAR esta pauta para transformá-la em uma pauta editorial de altíssimo impacto, tráfego orgânico e CTR.

Retorne EXATAMENTE um objeto JSON com as seguintes propriedades:
- "title": Título H1 magnético, conciso e com gatilho de clique para SEO (entre 50 e 65 caracteres, sem aspas extras).
- "topic": Tema central limpo e direto da pauta (até 80 caracteres).
- "keywords": Lista com 3 a 5 palavras-chave estratégicas separadas por vírgula (incluindo a palavra-chave foco principal primeiro).
- "description": Briefing editorial detalhado com orientações de estrutura, dados ou órgãos a citar e ângulo de abordagem.
- "article_type": Tipo de formato (ex: 'standard', 'listicle', 'how-to', 'review', 'pillar').
- "category_slug": O slug da categoria mais compatível da lista fornecida acima (ex: '${categories[0]?.slug || "geral"}').`;

    let enhancedResult: {
      title: string;
      topic: string;
      keywords: string;
      description: string;
      article_type: string;
      category_slug?: string;
    };

    // Chamada direta via Gemini ou DeepSeek
    if (process.env.GEMINI_API_KEY) {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = process.env.GEMINI_IDEAS_MODEL || "gemini-3.5-flash";

      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.5,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              topic: { type: Type.STRING },
              keywords: { type: Type.STRING },
              description: { type: Type.STRING },
              article_type: { type: Type.STRING },
              category_slug: { type: Type.STRING },
            },
            required: ["title", "topic", "keywords", "description", "article_type"],
          },
        },
      });

      enhancedResult = JSON.parse(response.text || "{}");
    } else {
      // Fallback para geração via provedor de texto configurado
      const generated = await aiProvider.generateArticle(rawText, ["seo"], {
        blogName: blog.name,
        niche: blog.niche,
        language,
      });

      enhancedResult = {
        title: generated.title,
        topic: rawText.slice(0, 80),
        keywords: generated.keywords.join(", "),
        description: generated.metaDescription,
        article_type: "standard",
        category_slug: categories[0]?.slug || "geral",
      };
    }

    // Resolver ID da categoria pelo slug sugerido
    const matchedCategory = categories.find(
      (c: { slug: string; id: string }) =>
        c.slug.toLowerCase() === (enhancedResult.category_slug || "").toLowerCase()
    );

    // 3. Checagem do Guardião Anti-Canibalização (WordPress e Calendário)
    const keywordsArray = (enhancedResult.keywords || '')
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean);
    const primaryKeyword = keywordsArray[0] || enhancedResult.topic;

    // O aviso aqui é informativo; se a checagem falhar, o salvamento (batch) volta a checar.
    const cannibalization = await CannibalizationGuardService.checkCannibalization({
      blogId,
      title: enhancedResult.title,
      focusKeyword: primaryKeyword,
      keywords: keywordsArray,
    }).catch((guardErr) => {
      logger.warn('API.ideas.enhance-manual', `Checagem de canibalização indisponível: ${String(guardErr)}`);
      return null;
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      "API.ideas.enhance-manual",
      `Pauta aprimorada em ${durationMs}ms: "${enhancedResult.title}" | Canibalização: ${cannibalization?.riskLevel ?? "indisponível"}`
    );

    return NextResponse.json({
      success: true,
      enhanced: {
        ...enhancedResult,
        category_id: matchedCategory?.id || categoryId || categories[0]?.id || null,
        category_name: matchedCategory?.name || categories[0]?.name || "Geral",
      },
      cannibalization,
      durationMs,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao aprimorar pauta com IA.";
    logger.error("API.ideas.enhance-manual", errorMsg, { err });
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
