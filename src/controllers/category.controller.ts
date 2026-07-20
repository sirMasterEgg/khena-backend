import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import {
  categoryDetailModel,
  categoryModel,
  categoryStatsModel,
} from "../models/response.model";
import type { CategoryService } from "../services/category.service";

const categoryBody = t.Object({
  roomTypeId: t.String({ minLength: 1 }),
  category: t.String({ minLength: 1 }),
  order: t.Integer(),
  status: t.String({ minLength: 1 }),
});

const listQuery = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(t.String()),
  roomTypeId: t.Optional(t.String()),
  sort: t.Optional(
    t.Union([
      t.Literal("name"),
      t.Literal("displayOrder"),
      t.Literal("roomType"),
      t.Literal("createdAt"),
    ]),
  ),
  orderDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const CategoryController = (service: CategoryService) =>
  new Elysia({ prefix: "/categories" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createCategory(body);
        set.status = 201;
        return { data };
      },
      {
        body: categoryBody,
        requirePermission: "category.create",
        csrf: true,
        response: { 201: dataEnvelope(categoryModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listCategories({
          search: query.search,
          status: query.status,
          roomTypeId: query.roomTypeId,
          sort: query.sort,
          orderDir: query.orderDir,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        response: { 200: listEnvelope(categoryModel), ...publicErrorResponses },
      },
    )
    .get(
      "/stats",
      async () => {
        const data = await service.getCategoryStats();
        return { data };
      },
      {
        response: {
          200: dataEnvelope(categoryStatsModel),
          ...publicErrorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getCategoryDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        response: {
          200: dataEnvelope(categoryDetailModel),
          ...publicErrorResponses,
        },
      },
    )
    .put(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateCategory(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: categoryBody,
        requirePermission: "category.update",
        csrf: true,
        response: { 200: dataEnvelope(categoryModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteCategory(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "category.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
