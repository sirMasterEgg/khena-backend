/** Identitas toko untuk header invoice & pengirim di label pengiriman. */
export const COMPANY_INFO = {
  name: "Khena",
  address: "Jl. Contoh No. 1, Bandung, Jawa Barat",
  phone: "+62 800 0000 0000",
  email: "hello@khena.id",
  /** Kode pos gudang asal, harus sama dengan origin di shipping.config.ts. */
  zipCode: "40111",
} as const;
