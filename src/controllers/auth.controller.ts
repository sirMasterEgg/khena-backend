import { type Cookie, Elysia, t } from "elysia";
import { extractBearerToken, verifyAccessToken } from "../auth/access-token";
import { generateCsrfToken, verifyCsrfToken } from "../auth/csrf";
import { csrfPlugin } from "../auth/csrf.plugin";
import { issuePreSession, verifyPreSession } from "../auth/pre-session";
import { authConfig } from "../config/auth.config";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import type { AuthService } from "../services/auth.service";
import { errorBody } from "../utils/errors";

const loginBody = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 1 }),
});

// Semua cookie yang dipakai modul auth (nama camelCase, semuanya opsional).
const authCookie = t.Cookie({
  preSession: t.Optional(t.String()),
  refreshToken: t.Optional(t.String()),
  csrfToken: t.Optional(t.String()),
});

type Cookies = Record<string, Cookie<unknown>>;

function cookieValue(cookie: Cookie<unknown> | undefined): string | undefined {
  return typeof cookie?.value === "string" ? cookie.value : undefined;
}

// CSRF token WAJIB readable oleh JS (double submit) — bukan httpOnly.
function setCsrfCookie(cookie: Cookies, csrfToken: string) {
  cookie.csrfToken?.set({
    value: csrfToken,
    httpOnly: false,
    sameSite: "lax",
    secure: authConfig.cookieSecure,
    path: "/",
  });
}

function setRefreshCookie(cookie: Cookies, refreshTokenRaw: string) {
  cookie.refreshToken?.set({
    value: refreshTokenRaw,
    httpOnly: true,
    sameSite: "lax",
    secure: authConfig.cookieSecure,
    path: "/api/auth",
    maxAge: authConfig.refreshTtl,
  });
}

function removePreSessionCookie(cookie: Cookies) {
  cookie.preSession?.set({
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
    .get(
      "/csrf",
      async ({ headers, cookie }) => {
        const payload = await verifyAccessToken(
          extractBearerToken(headers.authorization),
        );
        if (payload) {
          const csrfToken = generateCsrfToken(payload.sessionId);
          setCsrfCookie(cookie, csrfToken);
          return { data: { csrfToken } };
        }

        let preSessionId = verifyPreSession(cookieValue(cookie.preSession));
        if (!preSessionId) {
          const issued = issuePreSession();
          preSessionId = issued.preSessionId;
          cookie.preSession?.set({
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
      },
      {
        cookie: authCookie,
        response: {
          200: dataEnvelope(t.Object({ csrfToken: t.String() })),
        },
      },
    )
    // Data user yang sedang login. Otentikasi via Bearer token (bukan cookie),
    // jadi tidak butuh CSRF. Token invalid/expired/revoked → 401 lewat service.me.
    .get(
      "/me",
      async ({ headers }) => {
        const admin = await service.me(
          extractBearerToken(headers.authorization),
        );
        return {
          data: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
          },
        };
      },
      {
        response: {
          200: dataEnvelope(
            t.Object({
              id: t.String(),
              name: t.String(),
              email: t.String(),
              role: t.Union([t.String(), t.Null()]),
            }),
          ),
          ...errorResponses,
        },
      },
    )
    .post(
      "/login",
      async ({ body, headers, cookie, status }) => {
        // Anti login CSRF: token diverifikasi terhadap pre-session.
        const preSessionId = verifyPreSession(cookieValue(cookie.preSession));
        const headerToken = headers["x-csrf-token"];
        const cookieToken = cookieValue(cookie.csrfToken);
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
              role: result.admin.role,
            },
          },
        };
      },
      {
        body: loginBody,
        cookie: authCookie,
        response: {
          200: dataEnvelope(
            t.Object({
              accessToken: t.String(),
              admin: t.Object({
                id: t.String(),
                name: t.String(),
                email: t.String(),
                role: t.Union([t.String(), t.Null()]),
              }),
            }),
          ),
          ...errorResponses,
        },
      },
    )
    .post(
      "/refresh",
      async ({ cookie, status }) => {
        const refreshTokenRaw = cookieValue(cookie.refreshToken);
        if (!refreshTokenRaw) {
          return status(
            401,
            errorBody("UNAUTHORIZED", "missing refresh token"),
          );
        }

        const result = await service.refresh(refreshTokenRaw);
        setRefreshCookie(cookie, result.refreshTokenRaw);
        setCsrfCookie(cookie, result.csrfToken);
        return { data: { accessToken: result.accessToken } };
      },
      {
        cookie: authCookie,
        response: {
          200: dataEnvelope(t.Object({ accessToken: t.String() })),
          ...errorResponses,
        },
      },
    )
    .post(
      "/logout",
      async ({ cookie }) => {
        const refreshTokenRaw = cookieValue(cookie.refreshToken);
        if (refreshTokenRaw) {
          await service.logout(refreshTokenRaw);
        }

        cookie.refreshToken?.set({
          value: "",
          httpOnly: true,
          sameSite: "lax",
          secure: authConfig.cookieSecure,
          path: "/api/auth",
          maxAge: 0,
        });
        cookie.csrfToken?.set({
          value: "",
          httpOnly: false,
          sameSite: "lax",
          secure: authConfig.cookieSecure,
          path: "/",
          maxAge: 0,
        });
        return { data: "OK" };
      },
      {
        csrf: true,
        cookie: authCookie,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
