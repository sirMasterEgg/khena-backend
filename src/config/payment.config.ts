/**
 * Konfigurasi payment gateway (Midtrans). Mengikuti gaya shipping.config.ts:
 * kredensial & base URL dari ENV, sisanya konstanta karena sama di semua environment.
 */

export const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || "";
export const MIDTRANS_IS_PRODUCTION =
  process.env.MIDTRANS_IS_PRODUCTION === "true";
export const MIDTRANS_SNAP_BASE_URL = MIDTRANS_IS_PRODUCTION
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";

/** Batas waktu bayar (menit) yang dikirim ke Snap lewat `expiry`. */
export const PAYMENT_EXPIRY_MINUTES = 60 * 24;

/** Timeout panggilan API Midtrans (ms). */
export const MIDTRANS_REQUEST_TIMEOUT_MS = 10_000;

/**
 * URL redirect setelah customer selesai bayar di halaman Snap (dikirim lewat
 * `callbacks.finish`, BUKAN URL webhook notifikasi — itu diatur di Dashboard
 * Midtrans, bukan di sini). Beda per environment (dev/staging/prod), jadi
 * dari ENV. Kosong = pakai default dari Dashboard Midtrans, `callbacks`
 * tidak dikirim sama sekali.
 */
export const MIDTRANS_FINISH_REDIRECT_URL =
  process.env.MIDTRANS_FINISH_REDIRECT_URL || "";
