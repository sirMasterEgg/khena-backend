import { getActor } from "./actor-context";

/**
 * Helper stamping audit columns terpusat. Nilai actor diambil dari
 * AsyncLocalStorage (lihat {@link getActor}), jadi service/repository tidak
 * perlu lagi meneruskan `actorName` manual.
 *
 * Nilai eksplisit di `data` selalu menang (spread `...data` di akhir), sehingga
 * pemanggil masih bisa override bila perlu.
 */

/** Isi `createdBy` dari actor saat ini untuk satu row insert. */
export function stampCreate<T extends object>(
  data: T,
): T & { createdBy: string | null } {
  return { createdBy: getActor(), ...data };
}

/** Isi `updatedAt` + `updatedBy` dari actor saat ini untuk satu row update. */
export function stampUpdate<T extends object>(
  data: T,
): T & { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: getActor(), ...data };
}

/** Audit fields untuk soft delete oleh actor saat ini. */
export function stampDelete(): { deletedAt: Date; deletedBy: string | null } {
  return { deletedAt: new Date(), deletedBy: getActor() };
}
