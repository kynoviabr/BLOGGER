"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth.schema";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/supabase/auth";

export interface AuthState {
  error?: string;
  success?: boolean;
}

export async function loginAction(
  prevState: AuthState | null,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get("email");
  const password = formData.get("password");

  const validation = loginSchema.safeParse({ email, password });

  if (!validation.success) {
    const errorMessage = validation.error.issues[0]?.message || "Dados de login inválidos.";
    return { error: errorMessage };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    });

    if (error) {
      logger.warn("AuthAction", "Tentativa de login falhou", {
        email: validation.data.email,
        error: error.message,
      });
      return { error: "Credenciais inválidas. Verifique seu e-mail e senha." };
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membership) {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, membership.organization_id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    logger.info("AuthAction", "Login realizado com sucesso", { email: validation.data.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao conectar com o serviço de autenticação.";
    logger.error("AuthAction", "Erro inesperado durante login", { err });
    return { error: message };
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
    logger.info("AuthAction", "Usuário desconectado");
  } catch (err) {
    logger.warn("AuthAction", "Erro ao executar signOut", { err });
  }

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
  cookieStore.delete("selected_blog_id");

  redirect("/login");
}
