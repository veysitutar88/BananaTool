/**
 * logger.ts — Nano Banana Studio
 *
 * Lightweight singleton logger with:
 *   - 4 levels: debug / info / warn / error
 *   - Color-coded console output with HH:MM:SS.ms timestamps
 *   - Scoped loggers: logger.scope('Gemini') returns bound debug/info/warn/error
 *   - Timer helpers: startTimer() returns a stop() fn that logs duration
 *   - Watchdog: logger.watchdog(scope, label, promise, timeoutMs)
 *       → logs start, duration, and error
 *       → emits WARN if promise exceeds timeoutMs (but does NOT cancel it)
 *   - In-memory ring buffer: logger.recent(n) returns last N entries
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   const log = logger.scope('MyModule');
 *   log.info('Starting task');
 *   const result = await logger.watchdog('MyModule', 'fetchData', fetch('/api'), 30_000);
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts:    number;
  level: LogLevel;
  scope: string;
  msg:   string;
  data?: unknown;
}

export interface ScopedLogger {
  debug: (msg: string, data?: unknown) => void;
  info:  (msg: string, data?: unknown) => void;
  warn:  (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '#6b7280',  // gray
  info:  '#3b82f6',  // blue
  warn:  '#f59e0b',  // amber
  error: '#ef4444',  // red
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DBG',
  info:  'INF',
  warn:  'WRN',
  error: 'ERR',
};

// ─── Logger class ─────────────────────────────────────────────────────────────

class Logger {
  private buffer: LogEntry[] = [];
  private readonly BUFFER_MAX = 100;

  // ── Internal write ──────────────────────────────────────────────────────────

  private write(level: LogLevel, scope: string, msg: string, data?: unknown): void {
    const ts = Date.now();
    const entry: LogEntry = { ts, level, scope, msg, data };

    // Maintain ring buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.BUFFER_MAX) {
      this.buffer.shift();
    }

    // Format timestamp as HH:MM:SS.ms
    const d    = new Date(ts);
    const hh   = String(d.getHours()).padStart(2, '0');
    const mm   = String(d.getMinutes()).padStart(2, '0');
    const ss   = String(d.getSeconds()).padStart(2, '0');
    const ms   = String(d.getMilliseconds()).padStart(3, '0');
    const time = `${hh}:${mm}:${ss}.${ms}`;

    const color = LEVEL_COLOR[level];
    const lbl   = LEVEL_LABEL[level];
    const line  = `%c${time} ${lbl} [${scope}] ${msg}`;

    if (data !== undefined) {
      // Collapsible group when extra data is provided
      console.groupCollapsed(line, `color:${color};font-weight:bold`);
      console.log(data);
      console.groupEnd();
    } else {
      console.log(line, `color:${color};font-weight:bold`);
    }
  }

  // ── Public level methods ────────────────────────────────────────────────────

  debug(scope: string, msg: string, data?: unknown): void { this.write('debug', scope, msg, data); }
  info (scope: string, msg: string, data?: unknown): void { this.write('info',  scope, msg, data); }
  warn (scope: string, msg: string, data?: unknown): void { this.write('warn',  scope, msg, data); }
  error(scope: string, msg: string, data?: unknown): void { this.write('error', scope, msg, data); }

  // ── Scoped logger ───────────────────────────────────────────────────────────

  /**
   * Returns a helper object with debug/info/warn/error bound to `name`.
   * Use at module level: `const log = logger.scope('Gemini');`
   */
  scope(name: string): ScopedLogger {
    return {
      debug: (msg, data?) => this.debug(name, msg, data),
      info:  (msg, data?) => this.info (name, msg, data),
      warn:  (msg, data?) => this.warn (name, msg, data),
      error: (msg, data?) => this.error(name, msg, data),
    };
  }

  // ── Timer ───────────────────────────────────────────────────────────────────

  /**
   * Starts a performance timer.
   * Returns a `stop()` function — call it to log the elapsed time.
   *
   * @example
   *   const stop = logger.startTimer('Gemini', 'extractDNA');
   *   await doWork();
   *   stop(); // logs: "extractDNA — 1234ms"
   */
  startTimer(scope: string, label: string): () => number {
    const start = performance.now();
    return (): number => {
      const ms = Math.round(performance.now() - start);
      this.info(scope, `${label} — ${ms}ms`);
      return ms;
    };
  }

  // ── Watchdog ────────────────────────────────────────────────────────────────

  /**
   * Wraps a Promise with logging and a soft timeout watchdog.
   *
   * - Logs when the operation starts and finishes (with duration).
   * - If the promise takes longer than `timeoutMs`, emits a WARN.
   *   The promise is NOT cancelled — it continues running.
   * - If the promise rejects, logs the error and re-throws.
   *
   * @param scope      Module name shown in log (e.g. 'Gemini', 'ImageGen')
   * @param label      Operation name (e.g. 'extractImageJson')
   * @param promise    The async operation to monitor
   * @param timeoutMs  Soft limit in milliseconds. WARN is emitted if exceeded.
   */
  async watchdog<T>(
    scope: string,
    label: string,
    promise: Promise<T>,
    timeoutMs = 60_000,
  ): Promise<T> {
    this.info(scope, `${label} — started`);
    const stop = this.startTimer(scope, label);

    const warnTimer = setTimeout(() => {
      this.warn(scope, `⚠️ ${label} is taking > ${timeoutMs / 1000}s — still running…`);
    }, timeoutMs);

    try {
      const result = await promise;
      clearTimeout(warnTimer);
      stop();
      return result;
    } catch (err: unknown) {
      clearTimeout(warnTimer);
      stop();
      this.error(scope, `${label} — FAILED`, err);
      throw err;
    }
  }

  // ── Buffer access ───────────────────────────────────────────────────────────

  /**
   * Returns the last `n` log entries from the in-memory ring buffer.
   * Useful for debugging or displaying recent activity in a UI panel.
   */
  recent(n = 20): LogEntry[] {
    return this.buffer.slice(-Math.abs(n));
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const logger = new Logger();
