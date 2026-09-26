import { ConfigurationError } from "@/lib/errors";

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError(`${name} is not configured`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function githubPrivateKey(): string {
  const value = requiredEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!value.includes("BEGIN") || !value.includes("PRIVATE KEY")) {
    throw new ConfigurationError("GITHUB_APP_PRIVATE_KEY is not a PEM private key");
  }
  return value;
}

export function appUrl(): string {
  const raw = requiredEnv("APP_URL");
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("invalid protocol");
    return url.origin;
  } catch {
    throw new ConfigurationError("APP_URL must be an absolute HTTP(S) URL");
  }
}
