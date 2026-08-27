import { Elysia, t } from "elysia";
import { listEnvelope, publicErrorResponses } from "../models/api-schema";
import { publicRoomTypeWithCategoriesModel } from "../models/public-response.model";
import type { PublicCategoryService } from "../services/public-category.service";

const listQuery = t.Object({
  roomType: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

export const PublicCategoryController = (service: PublicCategoryService) =>
  new Elysia({ prefix: "/categories" }).get(
    "/",
    async ({ query }) => {
      return await service.listCategories({
        roomType: query.roomType,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
      });
    },
    {
      query: listQuery,
      response: {
        200: listEnvelope(publicRoomTypeWithCategoriesModel),
        ...publicErrorResponses,
      },
    },
  );
