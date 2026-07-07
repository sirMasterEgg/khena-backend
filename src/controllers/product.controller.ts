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
  productDetailModel,
  productListItemModel,
} from "../models/response.model";
import type { ProductService } from "../services/product.service";

const variantBody = t.Object({
  colorId: t.String({ minLength: 1 }),
  sku: t.String({ minLength: 1 }),
  price: t.Number(),
  discountPercent: t.Optional(t.Number()),
  capitalPrice: t.Number(),
  marketplacePrice: t.Number(),
  visibility: t.String({ minLength: 1 }),
  variantMedia: t.Array(t.String(), { minItems: 1 }),
});

const createProductBody = t.Object({
  productName: t.String({ minLength: 1 }),
  sku: t.String({ minLength: 1 }),
  collectionId: t.String({ minLength: 1 }),
  categoryId: t.String({ minLength: 1 }),
  description: t.String({ minLength: 1 }),
  material: t.String({ minLength: 1 }),
  careInstructions: t.Array(t.String(), { minItems: 1 }),
  productDimension: t.String({ minLength: 1 }),
  boxDimensions: t.String({ minLength: 1 }),
  media: t.Array(t.String(), { minItems: 1 }),
  status: t.String({ minLength: 1 }),
  variant: t.Array(variantBody, { minItems: 1 }),
});

// Update: body sama dengan create, hanya variant boleh membawa `id` (untuk
// mencocokkan variant lama). Variant tanpa `id` diperlakukan sebagai variant baru.
const updateProductBody = t.Object({
  ...createProductBody.properties,
  variant: t.Array(
    t.Object({
      id: t.Optional(t.String({ minLength: 1 })),
      ...variantBody.properties,
    }),
    { minItems: 1 },
  ),
});

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
  search: t.Optional(t.String()),
  categoryId: t.Optional(t.String()),
  status: t.Optional(t.String()),
  sort: t.Optional(
    t.Union([t.Literal("name"), t.Literal("createdAt"), t.Literal("status")]),
  ),
  order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const ProductController = (service: ProductService) =>
  new Elysia({ prefix: "/products" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        await service.createProduct(body);
        set.status = 201;
        return { data: "OK" };
      },
      {
        body: createProductBody,
        requirePermission: "product.create",
        csrf: true,
        response: { 201: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        return await service.listProducts({
          page: query.page ?? 1,
          limit: query.limit ?? 10,
          search: query.search,
          categoryId: query.categoryId,
          status: query.status,
          sort: query.sort ?? "createdAt",
          order: query.order ?? "desc",
        });
      },
      {
        query: listQuery,
        response: {
          200: listEnvelope(productListItemModel),
          ...publicErrorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getProductDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        response: {
          200: dataEnvelope(productDetailModel),
          ...publicErrorResponses,
        },
      },
    )
    .put(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateProduct(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateProductBody,
        requirePermission: "product.update",
        csrf: true,
        response: { 200: dataEnvelope(productDetailModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteProduct(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "product.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
