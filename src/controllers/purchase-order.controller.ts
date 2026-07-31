import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  purchaseOrderDetailModel,
  purchaseOrderListItemModel,
  purchaseOrderModel,
  purchaseOrderStatsModel,
} from "../models/response.model";
import type { PurchaseOrderService } from "../services/purchase-order.service";

const isoDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const purchaseOrderItemBody = t.Object({
  detailProductId: t.String({ minLength: 1 }),
  quantity: t.Integer({ minimum: 1 }),
  unitCost: t.Integer({ minimum: 0 }),
});

const purchaseOrderBody = t.Object({
  supplierId: t.String({ minLength: 1 }),
  orderDate: isoDate,
  expectedDeliveryDate: t.Optional(isoDate),
  note: t.Optional(t.String()),
  products: t.Array(purchaseOrderItemBody, { minItems: 1 }),
});

// Draft boleh disimpan tanpa item; supplier dan orderDate tetap wajib.
const draftPurchaseOrderBody = t.Object({
  supplierId: t.String({ minLength: 1 }),
  orderDate: isoDate,
  expectedDeliveryDate: t.Optional(isoDate),
  note: t.Optional(t.String()),
  products: t.Optional(t.Array(purchaseOrderItemBody)),
});

const statusLiteral = t.Union([
  t.Literal("draft"),
  t.Literal("ordered"),
  t.Literal("received"),
  t.Literal("cancelled"),
]);

const updatePurchaseOrderBody = t.Partial(
  t.Object({
    supplierId: t.String({ minLength: 1 }),
    orderDate: isoDate,
    expectedDeliveryDate: t.Union([isoDate, t.Null()]),
    note: t.Union([t.String(), t.Null()]),
    status: statusLiteral,
    products: t.Array(purchaseOrderItemBody, { minItems: 1 }),
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(statusLiteral),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const PurchaseOrderController = (service: PurchaseOrderService) =>
  new Elysia({ prefix: "/purchase-orders" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createPurchaseOrder(body);
        set.status = 201;
        return { data };
      },
      {
        body: purchaseOrderBody,
        requirePermission: "purchaseOrder.create",
        csrf: true,
        response: { 201: dataEnvelope(purchaseOrderModel), ...errorResponses },
      },
    )
    // Registrasi sebelum "/:id" supaya "draft" tidak tertangkap param id.
    .post(
      "/draft",
      async ({ body, set }) => {
        const data = await service.createDraftPurchaseOrder(body);
        set.status = 201;
        return { data };
      },
      {
        body: draftPurchaseOrderBody,
        requirePermission: "purchaseOrder.create",
        csrf: true,
        response: { 201: dataEnvelope(purchaseOrderModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listPurchaseOrders({
          search: query.search,
          status: query.status,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        requirePermission: "purchaseOrder.read",
        response: {
          200: listEnvelope(purchaseOrderListItemModel),
          ...errorResponses,
        },
      },
    )
    // Registrasi sebelum "/:id" supaya "stats" tidak tertangkap param id.
    .get(
      "/stats",
      async () => {
        const data = await service.getPurchaseOrderStats();
        return { data };
      },
      {
        requirePermission: "purchaseOrder.read",
        response: {
          200: dataEnvelope(purchaseOrderStatsModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getPurchaseOrderDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "purchaseOrder.read",
        response: {
          200: dataEnvelope(purchaseOrderDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updatePurchaseOrder(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updatePurchaseOrderBody,
        requirePermission: "purchaseOrder.update",
        csrf: true,
        response: { 200: dataEnvelope(purchaseOrderModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deletePurchaseOrder(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "purchaseOrder.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
