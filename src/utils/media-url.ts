import type { Media } from "../models/media.model";

// Trailing slash dibuang sekali di awal supaya tidak menghasilkan URL
// dengan double slash (contoh: "https://cdn.com//products/a.jpg").
const PUBLIC_BASE_URL = (process.env.MEDIA_PUBLIC_BASE_URL || "").replace(
  /\/+$/,
  "",
);

/**
 * Susun URL public dari sebuah objectKey.
 *
 * Tiap segmen path di-encode supaya karakter khusus (spasi, tanda tanya, dsb.)
 * tidak merusak URL. Separator "/" sengaja tidak ikut di-encode agar struktur
 * folder tetap terbaca.
 */
export function buildMediaUrl(objectKey: string): string {
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${PUBLIC_BASE_URL}/${encodedKey}`;
}

/**
 * Bentuk response media: seluruh kolom DB apa adanya, ditambah `url` turunan.
 * Dipakai di SEMUA endpoint yang mengembalikan media, supaya bentuknya seragam.
 */
export function toMediaResponse(row: Media) {
  return { ...row, url: buildMediaUrl(row.objectKey) };
}

/** Versi untuk media yang boleh null (mis. dimension media pada produk). */
export function toMediaResponseNullable(row: Media | null | undefined) {
  return row ? toMediaResponse(row) : null;
}
