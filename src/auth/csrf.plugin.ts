import { Elysia } from "elysia";
import { errorBody } from "../utils/errors";
import { extractBearerToken, verifyAccessToken } from "./access-token";
import { verifyCsrfToken } from "./csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Signed double submit cookie (OWASP). Aktifkan per-route dengan `csrf: true`.
// CSRF token diverifikasi terhadap sesi login (administrator_sessions.id) yang
// diambil dari access token. Kasus khusus login (pre-session) ditangani di
// auth controller, bukan lewat macro ini.
export const csrfPlugin = new Elysia({ name: "csrf" }).macro({
  csrf: (enabled: boolean) => {
    if (!enabled) {
      return;
    }
    return {
      async beforeHandle({ request, headers, cookie, status }) {
        if (SAFE_METHODS.has(request.method)) {
          return;
        }

        const headerToken = headers["x-csrf-token"];
        const cookieToken = cookie.csrfToken?.value;
        if (!headerToken || !cookieToken || headerToken !== cookieToken) {
          return status(403, errorBody("FORBIDDEN", "invalid csrf token"));
        }

        // sessionId diambil dari konteks sesi (access token), bukan dari token.
        const payload = await verifyAccessToken(
          extractBearerToken(headers.authorization),
        );
        if (!payload || !verifyCsrfToken(headerToken, payload.sessionId)) {
          return status(403, errorBody("FORBIDDEN", "invalid csrf token"));
        }
      },
    };
  },
});
