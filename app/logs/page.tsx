import Link from "next/link";
import { ScrollText, Filter, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogService, SystemLog } from "@/services/log.service";
import { formatDate } from "@/lib/utils";
import { LogLevel } from "@/types/database";
import { EmptyState } from "@/components/shared/empty-state";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: LogLevel; service?: string }>;
}) {
  const { level, service } = await searchParams;
  let logs: SystemLog[] = [];
  let loadError: string | null = null;

  try {
    logs = await LogService.listLogs({ level, service });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os logs.";
  }

  const levels: LogLevel[] = ["info", "warn", "error", "debug"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs do Sistema"
        description="Auditoria de eventos, disparos de automação, chamadas de IA e sincronização do banco de dados."
      />

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao consultar logs no Supabase:</span>
            {loadError}
          </div>
        </div>
      )}

      {/* Filtros de Nível */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-2">
          <Filter className="h-3.5 w-3.5" />
          <span>Nível:</span>
        </div>
        <Link href="/logs">
          <Badge variant={!level ? "info" : "outline"} className="cursor-pointer">
            Todos
          </Badge>
        </Link>
        {levels.map((lvl) => (
          <Link key={lvl} href={`/logs?level=${lvl}${service ? `&service=${service}` : ""}`}>
            <Badge variant={level === lvl ? "info" : "outline"} className="cursor-pointer uppercase">
              {lvl}
            </Badge>
          </Link>
        ))}
      </div>

      {logs.length === 0 && !loadError ? (
        <EmptyState
          title="Nenhum log registrado"
          description="Os logs de sistema e execução dos workers aparecerão aqui."
          icon={<ScrollText className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nível</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Metadados</TableHead>
                <TableHead className="whitespace-nowrap">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge
                      variant={
                        log.level === "error"
                          ? "error"
                          : log.level === "warn"
                          ? "warning"
                          : log.level === "info"
                          ? "info"
                          : "default"
                      }
                      className="uppercase text-[10px]"
                    >
                      {log.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {log.service}
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 dark:text-slate-300 max-w-md">
                    {log.message}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <pre className="text-[10px] bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md font-mono text-slate-600 dark:text-slate-300 overflow-x-auto max-h-16">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
