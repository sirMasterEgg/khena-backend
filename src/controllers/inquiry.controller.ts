import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import { inquiryModel } from "../models/response.model";
import type { InquiryService } from "../services/inquiry.service";

const listQuery = t.Object({
  read: t.Optional(t.BooleanString()),
  starred: t.Optional(t.BooleanString()),
  replied: t.Optional(t.BooleanString()),
  search: t.Optional(t.String({ minLength: 1 })),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const InquiryController = (service: InquiryService) =>
  new Elysia({ prefix: "/inquiries" })
    .use(authPlugin)
    .use(csrfPlugin)
    .get(
      "/",
      async ({ query }) => {
        return await service.listInquiries({
          read: query.read,
          starred: query.starred,
          replied: query.replied,
          search: query.search,
          page: query.page ?? 1,
          limit: query.limit ?? 10,
        });
      },
      {
        query: listQuery,
        requirePermission: "inquiry.read",
        response: { 200: listEnvelope(inquiryModel), ...errorResponses },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getInquiry(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "inquiry.read",
        response: { 200: dataEnvelope(inquiryModel), ...errorResponses },
      },
    )
    .post(
      "/:id/read",
      async ({ params }) => {
        const data = await service.markAsRead(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "inquiry.update",
        csrf: true,
        response: { 200: dataEnvelope(inquiryModel), ...errorResponses },
      },
    )
    .post(
      "/:id/star",
      async ({ params }) => {
        const data = await service.toggleStar(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "inquiry.update",
        csrf: true,
        response: { 200: dataEnvelope(inquiryModel), ...errorResponses },
      },
    )
    .post(
      "/:id/reply",
      async ({ params }) => {
        const data = await service.markAsReplied(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "inquiry.update",
        csrf: true,
        response: { 200: dataEnvelope(inquiryModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteInquiry(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "inquiry.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
