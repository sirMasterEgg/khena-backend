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
  orderSalesDetailModel,
  orderSalesInvoiceModel,
  orderSalesListItemModel,
  orderSalesModel,
  orderSalesPackedItemModel,
  orderSalesProductVariantModel,
  orderSalesShippingLabelModel,
  orderSalesStatsModel,
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

const timeSlotLiteral = t.Union([
  t.Literal("morning"),
  t.Literal("afternoon"),
  t.Literal("evening"),
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
  deliveryDate: t.Optional(isoDate),
  deliveryTimeSlot: t.Optional(timeSlotLiteral),
  deliveryNotes: t.Optional(t.String()),
});

// Nilai yang boleh DISIMPAN di kolom status.
const orderStatusLiteral = t.Union([
  t.Literal("pending"),
  t.Literal("processing"),
  t.Literal("shipped"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

// Nilai yang boleh dipakai MEMFILTER list — termasuk nilai turunan.
const orderStatusFilterLiteral = t.Union([
  t.Literal("awaiting_fulfillment"),
  t.Literal("pending"),
  t.Literal("processing"),
  t.Literal("shipped"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

const orderListQuery = t.Object({
  search: t.Optional(t.String()),
  sort: t.Optional(
    t.Union([t.Literal("newest"), t.Literal("oldest"), t.Literal("total")]),
  ),
  status: t.Optional(orderStatusFilterLiteral),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

const markAsPackedBody = t.Object({
  itemId: t.String({ minLength: 1 }),
  // Default true. Kirim false untuk membatalkan tanda packed.
  isPacked: t.Optional(t.Boolean()),
});

const updateOrderDetailsBody = t.Partial(
  t.Object({
    deliveryDate: isoDate,
    deliveryTimeSlot: timeSlotLiteral,
    deliveryNotes: t.String(),
    internalNote: t.String(),
  }),
);

const updateStatusBody = t.Object({
  status: orderStatusLiteral,
  // Wajib diisi (validasi di service) ketika status = "shipped".
  trackingNumber: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

// ids dikirim sebagai string dipisah koma: ?ids=uuid1,uuid2
const idsQuery = t.Object({ ids: t.String({ minLength: 1 }) });

/** ?ids=uuid1,uuid2 → ["uuid1", "uuid2"], buang segmen kosong. */
function parseIdsQuery(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
    .get(
      "/stats",
      async () => {
        const data = await service.getStats();
        return { data };
      },
      {
        requirePermission: "orderSales.read",
        response: {
          200: dataEnvelope(orderSalesStatsModel),
          ...errorResponses,
        },
      },
    )
    // Registrasi sebelum "/:id" supaya "bulk" tidak tertangkap param id.
    .get(
      "/bulk",
      async ({ query }) => {
        const csv = await service.exportOrdersCsv({
          search: query.search,
          sort: query.sort,
          status: query.status,
        });
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="orders-${Date.now()}.csv"`,
          },
        });
      },
      {
        query: orderListQuery,
        requirePermission: "orderSales.read",
        // Respons teks/biner (bukan JSON) → JANGAN pasang skema `response`.
      },
    )
    .get(
      "/invoice",
      async ({ query }) => {
        const ids = parseIdsQuery(query.ids);
        const data = await service.getInvoices(ids);
        return { data };
      },
      {
        query: idsQuery,
        requirePermission: "orderSales.read",
        response: {
          200: dataEnvelope(t.Array(orderSalesInvoiceModel)),
          ...errorResponses,
        },
      },
    )
    .get(
      "/shipping-label",
      async ({ query }) => {
        const ids = parseIdsQuery(query.ids);
        const data = await service.getShippingLabels(ids);
        return { data };
      },
      {
        query: idsQuery,
        requirePermission: "orderSales.read",
        response: {
          200: dataEnvelope(t.Array(orderSalesShippingLabelModel)),
          ...errorResponses,
        },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listOrders({
          search: query.search,
          sort: query.sort,
          status: query.status,
          page,
          limit,
        });
      },
      {
        query: orderListQuery,
        requirePermission: "orderSales.read",
        response: {
          200: listEnvelope(orderSalesListItemModel),
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
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getOrderDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "orderSales.read",
        response: {
          200: dataEnvelope(orderSalesDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateOrderDetails(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateOrderDetailsBody,
        requirePermission: "orderSales.update",
        csrf: true,
        response: {
          200: dataEnvelope(orderSalesDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id/mark-as-packed",
      async ({ params, body }) => {
        const data = await service.markItemAsPacked(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: markAsPackedBody,
        requirePermission: "orderSales.update",
        csrf: true,
        response: {
          200: dataEnvelope(orderSalesPackedItemModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id/status",
      async ({ params, body }) => {
        const data = await service.updateStatus(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateStatusBody,
        requirePermission: "orderSales.update",
        csrf: true,
        response: {
          200: dataEnvelope(orderSalesDetailModel),
          ...errorResponses,
        },
      },
    );
