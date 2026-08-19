import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { authConfig } from "../config/auth.config";
import { userAuthConfig } from "../config/user-auth.config";
import {
  auth_accounts,
  auth_sessions,
  auth_users,
  auth_verifications,
} from "../models/auth-schema";
import { UserAuthRepository } from "../repositories/user-auth.repository";
import { UserAuthService } from "../services/user-auth.service";
import { db } from "../utils/db";
import { AppError } from "../utils/errors";
import { sendMail } from "../utils/mailer";

const service = new UserAuthService(new UserAuthRepository());

/**
 * Service melempar AppError (tipe error milik repo ini) supaya tetap bebas
 * dari urusan HTTP. Penerjemahan ke status code terjadi di sini, di batas
 * library.
 *
 * Hanya AppError yang jadi 4xx. Error lain — koneksi database putus, tabel
 * belum dimigrasi — sengaja dilempar ulang apa adanya supaya jadi 500 dan
 * detail internalnya (mis. query SQL) tidak bocor ke client.
 */
function toApiError(error: unknown): never {
  if (error instanceof AppError) {
    throw new APIError(
      error.httpStatus === 401 ? "UNAUTHORIZED" : "BAD_REQUEST",
      { message: error.message },
    );
  }
  throw error;
}

/**
 * Auth USER (pengguna website) — dibangun penuh di atas better-auth, terpisah
 * total dari auth administrator (`src/auth/*` lain + auth.controller.ts).
 *
 * Endpoint-endpointnya tidak ditulis manual: begitu `userAuth.handler`
 * di-mount di src/index.ts, better-auth menyediakan /sign-up/email,
 * /sign-in/email, /sign-out, /get-session, /request-password-reset,
 * /reset-password, dan /update-user di bawah basePath di bawah ini.
 */
export const userAuth = betterAuth({
  appName: "Khena",
  secret: userAuthConfig.secret,
  baseURL: userAuthConfig.baseUrl,
  // Absolut, karena server Elysia utama sudah memakai prefix /api.
  basePath: "/api/auth",
  // Request lintas origin di luar daftar ini ditolak better-auth.
  trustedOrigins: [userAuthConfig.appPublicUrl, userAuthConfig.adminAppUrl],

  database: drizzleAdapter(db, {
    provider: "pg",
    // Key-nya WAJIB memakai nama tabel (hasil `modelName` di bawah), bukan
    // nama model logis better-auth (user/session/account/verification).
    // Adapter melakukan lookup `schema[modelName]`, jadi key `user:` akan
    // gagal dengan "model auth_users was not found in the schema object".
    schema: {
      auth_users,
      auth_sessions,
      auth_accounts,
      auth_verifications,
    },
  }),

  // Nama tabel diberi prefix `auth_` supaya tidak bentrok dengan tabel domain
  // yang sudah ada di database ini.
  user: {
    modelName: "auth_users",
    additionalFields: {
      // Nomor telepon: wajib saat signup, boleh diubah lewat /update-user.
      // Validasi & keunikannya ditegakkan lewat hook (lihat user-auth.service).
      phone: { type: "string", required: true, input: true },
    },
  },
  session: {
    modelName: "auth_sessions",
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    updateAge: 60 * 60 * 24, // perpanjang kalau sesi dipakai setelah 1 hari
  },
  account: { modelName: "auth_accounts" },
  verification: { modelName: "auth_verifications" },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset password akun Khena",
        text: `Buka tautan berikut untuk mengatur ulang password: ${url}`,
      });
    },
  },

  advanced: {
    database: {
      // UUID v7 (bukan v4 bawaan `generateId: "uuid"`), menyamakan dengan
      // tabel domain lain yang memakai `$defaultFn(() => Bun.randomUUIDv7())`.
      // v7 terurut waktu, jadi insert-nya ramah terhadap B-tree index.
      generateId: () => Bun.randomUUIDv7(),
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: authConfig.cookieSecure,
    },
  },

  hooks: {
    // `ctx.path` relatif terhadap basePath: "/sign-up/email", bukan
    // "/api/auth/sign-up/email".
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const body = await service.validateSignUp(ctx.body).catch(toApiError);
        return { context: { ...ctx, body: { ...ctx.body, ...body } } };
      }

      if (ctx.path === "/update-user") {
        // Butuh id user yang sedang login untuk mengecualikan dirinya sendiri
        // saat cek nomor telepon unik. Hook berjalan sebelum session middleware
        // milik endpoint, jadi sesinya diambil manual di sini.
        const session = await getSessionFromCtx(ctx);
        if (!session) {
          throw new APIError("UNAUTHORIZED");
        }

        const body = await service
          .validateUpdateProfile(ctx.body, session.user.id)
          .catch(toApiError);
        return { context: { ...ctx, body: { ...ctx.body, ...body } } };
      }

      if (ctx.path === "/reset-password") {
        const raw = ctx.body as { newPassword?: unknown } | undefined;
        try {
          service.validateNewPassword(raw?.newPassword);
        } catch (error) {
          toApiError(error);
        }
      }
    }),
  },
});

// CLI better-auth (`@better-auth/cli generate`) hanya mengenali default export
// atau variabel bernama `auth`. Kode aplikasi tetap memakai named export
// `userAuth` di atas supaya jelas ini auth user, bukan auth administrator.
export default userAuth;
