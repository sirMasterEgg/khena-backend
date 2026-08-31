import { Elysia, t } from "elysia";
import {
  dataEnvelope,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import {
  productSummaryModel,
  publicProductDetailModel,
} from "../models/public-response.model";
import type { PublicProductService } from "../services/public-product.service";

const listQuery = t.Object({
  search: t.Optional(t.String()),
  category: t.Optional(t.String()),
  collection: t.Optional(t.String()),
  sort: t.Optional(t.Union([t.Literal("name"), t.Literal("price")])),
  orderDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const skuParams = t.Object({ sku: t.String({ minLength: 1 }) });

export const PublicProductController = (service: PublicProductService) =>
  new Elysia({ prefix: "/products" })
    .get(
      "/",
      async ({ query }) => {
        return await service.listProducts({
          search: query.search,
          category: query.category,
          collection: query.collection,
          sort: query.sort,
          orderDir: query.orderDir,
          page: query.page ?? 1,
          limit: query.limit ?? 12,
        });
      },
      {
        query: listQuery,
        response: {
          200: listEnvelope(productSummaryModel),
          ...publicErrorResponses,
        },
      },
    )
    .get(
      "/:sku/related",
      async ({ params }) => {
        const data = await service.getRelatedProducts(params.sku);
        return { data };
      },
      {
        params: skuParams,
        response: {
          200: dataEnvelope(t.Array(productSummaryModel)),
          ...publicErrorResponses,
        },
      },
    )
    .get(
      "/:sku",
      async ({ params }) => {
        const data = await service.getProductDetail(params.sku);
        return { data };
      },
      {
        params: skuParams,
        response: {
          200: dataEnvelope(publicProductDetailModel),
          ...publicErrorResponses,
        },
      },
    );
