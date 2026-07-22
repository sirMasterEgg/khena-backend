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
  productStatsModel,
} from "../models/response.model";
import type { ProductService } from "../services/product.service";

const variantBody = t.Object({
  colorId: t.String({ minLength: 1 }),
  sku: t.String({ minLength: 1 }),
  visibility: t.String({ minLength: 1 }),
  price: t.Number(),
  capitalPrice: t.Number(),
  discountPercent: t.Optional(t.Number()),
  marketplacePrice: t.Optional(t.Number()),
  initialStock: t.Number({ minimum: 0 }),
  images: t.Array(t.String(), { minItems: 1 }),
});

// Dimensi produk & box: ukuran numerik + satu media id (uuid) untuk gambarnya.
const dimensionBody = t.Object({
  width: t.Number(),
  depth: t.Number(),
  height: t.Number(),
  weight: t.Number(),
  image: t.String({ minLength: 1 }),
});

const createProductBody = t.Object({
  productName: t.String({ minLength: 1 }),
  baseSku: t.String({ minLength: 1 }),
  collectionId: t.Optional(t.String({ minLength: 1 })),
  categoryId: t.String({ minLength: 1 }),
  status: t.Union([
    t.Literal("published"),
    t.Literal("draft"),
    t.Literal("scheduled"),
    t.Literal("archived"),
  ]),
  description: t.Optional(t.String({ minLength: 1 })),
  lowStockAlert: t.Optional(t.Number({ minimum: 0 })),
  materialInformation: t.String({ minLength: 1 }),
  careInstructionIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
  productDimension: dimensionBody,
  boxDimension: dimensionBody,
  media: t.Array(t.String(), { minItems: 1 }),
  variant: t.Array(variantBody, { minItems: 1 }),
});

// Update (PATCH): semua field opsional (partial). Field yang tidak dikirim tidak
// diubah. `variant` boleh membawa `id` untuk mencocokkan variant lama; variant
// tanpa `id` diperlakukan sebagai variant baru.
const updateProductBody = t.Partial(
  t.Object({
    ...createProductBody.properties,
    variant: t.Array(
      t.Object({
        id: t.Optional(t.String({ minLength: 1 })),
        ...variantBody.properties,
      }),
      { minItems: 1 },
    ),
  }),
);

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
        const data = await service.createProduct(body);
        set.status = 201;
        return { data };
      },
      {
        body: createProductBody,
        requirePermission: "product.create",
        csrf: true,
        response: { 201: dataEnvelope(productDetailModel), ...errorResponses },
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
      "/stats",
      async () => {
        const data = await service.getProductStats();
        return { data };
      },
      {
        response: {
          200: dataEnvelope(productStatsModel),
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
    .patch(
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
