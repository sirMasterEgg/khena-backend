import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import { collectionModel } from "../models/response.model";
import type { CollectionService } from "../services/collection.service";

const collectionBody = t.Object({
  name: t.String({ minLength: 1 }),
  // coverId & heroId WAJIB saat create/update.
  // Untuk menjadikannya OPSIONAL nanti: bungkus dengan t.Optional(...), contoh:
  //   coverId: t.Optional(t.String({ minLength: 1 })),
  //   heroId: t.Optional(t.String({ minLength: 1 })),
  coverId: t.String({ minLength: 1 }),
  heroId: t.String({ minLength: 1 }),
  slug: t.String({ minLength: 1 }),
  // status dibatasi hanya "draft" atau "published" (kolom DB tetap varchar).
  status: t.Union([t.Literal("draft"), t.Literal("published")]),
  productIds: t.Array(t.String({ minLength: 1 })),
});

const listQuery = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(t.String()),
  sort: t.Optional(
    t.Union([t.Literal("name"), t.Literal("slug"), t.Literal("createdAt")]),
  ),
  orderDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
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
        const data = await service.createCollection(body);
        set.status = 201;
        return { data };
      },
      {
        body: collectionBody,
        requirePermission: "collection.create",
        csrf: true,
        response: { 201: dataEnvelope(collectionModel), ...errorResponses },
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
          orderDir: query.orderDir,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        response: {
          200: listEnvelope(collectionModel),
          ...publicErrorResponses,
        },
      },
    )
    .put(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateCollection(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: collectionBody,
        requirePermission: "collection.update",
        csrf: true,
        response: { 200: dataEnvelope(collectionModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteCollection(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "collection.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
