import { LogLevel } from '@/types/database';

export interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

class SystemLogger {
  private readonly sensitiveKeyPattern = /authorization|api[-_]?key|application[-_]?password|password|secret|token|cookie/i;

  private sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, seen));
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        this.sensitiveKeyPattern.test(key) ? '[REDACTED]' : this.sanitize(entryValue, seen),
      ])
    );
  }

  private formatConsole(entry: LogEntry): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.service}] ${entry.message}`;
  }

  log(entry: LogEntry): void {
    const formatted = this.formatConsole(entry);
    const safeMetadata = entry.metadata ? this.sanitize(entry.metadata) : '';
    switch (entry.level) {
      case 'error':
        console.error(formatted, safeMetadata);
        break;
      case 'warn':
        console.warn(formatted, safeMetadata);
        break;
      case 'debug':
        console.debug(formatted, safeMetadata);
        break;
      default:
        console.info(formatted, safeMetadata);
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
