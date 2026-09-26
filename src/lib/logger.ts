const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(secret|token|password|private.?key|authorization|webhook.?url|api.?key)/i;
const URL_CREDENTIAL = /https:\/\/hooks\.slack\.com\/services\/\S+/gi;
const TOKEN_LIKE = /\b(?:gh[opsu]_|github_pat_|Bearer\s+)[A-Za-z0-9_.-]+/gi;

function redact(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === "string") {
    return value.replace(URL_CREDENTIAL, REDACTED).replace(TOKEN_LIKE, REDACTED);
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return value;
}

type LogFields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", message: string, fields: LogFields = {}): void {
  const entry = JSON.stringify(redact({ timestamp: new Date().toISOString(), level, message, ...fields }));
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export const logger = {
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};

export function sanitizeProviderMessage(value: string): string {
  return String(redact(value)).slice(0, 500);
}
