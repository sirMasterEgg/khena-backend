import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  marketplaceImportResultModel,
  marketplaceOrderModel,
  marketplaceStatsModel,
} from "../models/response.model";
import type { MarketplaceService } from "../services/marketplace.service";

const isoDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const logBody = t.Object({
  marketplace: t.String({ minLength: 1, maxLength: 50 }),
  date: isoDate,
  orderId: t.String({ minLength: 1, maxLength: 50 }),
  buyerName: t.String({ minLength: 1, maxLength: 255 }),
  items: t.Array(
    t.Object({
      variantSku: t.String({ minLength: 1 }),
      quantity: t.Integer({ minimum: 1 }),
      revenue: t.Integer({ minimum: 0 }),
    }),
    { minItems: 1 },
  ),
});

const importBody = t.Object({
  file: t.File({ maxSize: 10 * 1024 * 1024 }),
});

const ordersQuery = t.Object({
  marketplace: t.Optional(t.String({ minLength: 1 })),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const MarketplaceController = (service: MarketplaceService) =>
  new Elysia({ prefix: "/marketplace" })
    .use(authPlugin)
    .use(csrfPlugin)
    // Registrasi sebelum "/orders" tidak masalah karena path-nya tidak
    // tumpang tindih, tapi tetap didaftarkan lebih dulu supaya konsisten
    // dengan pola "static path sebelum dynamic path" di controller lain.
    .get(
      "/template",
      () => {
        const csv = service.generateTemplateCsv();
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="marketplace-orders-template.csv"',
          },
        });
      },
      {
        requirePermission: "marketplace.read",
        // Respons teks (bukan JSON) → JANGAN pasang skema `response`.
      },
    )
    .get(
      "/stats",
      async () => {
        const data = await service.getStats();
        return { data };
      },
      {
        requirePermission: "marketplace.read",
        response: {
          200: dataEnvelope(marketplaceStatsModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/orders",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listOrders({
          marketplace: query.marketplace,
          page,
          limit,
        });
      },
      {
        query: ordersQuery,
        requirePermission: "marketplace.read",
        response: {
          200: listEnvelope(marketplaceOrderModel),
          ...errorResponses,
        },
      },
    )
    .delete(
      "/orders/:id",
      async ({ params }) => {
        await service.deleteOrder(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "marketplace.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    )
    .post(
      "/log",
      async ({ body, set }) => {
        const data = await service.logOrder(body);
        set.status = 201;
        return { data };
      },
      {
        body: logBody,
        requirePermission: "marketplace.create",
        csrf: true,
        response: {
          201: dataEnvelope(marketplaceOrderModel),
          ...errorResponses,
        },
      },
    )
    .post(
      "/import",
      async ({ body, set }) => {
        const csvText = await body.file.text();
        const data = await service.importCsv(csvText);
        set.status = 200;
        return { data };
      },
      {
        body: importBody,
        requirePermission: "marketplace.create",
        csrf: true,
        response: {
          200: dataEnvelope(marketplaceImportResultModel),
          ...errorResponses,
        },
      },
    );
