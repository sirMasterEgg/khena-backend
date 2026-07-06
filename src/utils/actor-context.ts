import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request actor name (administrator) used to fill audit columns.
 *
 * Disimpan di AsyncLocalStorage sehingga otomatis ikut ke seluruh async chain
 * dalam satu request — termasuk ke dalam transaksi & cascade — tanpa perlu
 * threading `actorName` manual lewat setiap service/repository.
 *
 * Ini BUKAN state global yang di-share antar request: tiap request punya
 * async context sendiri, jadi nilainya terisolasi per request.
 */
const actorStore = new AsyncLocalStorage<string>();

/**
 * Set actor untuk sisa async context saat ini (dipanggil sekali di auth plugin).
 */
export function setActor(name: string): void {
  actorStore.enterWith(name);
}

/**
 * Jalankan `fn` dengan actor terikat. Berguna untuk konteks di luar request
 * (script/seeder/cron) yang butuh mengisi audit columns.
 */
export function runWithActor<T>(name: string, fn: () => T): T {
  return actorStore.run(name, fn);
}

/**
 * Nama actor saat ini, atau `null` bila berjalan di luar request
 * (mis. seeder/job yang tidak mengeset actor).
 */
export function getActor(): string | null {
  return actorStore.getStore() ?? null;
}
