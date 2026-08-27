import { sql } from "drizzle-orm";
import type { detailProducts, products } from "../../models/product.model";

/**
 * Subquery berkorelasi: id varian pertama milik satu produk, dipakai berulang
 * di endpoint publik (`/products`, `/products/:id/related`, `/wishlists`) —
 * lihat issue #98 §6.2. Selalu `visibility = 'visible'` dan belum di-soft-delete.
 *
 * Dipakai lewat `leftJoin(detailProducts, eq(detailProducts.id, firstVariantIdSubquery(products)))`.
 */
export function firstVariantIdSubquery(productsTable: typeof products) {
  return sql<string>`(
    select dp.id from detail_products dp
    where dp.product_id = ${productsTable.id}
      and dp.deleted_at is null
      and dp.visibility = 'visible'
    order by dp.created_at asc, dp.id asc
    limit 1
  )`;
}

/**
 * Produk yang tidak punya varian visible sama sekali tidak mungkin
 * ditampilkan (tanpa harga/gambar) — dikeluarkan dari semua hasil publik
 * (issue #98 §8.1).
 */
export function hasVisibleVariantCondition(productsTable: typeof products) {
  return sql`exists (
    select 1 from detail_products dp3
    where dp3.product_id = ${productsTable.id}
      and dp3.deleted_at is null
      and dp3.visibility = 'visible'
  )`;
}

/**
 * Gambar varian pertama (order ASC) milik varian yang sudah di-join sebagai
 * "varian pertama produk" (lihat firstVariantIdSubquery).
 */
export function firstImageObjectKeyExpr(
  detailProductsTable: typeof detailProducts,
) {
  return sql<string | null>`(
    select m.object_key from detail_product_images dpi
    join media m on m.id = dpi.media_id
    where dpi.detail_product_id = ${detailProductsTable.id}
    order by dpi."order" asc
    limit 1
  )`;
}

/** Rumus stok (§2.2): ledger, dihitung tiap kali — bukan kolom tunggal. */
export function firstVariantStockExpr(
  detailProductsTable: typeof detailProducts,
) {
  return sql<number>`coalesce((
    select sum(s.quantity) filter (where s.deleted_at is null)
    from stocks s
    where s.detail_product_id = ${detailProductsTable.id}
  ), 0)`;
}

/** Bungkus array id/slug jadi tuple SQL `(v1, v2, ...)` yang ter-parameterisasi. */
export function sqlTuple(values: string[]) {
  return sql`(${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`;
}
