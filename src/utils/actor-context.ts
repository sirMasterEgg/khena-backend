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
 *
 * Yang disimpan adalah *object holder*, bukan string. Alasannya: `enterWith()`
 * hanya berlaku untuk async context saat ini dan turunannya. Kalau dipanggil
 * dari dalam `resolve()` (context anak), nilainya hilang begitu kontrol kembali
 * ke route handler (context induk). Dengan holder, wadahnya dipasang sekali di
 * awal request lewat hook sinkron, lalu isinya cukup DIMUTASI setelah auth —
 * mutasi terlihat oleh induk karena store menyimpan referensi object.
 */
type ActorHolder = { name: string | null };

const actorStore = new AsyncLocalStorage<ActorHolder>();

/**
 * Pasang wadah actor di awal request.
 *
 * WAJIB dipanggil dari hook SINKRON (`onRequest` tanpa async/await). Begitu
 * hook-nya jadi async, `enterWith` kembali kehilangan nilai di context induk.
 */
export function initActor(): void {
  actorStore.enterWith({ name: null });
}

/**
 * Isi actor setelah auth berhasil. Memutasi wadah yang sudah dipasang
 * {@link initActor}, bukan `enterWith` lagi.
 */
export function setActor(name: string): void {
  const holder = actorStore.getStore();
  if (holder) {
    holder.name = name;
  }
}

/**
 * Jalankan `fn` dengan actor terikat. Berguna untuk konteks di luar request
 * (script/seeder/cron) yang butuh mengisi audit columns.
 */
export function runWithActor<T>(name: string, fn: () => T): T {
  return actorStore.run({ name }, fn);
}

/**
 * Nama actor saat ini, atau `null` bila berjalan di luar request
 * (mis. seeder/job yang tidak mengeset actor).
 */
export function getActor(): string | null {
  return actorStore.getStore()?.name ?? null;
}
