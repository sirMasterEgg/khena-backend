import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  orderSalesModel,
  orderSalesProductVariantModel,
  shippingCostModel,
} from "../models/response.model";
import type { OrderSalesService } from "../services/order-sales.service";
import { BadRequestError } from "../utils/errors";

const isoDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const orderItemBody = t.Object({
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

const orderSalesBody = t.Object({
  customerId: t.String({ minLength: 1 }),
  orderDate: isoDate,
  paymentMethod: paymentMethodLiteral,
  shippingAddress: t.String({ minLength: 1 }),
  shippingCity: t.String({ minLength: 1, maxLength: 100 }),
  shippingProvince: t.String({ minLength: 1, maxLength: 100 }),
  shippingZipCode: t.String({ minLength: 1, maxLength: 20 }),
  internalNote: t.Optional(t.String()),
  items: t.Array(orderItemBody, { minItems: 1 }),
});

const shippingCostQuery = t.Object({
  shippingAddress: t.String({ minLength: 1 }),
  shippingCity: t.String({ minLength: 1 }),
  shippingProvince: t.String({ minLength: 1 }),
  shippingZipCode: t.String({ minLength: 1 }),
  /** JSON array string: [{"detailProductId":"...","quantity":2}] */
  items: t.String({ minLength: 1 }),
});

const variantQuery = t.Object({
  name: t.Optional(t.String()),
  sku: t.Optional(t.String()),
  categoryId: t.Optional(t.String({ minLength: 1 })),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

interface RawShippingCostItem {
  detailProductId: string;
  quantity: number;
}

/**
 * `items` di query GET dikirim sebagai JSON string (query GET tidak bisa
 * membawa array of object secara langsung). Parse manual + validasi bentuk
 * tiap elemen di sini supaya error-nya jelas (`invalid items query`),
 * bukan lolos ke service dengan data rusak.
 */
function parseShippingCostItems(raw: string): RawShippingCostItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestError("invalid items query");
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestError("invalid items query");
  }
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).detailProductId !== "string" ||
      (item as Record<string, unknown>).detailProductId === "" ||
      !Number.isInteger((item as Record<string, unknown>).quantity) ||
      ((item as Record<string, unknown>).quantity as number) < 1
    ) {
      throw new BadRequestError("invalid items query");
    }
  }
  return parsed as RawShippingCostItem[];
}

export const OrderSalesController = (service: OrderSalesService) =>
  new Elysia({ prefix: "/order-sales" })
    .use(authPlugin)
    .use(csrfPlugin)
    .get(
      "/shipping-cost",
      async ({ query }) => {
        const items = parseShippingCostItems(query.items);
        const data = await service.getShippingCost({
          shippingAddress: query.shippingAddress,
          shippingCity: query.shippingCity,
          shippingProvince: query.shippingProvince,
          shippingZipCode: query.shippingZipCode,
          items,
        });
        return { data };
      },
      {
        query: shippingCostQuery,
        requirePermission: "orderSales.read",
        response: {
          200: dataEnvelope(shippingCostModel),
          502: errorEnvelope,
          ...errorResponses,
        },
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
        requirePermission: "orderSales.read",
        response: {
          200: listEnvelope(orderSalesProductVariantModel),
          ...errorResponses,
        },
      },
    )
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createOrder(body);
        set.status = 201;
        return { data };
      },
      {
        body: orderSalesBody,
        requirePermission: "orderSales.create",
        csrf: true,
        response: {
          201: dataEnvelope(orderSalesModel),
          502: errorEnvelope,
          ...errorResponses,
        },
      },
    );
