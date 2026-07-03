import { type Cookie, Elysia, t } from "elysia";
import { extractBearerToken, verifyAccessToken } from "../auth/access-token";
import { generateCsrfToken, verifyCsrfToken } from "../auth/csrf";
import { csrfPlugin } from "../auth/csrf.plugin";
import { issuePreSession, verifyPreSession } from "../auth/pre-session";
import { authConfig } from "../config/auth.config";
import type { AuthService } from "../services/auth.service";
import { errorBody } from "../utils/errors";

const loginBody = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 1 }),
});

type Cookies = Record<string, Cookie<unknown>>;

function cookieValue(cookie: Cookie<unknown> | undefined): string | undefined {
  return typeof cookie?.value === "string" ? cookie.value : undefined;
}

// CSRF token WAJIB readable oleh JS (double submit) — bukan httpOnly.
function setCsrfCookie(cookie: Cookies, csrfToken: string) {
  cookie.csrf_token?.set({
    value: csrfToken,
    httpOnly: false,
    sameSite: "lax",
    secure: authConfig.cookieSecure,
    path: "/",
  });
}

function setRefreshCookie(cookie: Cookies, refreshTokenRaw: string) {
  cookie.refresh_token?.set({
    value: refreshTokenRaw,
    httpOnly: true,
    sameSite: "lax",
    secure: authConfig.cookieSecure,
    path: "/api/auth",
    maxAge: authConfig.refreshTtl,
  });
}

function removePreSessionCookie(cookie: Cookies) {
  cookie.pre_session?.set({
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: authConfig.cookieSecure,
    path: "/api/auth",
    maxAge: 0,
  });
}

export const AuthController = (service: AuthService) =>
  new Elysia({ prefix: "/auth" })
    .use(csrfPlugin)
    // Bootstrap CSRF token: anonim → diikat ke pre-session (stateless signed
    // cookie), sudah login → diikat ke sesi login.
    .get("/csrf", async ({ headers, cookie }) => {
      const payload = await verifyAccessToken(
        extractBearerToken(headers.authorization),
      );
      if (payload) {
        const csrfToken = generateCsrfToken(payload.sessionId);
        setCsrfCookie(cookie, csrfToken);
        return { data: { csrfToken } };
      }

      let preSessionId = verifyPreSession(cookieValue(cookie.pre_session));
      if (!preSessionId) {
        const issued = issuePreSession();
        preSessionId = issued.preSessionId;
        cookie.pre_session?.set({
          value: issued.cookieValue,
          httpOnly: true,
          sameSite: "lax",
          secure: authConfig.cookieSecure,
          path: "/api/auth",
          maxAge: authConfig.preSessionTtl,
        });
      }
      const csrfToken = generateCsrfToken(preSessionId);
      setCsrfCookie(cookie, csrfToken);
      return { data: { csrfToken } };
    })
    .post(
      "/login",
      async ({ body, headers, cookie, status }) => {
        // Anti login CSRF: token diverifikasi terhadap pre-session.
        const preSessionId = verifyPreSession(cookieValue(cookie.pre_session));
        const headerToken = headers["x-csrf-token"];
        const cookieToken = cookieValue(cookie.csrf_token);
        if (
          !preSessionId ||
          !headerToken ||
          !cookieToken ||
          headerToken !== cookieToken ||
          !verifyCsrfToken(headerToken, preSessionId)
        ) {
          return status(403, errorBody("FORBIDDEN", "invalid csrf token"));
        }

        const result = await service.login({
          email: body.email,
          password: body.password,
          deviceInfo: headers["user-agent"],
        });

        // Anti session fixation: pre-session dibuang; sesi login memakai id
        // baru yang independen.
        removePreSessionCookie(cookie);
        setRefreshCookie(cookie, result.refreshTokenRaw);
        setCsrfCookie(cookie, result.csrfToken);

        return {
          data: {
            accessToken: result.accessToken,
            admin: {
              id: result.admin.id,
              name: result.admin.name,
              email: result.admin.email,
            },
          },
        };
      },
      { body: loginBody },
    )
    .post("/refresh", async ({ cookie, status }) => {
      const refreshTokenRaw = cookieValue(cookie.refresh_token);
      if (!refreshTokenRaw) {
        return status(401, errorBody("UNAUTHORIZED", "missing refresh token"));
      }

      const result = await service.refresh(refreshTokenRaw);
      setRefreshCookie(cookie, result.refreshTokenRaw);
      setCsrfCookie(cookie, result.csrfToken);
      return { data: { accessToken: result.accessToken } };
    })
    .post(
      "/logout",
      async ({ cookie }) => {
        const refreshTokenRaw = cookieValue(cookie.refresh_token);
        if (refreshTokenRaw) {
          await service.logout(refreshTokenRaw);
        }

        cookie.refresh_token?.set({
          value: "",
          httpOnly: true,
          sameSite: "lax",
          secure: authConfig.cookieSecure,
          path: "/api/auth",
          maxAge: 0,
        });
        cookie.csrf_token?.set({
          value: "",
          httpOnly: false,
          sameSite: "lax",
          secure: authConfig.cookieSecure,
          path: "/",
          maxAge: 0,
        });
        return { data: "OK" };
      },
      { csrf: true },
    );
