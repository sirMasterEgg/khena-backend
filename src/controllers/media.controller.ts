import { Elysia, t } from "elysia";
import type { MediaService } from "../services/media.service";

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
});

const multipartInitBody = t.Object({
  path: t.String(),
  file: fileMeta,
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
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const MediaController = (service: MediaService) =>
  new Elysia({ prefix: "/media" })
    // --- specific routes first (must come before the catch-all GET /*) ---
    .post(
      "/folder",
      async ({ body, set }) => {
        const folder = await service.createFolder(body);
        set.status = 201;
        return { data: folder };
      },
      { body: folderBody },
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
        });
        set.status = 201;
        return { data: result };
      },
      { body: uploadDirectBody },
    )
    .post(
      "/upload-multipart/init",
      async ({ body, set }) => {
        const result = await service.initMultipart(body);
        set.status = 201;
        return { data: result };
      },
      { body: multipartInitBody },
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
      { body: multipartPartBody },
    )
    .post(
      "/upload-multipart/complete",
      async ({ body }) => {
        const result = await service.completeMultipart(body);
        return { data: result };
      },
      { body: multipartCompleteBody },
    )
    .post(
      "/upload-multipart/abort",
      async ({ body }) => {
        const result = await service.abortMultipart(body);
        return { data: result };
      },
      { body: multipartAbortBody },
    )
    .get(
      "/files/:id",
      async ({ params }) => {
        const file = await service.getFile(params.id);
        return { data: file };
      },
      { params: idParams },
    )
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
      { params: idParams, body: updateFileBody },
    )
    .delete(
      "/files/:id",
      async ({ params }) => {
        await service.deleteFile(params.id);
        return { data: "OK" };
      },
      { params: idParams },
    )
    .put(
      "/folder/:id",
      async ({ params, body }) => {
        const folder = await service.updateFolder(params.id, body);
        return { data: folder };
      },
      { params: idParams, body: folderBody },
    )
    .delete(
      "/folder/:id",
      async ({ params }) => {
        await service.deleteFolder(params.id);
        return { data: "OK" };
      },
      { params: idParams },
    )
    // --- browse: catch-all path, registered last ---
    .get("/", async () => {
      const result = await service.browse("/");
      return { data: result };
    })
    .get("/*", async ({ params }) => {
      const wildcard = (params as Record<string, string>)["*"] ?? "";
      const result = await service.browse(wildcard);
      return { data: result };
    });
