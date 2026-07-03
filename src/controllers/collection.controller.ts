import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import type { CollectionService } from "../services/collection.service";

const collectionBody = t.Object({
  name: t.String({ minLength: 1 }),
  // cover_id & hero_id WAJIB saat create/update.
  // Untuk menjadikannya OPSIONAL nanti: bungkus dengan t.Optional(...), contoh:
  //   cover_id: t.Optional(t.String({ minLength: 1 })),
  //   hero_id: t.Optional(t.String({ minLength: 1 })),
  cover_id: t.String({ minLength: 1 }),
  hero_id: t.String({ minLength: 1 }),
  slug: t.String({ minLength: 1 }),
  // status dibatasi hanya "draft" atau "published" (kolom DB tetap varchar).
  status: t.Union([t.Literal("draft"), t.Literal("published")]),
  product_ids: t.Array(t.String({ minLength: 1 })),
});

const listQuery = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(t.String()),
  sort: t.Optional(t.String()),
  order_dir: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const CollectionController = (service: CollectionService) =>
  new Elysia({ prefix: "/collections" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createCollection({
          name: body.name,
          coverId: body.cover_id,
          heroId: body.hero_id,
          slug: body.slug,
          status: body.status,
          productIds: body.product_ids,
        });
        set.status = 201;
        return { data };
      },
      {
        body: collectionBody,
        requirePermission: "collection.create",
        csrf: true,
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listCollections({
          search: query.search,
          status: query.status,
          sort: query.sort,
          orderDir: query.order_dir,
          page,
          limit,
        });
      },
      { query: listQuery },
    )
    .put(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateCollection(params.id, {
          name: body.name,
          coverId: body.cover_id,
          heroId: body.hero_id,
          slug: body.slug,
          status: body.status,
          productIds: body.product_ids,
        });
        return { data };
      },
      {
        params: idParams,
        body: collectionBody,
        requirePermission: "collection.update",
        csrf: true,
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteCollection(params.id);
        return { data: "OK" };
      },
      { params: idParams, requirePermission: "collection.delete", csrf: true },
    );
