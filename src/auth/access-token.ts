import { jwt } from "@elysiajs/jwt";
import { authConfig } from "../config/auth.config";

export interface AccessTokenPayload {
  sub: string; // administrator id
  sessionId: string; // administrator_sessions.id
}

// Plugin resmi @elysiajs/jwt; decorator-nya dipakai sebagai helper sign/verify
// supaya service & plugin lain bisa memakai JWT tanpa terikat context Elysia.
const jwtPlugin = jwt({
  name: "jwt",
  secret: authConfig.jwtSecret,
  exp: `${authConfig.accessTtl}s`,
});

const { jwt: accessJwt } = jwtPlugin.decorator;

export function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return accessJwt.sign({ sub: payload.sub, sessionId: payload.sessionId });
}

export async function verifyAccessToken(
  token: string | undefined,
): Promise<AccessTokenPayload | null> {
  if (!token) {
    return null;
  }
  const payload = await accessJwt.verify(token);
  if (
    !payload ||
    typeof payload.sub !== "string" ||
    typeof payload.sessionId !== "string"
  ) {
    return null;
  }
  return { sub: payload.sub, sessionId: payload.sessionId };
}

// Ambil access token dari header `Authorization: Bearer <token>`.
export function extractBearerToken(
  authorization: string | undefined,
): string | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  return authorization.slice("Bearer ".length);
}
