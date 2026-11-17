/** Schlichtes Logging nach stdout/stderr (launchd schreibt es in Logdateien). Keine Secrets loggen. */
type Level = "info" | "warn" | "error";
export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}${extra ? " " + JSON.stringify(extra) : ""}`;
  (level === "info" ? console.log : console.error)(line);
}

export const consoleLogger: Logger = {
  info: (m, e) => emit("info", m, e),
  warn: (m, e) => emit("warn", m, e),
  error: (m, e) => emit("error", m, e),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
