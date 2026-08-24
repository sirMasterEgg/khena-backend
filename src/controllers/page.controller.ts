import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import { pageModel } from "../models/response.model";
import type { PageService } from "../services/page.service";

const MAX_PAGE_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const pageBody = t.Object({
  page: t.String({ minLength: 1, maxLength: 50 }),
  section: t.String({ minLength: 1, maxLength: 50 }),
  // JSON dikirim sebagai string karena body-nya multipart/form-data —
  // parsing & validasinya dilakukan di service.
  data: t.String({ minLength: 1 }),
  status: t.Union([t.Literal("draft"), t.Literal("published")]),
  files: t.Optional(t.Files({ maxSize: MAX_PAGE_IMAGE_BYTES })),
  // Sejajar per index dengan `files`. Kalau kirim 1 field saja, Elysia
  // memberikan string (bukan array) — makanya bentuknya Union.
  fileKeys: t.Optional(t.Union([t.String(), t.Array(t.String())])),
});

// Update (PATCH): semua field opsional. Field yang tidak dikirim tidak diubah.
const updatePageBody = t.Partial(pageBody);

const listQuery = t.Object({
  // `page` di sini berarti NAMA halaman (mis. "home"), BUKAN nomor pagination —
  // endpoint ini sengaja tidak berpaginasi, sama seperti GET /api/pages publik.
  page: t.Optional(t.String()),
  section: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal("draft"), t.Literal("published")])),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

function normalizeFiles(files: File | File[] | undefined): File[] {
  if (!files) {
    return [];
  }
  return Array.isArray(files) ? files : [files];
}

function normalizeFileKeys(fileKeys: string | string[] | undefined): string[] {
  if (!fileKeys) {
    return [];
  }
  return Array.isArray(fileKeys) ? fileKeys : [fileKeys];
}

async function toPageFiles(files: File[]) {
  return await Promise.all(
    files.map(async (f) => ({
      // File 0 byte kehilangan filename saat di-parse Bun (jadi Blob biasa
      // tanpa `name`), padahal nama itu yang dipakai di pesan error.
      name: f.name || "(unnamed)",
      type: f.type,
      body: Buffer.from(await f.arrayBuffer()),
    })),
  );
}

// Catatan sengaja menyimpang dari pola repo: di modul lain (mis. collection),
// route GET dibiarkan tanpa requirePermission. Di sini GET diberi page.read
// karena list admin ikut mengembalikan section berstatus draft — konten yang
// belum boleh dilihat publik.
export const PageController = (service: PageService) =>
  new Elysia({ prefix: "/pages" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const files = normalizeFiles(body.files);
        const fileKeys = normalizeFileKeys(body.fileKeys);
        const data = await service.createPage({
          page: body.page,
          section: body.section,
          data: body.data,
          status: body.status,
          files: await toPageFiles(files),
          fileKeys,
        });
        set.status = 201;
        return { data };
      },
      {
        body: pageBody,
        requirePermission: "page.create",
        csrf: true,
        response: { 201: dataEnvelope(pageModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const data = await service.listPages({
          page: query.page,
          section: query.section,
          status: query.status,
        });
        return { data };
      },
      {
        query: listQuery,
        requirePermission: "page.read",
        response: { 200: dataEnvelope(t.Array(pageModel)), ...errorResponses },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getPage(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "page.read",
        response: { 200: dataEnvelope(pageModel), ...errorResponses },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const files = normalizeFiles(body.files);
        const fileKeys = normalizeFileKeys(body.fileKeys);
        const data = await service.updatePage(params.id, {
          page: body.page,
          section: body.section,
          data: body.data,
          status: body.status,
          files: await toPageFiles(files),
          fileKeys,
        });
        return { data };
      },
      {
        params: idParams,
        body: updatePageBody,
        requirePermission: "page.update",
        csrf: true,
        response: { 200: dataEnvelope(pageModel), ...errorResponses },
      },
    );
