import { timingSafeEqual } from "node:crypto";

export function validInstallationState(expected: string, returned: string): boolean {
  if (!expected || expected.length !== returned.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(returned));
}
