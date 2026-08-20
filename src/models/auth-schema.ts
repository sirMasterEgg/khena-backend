/**
 * FILE HASIL GENERATE — jangan diedit manual.
 *
 * Sumber kebenarannya `src/auth/user-auth.ts`. Untuk mengubah nama tabel,
 * nama kolom, atau menambah field: ubah konfigurasi di sana lalu jalankan
 *
 *   bunx auth@latest generate --config src/auth/user-auth.ts \
 *     --output src/models/auth-schema.ts
 *
 * ⚠️ Paketnya `auth`, BUKAN `@better-auth/cli` — paket lama itu berhenti di
 * 1.4.x dan menghasilkan schema yang tidak cocok dengan better-auth 1.7
 * (kolom `issuer` pada auth_accounts hilang → sign-up gagal 500).
 *
 * ⚠️ SATU pengecualian: unique index `auth_users_phone_unique` di bawah adalah
 * tambahan lokal (better-auth tidak punya atribut `unique` untuk
 * additionalFields). Blok itu HILANG setiap kali file ini di-generate ulang —
 * tambahkan kembali.
 *
 * Tabel-tabel di sini milik library, jadi konvensi repo (kolom audit
 * `...auditColumns`, PK `uuid`, soft delete) memang tidak berlaku.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const auth_users = pgTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    phone: text("phone").notNull(),
  },
  // ⬇⬇ TAMBAHAN LOKAL — bukan hasil generate. Jangan dihapus. ⬇⬇
  // Satu nomor telepon = satu akun website. Lapis aplikasi (hook validasi di
  // src/auth/user-auth.ts) yang memberi pesan "phone already exists"; index ini
  // pengaman terakhir untuk dua signup bersamaan dengan nomor yang sama.
  // Unik penuh, bukan partial: tabel ini tidak mengenal soft delete.
  (table) => [uniqueIndex("auth_users_phone_unique").on(table.phone)],
);

export const auth_sessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_sessions_userId_idx").on(table.userId)],
);

export const auth_accounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_accounts_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId,
    ),
    index("auth_accounts_userId_idx").on(table.userId),
  ],
);

export const auth_verifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const auth_usersRelations = relations(auth_users, ({ many }) => ({
  auth_sessionss: many(auth_sessions),
  auth_accountss: many(auth_accounts),
}));

export const auth_sessionsRelations = relations(auth_sessions, ({ one }) => ({
  auth_users: one(auth_users, {
    fields: [auth_sessions.userId],
    references: [auth_users.id],
  }),
}));

export const auth_accountsRelations = relations(auth_accounts, ({ one }) => ({
  auth_users: one(auth_users, {
    fields: [auth_accounts.userId],
    references: [auth_users.id],
  }),
}));
