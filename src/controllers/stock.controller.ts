import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  stockActivityItemModel,
  stockAdjustmentResultModel,
  stockBulkAdjustmentResultModel,
  stockReorderItemModel,
  stockStatsModel,
  stockVariantStatusModel,
} from "../models/response.model";
import type { StockService } from "../services/stock.service";

const adjustmentBody = t.Object({
  sku: t.String({ minLength: 1 }),
  adjustmentType: t.Union([t.Literal("increase"), t.Literal("decrease")]),
  quantity: t.Integer({ minimum: 1 }),
  reason: t.Optional(t.String()),
});

const bulkCsvBody = t.Object({
  file: t.File({ maxSize: 10 * 1024 * 1024 }),
});

const activityQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
  source: t.Optional(t.Union([t.Literal("ADJUSTMENT"), t.Literal("SYSTEM")])),
});

const reorderListQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
  status: t.Optional(
    t.Union([t.Literal("OUT_OF_STOCK"), t.Literal("RUNNING_LOW")]),
  ),
});

const skuParams = t.Object({ sku: t.String({ minLength: 1 }) });

export const StockController = (service: StockService) =>
  new Elysia({ prefix: "/stocks" })
    .use(authPlugin)
    .use(csrfPlugin)
    // Registrasi sebelum "/adjustments" supaya "bulk-adjustments/example"
    // tidak tertangkap route lain yang lebih umum.
    .get(
      "/bulk-adjustments/example",
      () => {
        const csv = service.generateExampleCsv();
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="stock-adjustments-example.csv"',
          },
        });
      },
      {
        requirePermission: "stock.read",
        // Respons teks (bukan JSON) → JANGAN pasang skema `response`.
      },
    )
    .post(
      "/bulk-adjustments",
      async ({ body, set }) => {
        const csvText = await body.file.text();
        const data = await service.bulkAdjustStock(csvText);
        set.status = 200;
        return { data };
      },
      {
        body: bulkCsvBody,
        requirePermission: "stock.create",
        csrf: true,
        response: {
          200: dataEnvelope(stockBulkAdjustmentResultModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/adjustments/activity",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listActivity({
          page,
          limit,
          source: query.source,
        });
      },
      {
        query: activityQuery,
        requirePermission: "stock.read",
        response: {
          200: listEnvelope(stockActivityItemModel),
          ...errorResponses,
        },
      },
    )
    .post(
      "/adjustments",
      async ({ body, set }) => {
        const data = await service.adjustStock(body);
        set.status = 201;
        return { data };
      },
      {
        body: adjustmentBody,
        requirePermission: "stock.create",
        csrf: true,
        response: {
          201: dataEnvelope(stockAdjustmentResultModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/stats",
      async () => {
        const data = await service.getStockStats();
        return { data };
      },
      {
        requirePermission: "stock.read",
        response: { 200: dataEnvelope(stockStatsModel), ...errorResponses },
      },
    )
    .get(
      "/reorder-list",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listReorderList({
          page,
          limit,
          status: query.status,
        });
      },
      {
        query: reorderListQuery,
        requirePermission: "stock.read",
        response: {
          200: listEnvelope(stockReorderItemModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:sku/status",
      async ({ params }) => {
        const data = await service.getVariantStatus(params.sku);
        return { data };
      },
      {
        params: skuParams,
        requirePermission: "stock.read",
        response: {
          200: dataEnvelope(stockVariantStatusModel),
          ...errorResponses,
        },
      },
    );
