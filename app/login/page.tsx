"use client";

import * as React from "react";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import { loginAction, AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initialState: AuthState = {};

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Content Factory
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider font-semibold text-blue-600 dark:text-blue-400">
            Acesso Restrito • Private Engine
          </p>
        </div>

        <Card className="shadow-lg border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">Entrar no Painel</CardTitle>
            <CardDescription className="text-xs">
              Informe suas credenciais de proprietário para gerenciar os blogs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state?.error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{state.error}</span>
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="next" value={searchParams.get("next") || "/"} />
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  E-mail
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@seublog.com"
                  required
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Senha
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  disabled={isPending}
                />
              </div>

              <Button
                type="submit"
                className="w-full mt-2"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  "Acessar Content Factory"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          Aplicação privada single-user protegida por Supabase Auth & RLS.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950" />}><LoginForm /></Suspense>;
}
