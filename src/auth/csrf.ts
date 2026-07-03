import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authConfig } from "../config/auth.config";

// message dibentuk seperti pseudocode OWASP (panjang!nilai) agar tidak ambigu.
function buildMessage(sessionId: string, randomValue: string): string {
  return `${sessionId.length}!${sessionId}!${randomValue.length}!${randomValue}`;
}

function hmac(message: string): string {
  return createHmac("sha256", authConfig.csrfSecret)
    .update(message)
    .digest("hex");
}

// Buat token baru untuk sessionId (administratorSession.id ATAU preSessionId).
// Format token: "<hmac>.<randomValue>" (sessionId TIDAK disimpan di token).
export function generateCsrfToken(sessionId: string): string {
  const randomValue = randomBytes(32).toString("hex");
  const signature = hmac(buildMessage(sessionId, randomValue));
  return `${signature}.${randomValue}`;
}

export function verifyCsrfToken(token: string, sessionId: string): boolean {
  const idx = token.indexOf(".");
  if (idx < 0) {
    return false;
  }
  const signature = token.slice(0, idx);
  const randomValue = token.slice(idx + 1);
  if (!randomValue) {
    return false;
  }

  // Hitung ulang HMAC pakai sessionId dari konteks sesi (bukan dari token).
  const expected = hmac(buildMessage(sessionId, randomValue));
  return safeEqualHex(signature, expected);
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}
