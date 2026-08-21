import {
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

/**
 * Konten CMS ringan untuk halaman statis storefront (home, about, dst),
 * dipecah per section (hero, banner, testimonial, ...). Hanya dibaca lewat
 * GET publik — CRUD admin di luar scope, data diisi manual lewat SQL/seed
 * (lihat issue #98 §2).
 */
export const pages = pgTable(
  "pages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    page: varchar("page", { length: 50 }).notNull(),
    section: varchar("section", { length: 50 }).notNull(),
    // Bentuk `data` sengaja bebas: tiap section punya struktur sendiri
    // (hero, banner, testimonial, ...) dan frontend yang menafsirkannya.
    data: jsonb("data").notNull(),
    // "visible" | "hidden" — kosakata yang sama dengan detail_products.visibility,
    // bukan istilah baru (public/private). Tetap varchar mengikuti konvensi
    // repo yang tidak memakai pg enum; pembatasan nilai di layer aplikasi.
    visibility: varchar("visibility", { length: 15 }).notNull(),
    // "draft" | "published"
    status: varchar("status", { length: 15 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("pages_page_section_unique").on(table.page, table.section),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
