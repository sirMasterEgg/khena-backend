import { ConflictError } from "./errors";

/** Batas percobaan sufiks angka sebelum menyerah — mencegah infinite loop. */
const MAX_SLUG_ATTEMPTS = 100;

// Rentang unicode combining diacritical marks (hasil `normalize("NFKD")`
// memisahkan huruf beraksen jadi huruf dasar + tanda ini). Dibuang supaya
// "Café" -> "cafe", bukan "cafe%CC%81".
const COMBINING_MARKS_REGEX = /[̀-ͯ]/g;

/**
 * Ubah teks bebas jadi slug URL-safe: "Ruang Tamu / Sofa" → "ruang-tamu-sofa".
 *
 * Dipotong maksimal 200 karakter (kolom `varchar(255)`, sisakan ruang untuk
 * sufiks angka dari `generateUniqueSlug`). Input yang tidak menyisakan
 * karakter valid sama sekali (mis. semua emoji) jatuh ke fallback "item".
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    .replace(/-+$/g, "");

  return slug || "item";
}

/**
 * Cari slug unik. `isTaken` mengembalikan true kalau slug sudah dipakai baris
 * lain (lihat repository masing-masing, mis. `CategoryRepository.slugExists`).
 *
 * Baris pertama memakai slug polos (tanpa angka); bentrokan berikutnya diberi
 * sufiks `-2`, `-3`, dst — konvensi umum (WordPress/Rails) yang menghindari
 * slug jelek untuk data yang tidak pernah bentrok.
 */
export async function generateUniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);

  if (!(await isTaken(base))) {
    return base;
  }

  for (let attempt = 2; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = `${base}-${attempt}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  throw new ConflictError("failed to generate unique slug");
}
