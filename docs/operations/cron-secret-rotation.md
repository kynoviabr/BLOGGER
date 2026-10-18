# Rotacao segura do segredo do cron

Este procedimento troca o segredo sem interromper o publicador agendado. Nunca
registre o valor do segredo em issue, PR, log ou arquivo versionado.

## Estado observado antes da rotacao

- O cron remoto usa `GET` e o fallback legado conhecido.
- O Supabase Vault ainda nao possui `CRON_SECRET`.
- A producao da Vercel possui `CRON_SECRET`; por ser secreto, seu valor nao foi lido.
- O ambiente local ainda usa o valor legado de 12 caracteres.
- O preview nao possui variaveis de ambiente e nao deve receber credenciais de producao.

## Sequencia de rollout

1. Gere um segredo aleatorio com no minimo 32 caracteres.
2. Na Vercel, salve o valor legado temporariamente como `CRON_SECRET_PREVIOUS`.
3. Atualize `CRON_SECRET` da Vercel com o valor novo, somente em Production.
4. Implante a versao que aceita `CRON_SECRET` e `CRON_SECRET_PREVIOUS`.
5. Cadastre o mesmo valor novo no Supabase Vault com o nome `CRON_SECRET`.
6. Aplique `20261018150608_phase0_secure_cron.sql` de forma isolada. Nao use
   `supabase db push`: o banco remoto atual nao possui historico de migrations.
7. Confirme que o job usa `net.http_post`, nao contem o fallback legado e recebe HTTP 2xx.
8. Remova `CRON_SECRET_PREVIOUS` da Vercel e faça um novo deployment.
9. Rode os security advisors e registre o resultado.

## Rollback

Enquanto `CRON_SECRET_PREVIOUS` estiver configurado, a aplicacao aceita o valor
anterior. Se o novo cron falhar, restaure temporariamente o job anterior, investigue
o erro e nao remova a variavel de transicao. O fallback literal nunca deve voltar
para SQL versionado.

## Regras operacionais

- Nao copie segredos de Production para Preview.
- Nao execute o endpoint manualmente durante a validacao: ele publica conteudo real.
- Verifique apenas metadados do segredo (existencia e comprimento), nunca o valor.
- Remova a compatibilidade anterior assim que duas execucoes consecutivas do cron
  novo forem confirmadas.
