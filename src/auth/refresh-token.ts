import { createHash, randomBytes } from "node:crypto";

// Refresh token = opaque random (BUKAN JWT). Dikirim ke client hanya lewat
// httpOnly cookie; yang disimpan di DB hanya hash SHA-256-nya.
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
