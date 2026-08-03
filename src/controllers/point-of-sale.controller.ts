import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  posProductVariantModel,
  posTransactionModel,
} from "../models/response.model";
import type { PointOfSaleService } from "../services/point-of-sale.service";

const posItemBody = t.Object({
  detailProductId: t.String({ minLength: 1 }),
  quantity: t.Integer({ minimum: 1 }),
});

const paymentMethodLiteral = t.Union([
  t.Literal("cash"),
  t.Literal("transfer"),
  t.Literal("debit"),
  t.Literal("credit"),
  t.Literal("qris"),
]);

const posTransactionBody = t.Object({
  customerId: t.Optional(t.String({ minLength: 1 })),
  paymentMethod: paymentMethodLiteral,
  items: t.Array(posItemBody, { minItems: 1 }),
});

const variantQuery = t.Object({
  name: t.Optional(t.String()),
  sku: t.Optional(t.String()),
  categoryId: t.Optional(t.String({ minLength: 1 })),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

export const PointOfSaleController = (service: PointOfSaleService) =>
  new Elysia({ prefix: "/point-of-sales" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createTransaction(body);
        set.status = 201;
        return { data };
      },
      {
        body: posTransactionBody,
        requirePermission: "pointOfSale.create",
        csrf: true,
        response: { 201: dataEnvelope(posTransactionModel), ...errorResponses },
      },
    )
    .get(
      "/product-variants",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listProductVariants({
          name: query.name,
          sku: query.sku,
          categoryId: query.categoryId,
          page,
          limit,
        });
      },
      {
        query: variantQuery,
        requirePermission: "pointOfSale.read",
        response: {
          200: listEnvelope(posProductVariantModel),
          ...errorResponses,
        },
      },
    );
