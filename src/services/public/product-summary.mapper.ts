import { buildMediaUrl } from "../../utils/media-url";

/**
 * Baris varian pertama sebuah produk, hasil query repository publik (list
 * produk, related products, wishlist). `variantId` bisa null kalau produk
 * tidak punya varian visible sama sekali — pemanggil bertanggung jawab
 * menyaring baris begitu di layer repository (issue #98 §8.1), fungsi ini
 * hanya memformat apa yang diterima.
 */
export interface ProductSummaryRow {
  id: string;
  name: string;
  baseSku: string;
  price: number | null;
  discountPercent: number | null;
  imageObjectKey: string | null;
  // SUM() atas kolom integer dikembalikan Postgres sebagai bigint, dan driver
  // `pg` mem-parse bigint sebagai string (menghindari presisi hilang) —
  // lihat pola yang sama di stock.repository.ts. Selalu di-Number()-kan di
  // bawah, jangan diasumsikan sudah angka.
  stock: number | string | null;
}

export interface ProductSummary {
  id: string;
  name: string;
  sku: string;
  image: string | null;
  price: number;
  discountPercent: number;
  priceAfterDiscount: number;
  stock: number;
}

/**
 * Mapper tunggal untuk bentuk "ringkasan produk" (issue #98 §6.3) — dipakai
 * ulang oleh public-product.service, public-wishlist.service, dst, supaya
 * rumus harga & stok hanya ada di satu tempat.
 *
 * Bukan class karena tidak menyimpan state maupun bergantung pada repository
 * — murni transformasi baris DB → bentuk response (lihat rumus §2.1 & §2.2).
 */
export function toProductSummary(row: ProductSummaryRow): ProductSummary {
  const price = row.price ?? 0;
  const discountPercent = row.discountPercent ?? 0;
  const priceAfterDiscount = Math.round(
    (price * (100 - discountPercent)) / 100,
  );

  return {
    id: row.id,
    name: row.name,
    sku: row.baseSku,
    image: row.imageObjectKey ? buildMediaUrl(row.imageObjectKey) : null,
    price,
    discountPercent,
    priceAfterDiscount,
    stock: Number(row.stock ?? 0),
  };
}
