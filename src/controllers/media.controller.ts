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

const uploadBody = t.Object({
  path: t.String(),
  files: t.Array(fileMeta, { minItems: 1 }),
});

const confirmBody = t.Object({
  mediaIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
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
      "/upload",
      async ({ body, set }) => {
        const result = await service.generateUploadUrls(body);
        set.status = 201;
        return { data: result };
      },
      { body: uploadBody },
    )
    .post(
      "/confirm",
      async ({ body }) => {
        const result = await service.confirmUploads(body);
        return { data: result };
      },
      { body: confirmBody },
    )
    .get(
      "/files/:id",
      async ({ params }) => {
        const file = await service.getFile(params.id);
        return { data: file };
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
