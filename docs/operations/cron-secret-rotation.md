# Publicador agendado integralmente no Supabase

O `pg_cron` chama a Edge Function `publish-content` dentro do próprio projeto
Supabase. A Vercel não participa do agendamento nem da execução automática.

## Estado anterior

- O job legado chama uma rota Vercel por `GET` e precisa ser removido no rollout.
- O Vault precisa de `project_url`, `publishable_key` e `PUBLISH_CRON_SECRET`.
- A Edge Function usa secrets globais do WordPress como fallback; credenciais
  específicas continuam vindo do cadastro de cada blog.

## Sequência de rollout

1. Gere `PUBLISH_CRON_SECRET` aleatório com no mínimo 32 caracteres.
2. Cadastre `project_url`, `publishable_key` e `PUBLISH_CRON_SECRET` no Vault.
3. Cadastre o mesmo `PUBLISH_CRON_SECRET` nos secrets da Edge Function.
4. Cadastre `WORDPRESS_SITE_URL`, `WORDPRESS_USERNAME` e
   `WORDPRESS_APPLICATION_PASSWORD` nos secrets da Edge Function.
5. Faça deploy da Edge Function e valide uma chamada sem artigos elegíveis.
6. Aplique isoladamente a migração que remove o job legado.
7. Aplique `20261018152154_supabase_edge_publisher.sql` para preparar a fila.
8. Revise os artigos atualmente elegíveis antes de ativar o job.
9. Aplique `20261018152441_activate_supabase_edge_publisher.sql`. Não use `db push`:
   o banco remoto atual não possui histórico de migrations.
10. Confirme duas execuções HTTP 2xx em `cron.job_run_details` e nos logs da função.

## Rollback

Se a função falhar, desative o novo job com `cron.unschedule` enquanto o erro é
investigado. Não restaure o job que chama a Vercel. Artigos não concluídos retornam
ao status anterior e ficam disponíveis para retry.

## Regras operacionais

- Não mantenha credenciais do worker na Vercel.
- Não execute a função manualmente se houver artigos elegíveis: ela publica conteúdo real.
- Verifique apenas metadados dos segredos, nunca seus valores.
- Monitore `publishing` preso por mais de 15 minutos e `last_publish_error`.
