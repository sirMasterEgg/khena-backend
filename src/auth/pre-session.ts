import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authConfig } from "../config/auth.config";

function sign(message: string): string {
  return createHmac("sha256", authConfig.preSessionSecret)
    .update(message)
    .digest("hex");
}

// Pre-session stateless (TANPA DB) untuk mitigasi login CSRF.
// cookie value format: "<preSessionId>.<expEpochSeconds>.<signature>"
export function issuePreSession(): {
  cookieValue: string;
  preSessionId: string;
} {
  const preSessionId = randomBytes(32).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + authConfig.preSessionTtl;
  const message = `${preSessionId}.${exp}`;
  return { cookieValue: `${message}.${sign(message)}`, preSessionId };
}

// return preSessionId kalau valid & belum kadaluarsa, selain itu null
export function verifyPreSession(
  cookieValue: string | undefined,
): string | null {
  if (!cookieValue) {
    return null;
  }
  const parts = cookieValue.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [preSessionId, expStr, signature] = parts;
  if (!preSessionId || !expStr || !signature) {
    return null;
  }
  const message = `${preSessionId}.${expStr}`;

  const expected = sign(message);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  if (Number(expStr) * 1000 < Date.now()) {
    return null; // kadaluarsa
  }
  return preSessionId;
}
