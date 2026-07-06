import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  publicErrorResponses,
} from "../models/api-schema";
import {
  folderModel,
  mediaCategoryModel,
  mediaModel,
} from "../models/response.model";
import type { MediaService } from "../services/media.service";

// --- Response models untuk bentuk data khusus (bukan entitas DB langsung) ---
const uploadDirectResult = t.Array(
  t.Object({
    mediaId: t.String(),
    fileName: t.String(),
    objectKey: t.String(),
  }),
);

const multipartInitResult = t.Object({
  mediaId: t.String(),
  uploadId: t.String(),
  objectKey: t.String(),
  partSize: t.Number(),
  partCount: t.Number(),
});

const multipartPartResult = t.Object({
  partNumber: t.Number(),
  eTag: t.String(),
});

const successResult = t.Object({ success: t.Boolean() });

const browseResult = t.Object({
  path: t.String(),
  folders: t.Array(folderModel),
  files: t.Array(mediaModel),
});

const folderBody = t.Object({
  path: t.String(),
  folderName: t.String({ minLength: 1 }),
});

const fileMeta = t.Object({
  name: t.String({ minLength: 1 }),
  type: t.String({ minLength: 1 }),
  size: t.Number({ minimum: 0 }),
});

const uploadDirectBody = t.Object({
  path: t.String(),
  files: t.Files(),
  mediaCategoryId: t.Optional(t.String({ minLength: 1 })),
});

const multipartInitBody = t.Object({
  path: t.String(),
  file: fileMeta,
  mediaCategoryId: t.Optional(t.String({ minLength: 1 })),
});

