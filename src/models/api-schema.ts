import { type TSchema, t } from "elysia";

/**
 * Skema bersama untuk envelope response API (lihat contract.md bagian 1).
 * Semua helper di sini dipakai oleh controller untuk memvalidasi `response`.
 */

/** Kolom audit yang melekat di semua record DB (lihat models/audit-columns.ts). */
export const auditColumns = {
  createdAt: t.Date(),
  updatedAt: t.Date(),
  deletedAt: t.Union([t.Date(), t.Null()]),
  createdBy: t.Union([t.String(), t.Null()]),
  updatedBy: t.Union([t.String(), t.Null()]),
  deletedBy: t.Union([t.String(), t.Null()]),
};

/** Bungkus payload sukses: { data: ... } */
export const dataEnvelope = <T extends TSchema>(schema: T) =>
  t.Object({ data: schema });

/** Meta untuk list berpaginasi. */
export const paginationMeta = t.Object({
  page: t.Number(),
  limit: t.Number(),
  total: t.Number(),
  totalPages: t.Number(),
});

/** Bungkus list berpaginasi: { data: [...], meta: {...} } */
export const listEnvelope = <T extends TSchema>(item: T) =>
  t.Object({ data: t.Array(item), meta: paginationMeta });

/**
 * Envelope error standar: { error: { code, message, details } }.
 * `details` dibiarkan `t.Unknown()` — untuk error validasi (422) berisi array
 * detail dari Elysia, selain itu `null` (lihat contract.md bagian 1).
 */
export const errorEnvelope = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Unknown(),
  }),
});

/**
 * Kumpulan status error yang lazim dipakai endpoint yang butuh auth + CSRF.
 * Spread ke dalam opsi `response` tiap route, mis:
 *   response: { 201: dataEnvelope(model), ...errorResponses }
 */
export const errorResponses = {
  400: errorEnvelope,
  401: errorEnvelope,
  403: errorEnvelope,
  422: errorEnvelope,
};

/** Status error untuk endpoint publik (tanpa auth), mis. GET list/detail. */
export const publicErrorResponses = {
  400: errorEnvelope,
  422: errorEnvelope,
};
