"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recarrega a lista enquanto há artigos em produção, para o pronto aparecer sozinho. */
export function AutoRefresh({ active, intervalMs = 10_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
