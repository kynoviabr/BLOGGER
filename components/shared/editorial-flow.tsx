import Link from "next/link";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "ideas", label: "Ideias", hint: "aprovar temas e enviar para produção", href: "/ideas" },
  { key: "production", label: "Produção", hint: "texto, SEO e imagem, geradas automaticamente", href: "/content?status=researching" },
  { key: "review", label: "Revisão", hint: "conferir e aprovar o artigo", href: "/content?status=reviewing" },
  { key: "calendar", label: "Calendário", hint: "escolher a data de publicação", href: "/calendar" },
  { key: "publish", label: "Publicação", hint: "só os aprovados, na data", href: "/content?status=scheduled" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/** Etapa do fluxo correspondente ao filtro de status da lista de artigos. */
export function flowStepForContentStatus(status?: string): StepKey {
  if (status === "researching" || status === "draft") return "production";
  if (status === "ready") return "calendar";
  if (status === "scheduled" || status === "published" || status === "publish_failed") return "publish";
  return "review";
}

/** Faixa com as 5 etapas do fluxo editorial, destacando onde a pessoa está. */
export function EditorialFlow({ current }: { current: StepKey }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STEPS.map((step, index) => {
        const active = step.key === current;
        const body = (
          <div
            className={cn(
              "h-full rounded-lg border px-3 py-2 text-xs transition-colors",
              active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground",
              step.href && !active && "hover:border-primary/40 hover:text-foreground"
            )}
          >
            <span className="font-semibold">
              {index + 1}. {step.label}
            </span>
            <span className="block text-[11px] leading-snug">{step.hint}</span>
          </div>
        );
        return <li key={step.key}>{step.href && !active ? <Link href={step.href}>{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
