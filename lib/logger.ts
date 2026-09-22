import { LogLevel } from '@/types/database';

export interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

class SystemLogger {
  private formatConsole(entry: LogEntry): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.service}] ${entry.message}`;
  }

  log(entry: LogEntry): void {
    const formatted = this.formatConsole(entry);
    switch (entry.level) {
      case 'error':
        console.error(formatted, entry.metadata || '');
        break;
      case 'warn':
        console.warn(formatted, entry.metadata || '');
        break;
      case 'debug':
        console.debug(formatted, entry.metadata || '');
        break;
      default:
        console.info(formatted, entry.metadata || '');
    }
  }

  info(service: string, message: string, metadata?: Record<string, unknown>) {
    this.log({ level: 'info', service, message, metadata });
  }

  warn(service: string, message: string, metadata?: Record<string, unknown>) {
    this.log({ level: 'warn', service, message, metadata });
  }

  error(service: string, message: string, metadata?: Record<string, unknown>) {
    this.log({ level: 'error', service, message, metadata });
  }

  debug(service: string, message: string, metadata?: Record<string, unknown>) {
    this.log({ level: 'debug', service, message, metadata });
  }
}

export const logger = new SystemLogger();
