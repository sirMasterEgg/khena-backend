import { Elysia, t } from "elysia";
import type { CategoryService } from "../services/category.service";

const categoryBody = t.Object({
  room_type_id: t.String({ minLength: 1 }),
  category: t.String({ minLength: 1 }),
  order: t.Integer(),
  status: t.String({ minLength: 1 }),
});

const listQuery = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(t.String()),
  room_type_id: t.Optional(t.String()),
  sort: t.Optional(t.String()),
  order_dir: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const CategoryController = (service: CategoryService) =>
  new Elysia({ prefix: "/categories" })
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createCategory({
          roomTypeId: body.room_type_id,
          category: body.category,
          order: body.order,
          status: body.status,
        });
        set.status = 201;
        return { data };
      },
      { body: categoryBody },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listCategories({
          search: query.search,
          status: query.status,
          roomTypeId: query.room_type_id,
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
        const data = await service.updateCategory(params.id, {
          roomTypeId: body.room_type_id,
          category: body.category,
          order: body.order,
          status: body.status,
        });
        return { data };
      },
      { params: idParams, body: categoryBody },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteCategory(params.id);
        return { data: "OK" };
      },
      { params: idParams },
    );
