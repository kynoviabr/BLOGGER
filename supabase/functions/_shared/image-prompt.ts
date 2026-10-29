// Monta o prompt da imagem de destaque. Cópia idêntica em supabase/functions/_shared/image-prompt.ts
// (o worker roda em Deno e não enxerga lib/); altere as duas juntas.

export interface ImagePromptInput {
  title: string;
  excerpt?: string | null;
  focusKeyword?: string | null;
}

const MEDIUMS = [
  "documentary photograph, natural candid moment, 35mm film look",
  "cinematic wide still, anamorphic lens, film grain",
  "editorial magazine photograph with a bold, clean composition",
  "street photography, real place, real people going about their day",
  "warm lifestyle photograph, authentic and unposed",
  "flat vector illustration with a limited, confident palette",
  "hand-drawn ink and watercolor illustration",
  "paper-cut collage with layered textures",
  "risograph-style print with grainy overlapping colors",
  "soft 3D clay render, playful and tactile",
  "isometric 3D scene with small detailed elements",
  "oil painting with visible brush strokes",
  "retro 1970s poster art",
  "minimal Swiss-style graphic poster with geometric shapes",
  "macro photograph of a meaningful everyday object",
];

const FRAMINGS = [
  "wide establishing shot",
  "close-up on a telling detail",
  "over-the-shoulder point of view",
  "top-down flat lay",
  "low angle looking up",
  "symmetrical centered composition",
  "rule-of-thirds with generous negative space",
  "shallow depth of field with a soft background",
  "split composition contrasting two situations",
];

const LIGHTS = [
  "golden hour sunlight",
  "soft overcast daylight",
  "blue hour city lights",
  "bright high-key studio light",
  "moody low-key light with deep shadows",
  "neon accents at night",
  "warm indoor lamp light",
  "crisp morning light",
];

const PALETTES = [
  "warm earthy tones",
  "fresh greens and blues",
  "vibrant complementary colors",
  "muted pastel palette",
  "high-contrast black and white with one accent color",
  "teal and orange",
  "deep jewel tones",
  "sunny yellows and corals",
];

const MOODS = ["optimistic", "calm and reassuring", "energetic", "curious", "aspirational", "thoughtful", "playful", "confident"];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function clean(text: string | null | undefined, max: number): string {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/[#*_`>\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildFeaturedImagePrompt(input: ImagePromptInput): string {
  const title = clean(input.title, 160);
  const excerpt = clean(input.excerpt, 280);
  const keyword = clean(input.focusKeyword, 80);
  const subject = [
    `Featured image for a blog article titled "${title}".`,
    excerpt ? `The article is about: ${excerpt}.` : "",
    keyword ? `Main topic: ${keyword}.` : "",
    "Show a concrete, specific scene that someone would instantly connect to this topic (real places, objects, people or situations from the subject), not a generic abstract metaphor.",
  ].filter(Boolean).join(" ");
  return [
    subject,
    `Style: ${pick(MEDIUMS)}.`,
    `Composition: ${pick(FRAMINGS)}.`,
    `Lighting: ${pick(LIGHTS)}. Colors: ${pick(PALETTES)}. Mood: ${pick(MOODS)}.`,
    "Landscape format. Avoid written words, captions or watermarks in the image.",
  ].join(" ");
}
