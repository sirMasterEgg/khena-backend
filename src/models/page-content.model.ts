import type { Page } from "./page.model";

/**
 * Bentuk kolom `data` tabel `pages`, per kombinasi page + section.
 *
 * Kolom DB-nya tetap `jsonb` bebas dan controller tetap tidak memvalidasinya
 * (lihat catatan di `page.model.ts` dan `pageModel`) — tipe di sini adalah
 * kontrak antara admin CMS dan storefront, bukan skema runtime. Semua bentuk
 * di bawah diturunkan dari isi tabel yang sudah ada, jadi field yang di data
 * contoh berisi string kosong ("") tetap ditulis wajib: yang opsional adalah
 * *isinya*, bukan keberadaan key-nya.
 *
 * Setiap `updatedAt` di dalam `data` adalah tanggal ISO "YYYY-MM-DD" yang
 * diisi admin, terpisah dari `updatedAt` milik baris `pages` itu sendiri.
 */

/** URL gambar hasil upload (`@file:<key>` yang sudah diganti service). */
type MediaUrl = string;

/** Status publikasi, sama dengan kolom `status` pada tabel `pages`. */
export type PageStatus = "draft" | "published";

/* ── Section tanya-jawab: faq, care, shipping, returns ────────────────── */

/** Satu pasang tanya-jawab. `category` boleh "" kalau tidak dikelompokkan. */
export interface QnaItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  updatedAt: string;
}

export interface QnaSectionData {
  items: QnaItem[];
}

/* ── assembly / manuals ───────────────────────────────────────────────── */

/**
 * Satu manual PDF. `fileSize` sudah berupa teks siap tampil ("700 KB"),
 * bukan angka byte. `productSku` boleh "" kalau manual belum ditautkan ke
 * SKU tertentu.
 */
export interface AssemblyManual {
  id: string;
  fileUrl: MediaUrl;
  fileName: string;
  fileSize: string;
  productSku: string;
  productName: string;
  updatedAt: string;
}

export interface AssemblyManualsData {
  manuals: AssemblyManual[];
}

/* ── contract / projects ──────────────────────────────────────────────── */

/**
 * Satu proyek contract. `status` di sini milik proyek — menentukan tampil
 * atau tidaknya item ini di dalam section, terpisah dari status baris `pages`.
 */
export interface ContractProject {
  id: string;
  field: string;
  description: string;
  status: PageStatus;
  updatedAt: string;
}

export interface ContractProjectsData {
  projects: ContractProject[];
}

/* ── home ─────────────────────────────────────────────────────────────── */

/** Hero atas maupun bawah; bentuknya identik. */
export interface HeroSectionData {
  eyebrow: string;
  headline: string;
  image: MediaUrl;
  ctaLabel: string;
  ctaHref: string;
}

export interface CraftmanshipSlide {
  title: string;
  body: string;
  image: MediaUrl;
}

/** Slider craftmanship. `intervalMs` = jeda auto-play antar slide. */
export interface CraftmanshipSectionData {
  eyebrow: string;
  slides: CraftmanshipSlide[];
  intervalMs: number;
  ctaLabel: string;
  ctaHref: string;
}

/** Gambar dengan alt text — dipakai section yang butuh teks alternatif. */
export interface PageImage {
  url: MediaUrl;
  alt: string;
}

export interface SignatureCollectionData {
  title: string;
  image: PageImage;
}

/** Hanya menyimpan referensi; detail produk diambil frontend lewat API produk. */
export interface DesignedForLifeData {
  productIds: string[];
}

/* ── Peta page → section → bentuk data ────────────────────────────────── */

export interface PageContentMap {
  home: {
    mainHero: HeroSectionData;
    bottomHero: HeroSectionData;
    craftmanship: CraftmanshipSectionData;
    signatureCollection: SignatureCollectionData;
    designedForLife: DesignedForLifeData;
  };
  faq: { items: QnaSectionData };
  care: { items: QnaSectionData };
  shipping: { items: QnaSectionData };
  returns: { items: QnaSectionData };
  assembly: { manuals: AssemblyManualsData };
  contract: { projects: ContractProjectsData };
}

export type PageName = keyof PageContentMap;

export type PageSectionName<P extends PageName = PageName> =
  keyof PageContentMap[P] & string;

export type PageContent<
  P extends PageName,
  S extends PageSectionName<P>,
> = PageContentMap[P][S];

/** Gabungan semua bentuk `data` yang dikenal. */
export type AnyPageContent = {
  [P in PageName]: PageContentMap[P][keyof PageContentMap[P]];
}[PageName];

/**
 * Baris `pages` yang sudah dipersempit ke satu kombinasi page + section,
 * mis. `TypedPage<"home", "mainHero">`. Berguna di sisi konsumen setelah
 * baris dari repository dipastikan page/section-nya.
 */
export type TypedPage<P extends PageName, S extends PageSectionName<P>> = Omit<
  Page,
  "page" | "section" | "data"
> & {
  page: P;
  section: S;
  data: PageContent<P, S>;
};
