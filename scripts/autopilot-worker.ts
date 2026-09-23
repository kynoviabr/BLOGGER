import fs from 'fs';
import path from 'path';

// Carrega .env.local se existir e variáveis não estiverem setadas
function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
}

loadLocalEnv();

// Importação dinâmica/após carregamento do env
import { AutopilotService } from '../services/scheduler/autopilot.service';

const CHECK_INTERVAL_MS = 60000; // 60 segundos
let isRunning = false;

console.log(`
============================================================
🤖 BLOGGER AUTOPILOT WORKER INICIADO
Status:      Ativo e monitorando blogs em tempo real
Frequência:  A cada ${CHECK_INTERVAL_MS / 1000} segundos (1 minuto)
Ambiente:    ${process.env.NODE_ENV || 'production'}
PID:         ${process.pid}
============================================================
`);

async function runAutopilotCycle() {
  if (isRunning) {
    console.log(`[${new Date().toLocaleTimeString()}] ⏳ Ciclo anterior ainda em execução. Aguardando próximo minuto...`);
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const summary = await AutopilotService.checkAndRun();
    const elapsed = Date.now() - startTime;

    if (summary.blogsExecuted > 0) {
      console.log(
        `[${new Date().toLocaleTimeString()}] ✅ Ciclo concluído em ${elapsed}ms: ${summary.blogsExecuted} pauta(s) executada(s) com sucesso.`
      );
    } else {
      console.log(
        `[${new Date().toLocaleTimeString()}] 💤 Ciclo concluído em ${elapsed}ms: ${summary.blogsChecked} blog(s) avaliados, nenhuma pauta elegível neste minuto.`
      );
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Erro durante ciclo do Autopilot:`, error);
  } finally {
    isRunning = false;
  }
}

// 1. Execução inicial imediata
runAutopilotCycle();

// 2. Loop contínuo a cada 60 segundos
const timer = setInterval(runAutopilotCycle, CHECK_INTERVAL_MS);

// 3. Encerramento gracioso
const handleShutdown = (signal: string) => {
  console.log(`\n[Autopilot Worker] Recebido sinal ${signal}. Encerrando serviço de forma graciosa...`);
  clearInterval(timer);
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
