/**
 * Konfigurasi pengiriman. Hanya kredensial & base URL yang datang dari ENV;
 * sisanya konstanta di sini karena sama di semua environment.
 *
 * CATATAN: nilai-nilai di bawah `BITESHIP_BASE_URL` direncanakan pindah ke
 * database (setting yang bisa diubah admin) di iterasi berikutnya. Karena itu
 * semuanya dikumpulkan di file ini — jangan sebar literalnya ke service/controller.
 */

export const BITESHIP_API_KEY = process.env.BITESHIP_API_KEY || "";
export const BITESHIP_BASE_URL =
  process.env.BITESHIP_BASE_URL || "https://api.biteship.com";

/** Kode pos gudang/alamat asal pengiriman. */
export const SHIPPING_ORIGIN_POSTAL_CODE = "40111"; // TODO: konfirmasi kode pos gudang asli

/** Kurir yang dicek tarifnya, dipisah koma sesuai format payload Biteship. */
export const SHIPPING_COURIERS = "jne,jnt,sicepat";

/** Berat per unit (kg) yang dipakai bila produk belum punya data berat. */
export const SHIPPING_FALLBACK_WEIGHT_KG = 5;

/** Timeout panggilan API ongkir (ms). */
export const SHIPPING_REQUEST_TIMEOUT_MS = 10_000;
