/**
 * Structured JSON logs (Cloud Logging parses `severity` and `message`).
 * Context fields such as shop_id, update_id and job make logs searchable.
 */
type Fields = Record<string, unknown>;

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function write(severity: "DEBUG" | "INFO" | "WARNING" | "ERROR", message: string, fields?: Fields) {
  const entry: Record<string, unknown> = { severity, message, time: new Date().toISOString() };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      entry[k] = k === "err" ? serializeError(v) : typeof v === "bigint" ? v.toString() : v;
    }
  }
  const line = JSON.stringify(entry, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  if (severity === "ERROR") console.error(line);
  else if (severity === "WARNING") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Fields) => {
    if (process.env.NODE_ENV !== "production") write("DEBUG", m, f);
  },
  info: (m: string, f?: Fields) => write("INFO", m, f),
  warn: (m: string, f?: Fields) => write("WARNING", m, f),
  error: (m: string, f?: Fields) => write("ERROR", m, f),
};
