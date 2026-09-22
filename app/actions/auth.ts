"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth.schema";
import { logger } from "@/lib/logger";

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
    const { error } = await supabase.auth.signInWithPassword({
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

  redirect("/login");
}
