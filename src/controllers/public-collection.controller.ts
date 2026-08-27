import { Elysia, t } from "elysia";
import { listEnvelope, publicErrorResponses } from "../models/api-schema";
import { publicCollectionListItemModel } from "../models/public-response.model";
import type { PublicCollectionService } from "../services/public-collection.service";

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

export const PublicCollectionController = (service: PublicCollectionService) =>
  new Elysia({ prefix: "/collections" }).get(
    "/",
    async ({ query }) => {
      return await service.listCollections({
        page: query.page ?? 1,
        limit: query.limit ?? 10,
      });
    },
    {
      query: listQuery,
      response: {
        200: listEnvelope(publicCollectionListItemModel),
        ...publicErrorResponses,
      },
    },
  );
