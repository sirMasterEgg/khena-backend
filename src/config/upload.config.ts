/**
 * Batas ukuran satu file upload. Dipisah antara upload langsung (dibaca penuh
 * ke memori, jadi harus konservatif) dan multipart (dipecah jadi part, jadi
 * boleh jauh lebih besar).
 */
export const MAX_DIRECT_UPLOAD_BYTES =
  Number(process.env.MAX_DIRECT_UPLOAD_BYTES) || 10 * 1024 * 1024; // 10 MB

export const MAX_MULTIPART_UPLOAD_BYTES =
  Number(process.env.MAX_MULTIPART_UPLOAD_BYTES) || 500 * 1024 * 1024; // 500 MB

/** Format byte jadi teks yang enak dibaca user di pesan error. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