const browseQuery = t.Object({
  search: t.Optional(t.String()),
  mediaCategoryId: t.Optional(t.String()),
  type: t.Optional(
    t.Union([
      t.Literal("image"),
      t.Literal("video"),
      t.Literal("audio"),
      t.Literal("document"),
    ]),
  ),
  sort: t.Optional(
    t.Union([
      t.Literal("name"),
      t.Literal("createdAt"),
      t.Literal("sizeBytes"),
    ]),
  ),
  order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

const multipartPartBody = t.Object({
  mediaId: t.String({ minLength: 1 }),
  uploadId: t.String({ minLength: 1 }),
  partNumber: t.Numeric({ minimum: 1 }),
  chunk: t.File(),
});

const multipartCompleteBody = t.Object({
  mediaId: t.String({ minLength: 1 }),
  uploadId: t.String({ minLength: 1 }),
  parts: t.Array(
    t.Object({
      partNumber: t.Number({ minimum: 1 }),
      eTag: t.String({ minLength: 1 }),
    }),
    { minItems: 1 },
  ),
});

const multipartAbortBody = t.Object({
  mediaId: t.String({ minLength: 1 }),
  uploadId: t.String({ minLength: 1 }),
});

const updateFileBody = t.Object({
  path: t.String(),
  file: fileMeta,
  // null = lepas kategori, string = ganti, absen = jangan sentuh.
  mediaCategoryId: t.Optional(t.Union([t.String({ minLength: 1 }), t.Null()])),
});

const objectKeyBody = t.Object({ objectKey: t.String({ minLength: 1 }) });

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const MediaController = (service: MediaService) =>
  new Elysia({ prefix: "/media" })
    .use(authPlugin)
    .use(csrfPlugin)
    // --- specific routes first (must come before the catch-all GET /*) ---
    .post(
      "/folder",
      async ({ body, set }) => {
        const folder = await service.createFolder(body);
        set.status = 201;
        return { data: folder };
      },
      {
        body: folderBody,
        requirePermission: "media.create",
        csrf: true,
        response: { 201: dataEnvelope(folderModel), ...errorResponses },
      },
    )
    .post(
      "/upload-direct",
      async ({ body, set }) => {
        const files = Array.isArray(body.files) ? body.files : [body.files];
        const payload = await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            type: f.type,
            body: Buffer.from(await f.arrayBuffer()),
          })),
        );
        const result = await service.uploadDirect({
          path: body.path,
          files: payload,
          mediaCategoryId: body.mediaCategoryId,
        });
        set.status = 201;
        return { data: result };
      },
      {
        body: uploadDirectBody,
        requirePermission: "media.create",
        csrf: true,
        response: { 201: dataEnvelope(uploadDirectResult), ...errorResponses },
      },
    )
    .post(
      "/upload-multipart/init",
      async ({ body, set }) => {
        const result = await service.initMultipart(body);
        set.status = 201;
        return { data: result };
      },
      {
        body: multipartInitBody,
        requirePermission: "media.create",
        csrf: true,
        response: {
          201: dataEnvelope(multipartInitResult),
          ...errorResponses,
        },
      },
    )
    .post(
      "/upload-multipart/part",
      async ({ body }) => {
        const result = await service.uploadMultipartPart({
          mediaId: body.mediaId,
          uploadId: body.uploadId,
          partNumber: body.partNumber,
          body: Buffer.from(await body.chunk.arrayBuffer()),
        });
        return { data: result };
      },
      {
        body: multipartPartBody,
        requirePermission: "media.create",
        csrf: true,
        response: {
          200: dataEnvelope(multipartPartResult),
          ...errorResponses,
        },
      },
    )
    .post(
      "/upload-multipart/complete",
      async ({ body }) => {
        const result = await service.completeMultipart(body);
        return { data: result };
      },
      {
        body: multipartCompleteBody,
        requirePermission: "media.create",
        csrf: true,
        response: { 200: dataEnvelope(mediaModel), ...errorResponses },
      },
    )
    .post(
      "/upload-multipart/abort",
      async ({ body }) => {
        const result = await service.abortMultipart(body);
        return { data: result };
      },
      {
        body: multipartAbortBody,
        requirePermission: "media.create",
        csrf: true,
        response: { 200: dataEnvelope(successResult), ...errorResponses },
      },
    )
    .get(
      "/files/:id",
      async ({ params }) => {
        const file = await service.getFile(params.id);
        return { data: file };
      },
      {
        params: idParams,
        response: { 200: dataEnvelope(mediaModel), ...publicErrorResponses },
      },
    )
    // Response biner (bukan JSON) → tidak dipasang skema response.
    .get(
      "/files/:id/download",
      async ({ params }) => {
        const file = await service.downloadFile(params.id);
        return new Response(file.body, {
          headers: {
            "content-type": file.contentType,
            "content-disposition": `attachment; filename="${file.fileName}"`,
          },
        });
      },
      { params: idParams },
    )
    .put(
      "/files/:id",
      async ({ params, body }) => {
        const file = await service.updateFile(params.id, body);
        return { data: file };
      },
      {
        params: idParams,
        body: updateFileBody,
        requirePermission: "media.update",
        csrf: true,
        response: { 200: dataEnvelope(mediaModel), ...errorResponses },
      },
    )
    .patch(
      "/files/:id/object-key",
      async ({ params, body }) => {
        const file = await service.updateObjectKey(params.id, body.objectKey);
        return { data: file };
      },
      {
        params: idParams,
        body: objectKeyBody,
        requirePermission: "media.update",
        csrf: true,
        response: { 200: dataEnvelope(mediaModel), ...errorResponses },
      },
    )
    .delete(
      "/files/:id",
      async ({ params }) => {
        await service.deleteFile(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "media.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    )
    .put(
      "/folder/:id",
      async ({ params, body }) => {
        const folder = await service.updateFolder(params.id, body);
        return { data: folder };
      },
      {
        params: idParams,
        body: folderBody,
        requirePermission: "media.update",
        csrf: true,
        response: { 200: dataEnvelope(folderModel), ...errorResponses },
      },
    )
    .delete(
      "/folder/:id",
      async ({ params }) => {
        await service.deleteFolder(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "media.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    )
    // Daftar kategori — HARUS didaftarkan sebelum catch-all GET /* agar
    // "categories" tidak dianggap path folder.
    .get(
      "/categories",
      async () => {
        const categories = await service.listCategories();
        return { data: categories };
      },
      {
        response: {
          200: dataEnvelope(t.Array(mediaCategoryModel)),
          ...publicErrorResponses,
        },
      },
    )
    // --- browse: catch-all path, registered last ---
    .get(
      "/",
      async ({ query }) => {
        const result = await service.browse("/", {
          search: query.search,
          mediaCategoryId: query.mediaCategoryId,
          type: query.type,
          sort: query.sort ?? "createdAt",
          order: query.order ?? "desc",
        });
        return { data: result };
      },
      {
        query: browseQuery,
        response: { 200: dataEnvelope(browseResult), ...publicErrorResponses },
      },
    )
    .get(
      "/*",
      async ({ params, query }) => {
        const wildcard = (params as Record<string, string>)["*"] ?? "";
        const result = await service.browse(wildcard, {
          search: query.search,
          mediaCategoryId: query.mediaCategoryId,
          type: query.type,
          sort: query.sort ?? "createdAt",
          order: query.order ?? "desc",
        });
        return { data: result };
      },
      {
        query: browseQuery,
        response: { 200: dataEnvelope(browseResult), ...publicErrorResponses },
      },
    );
