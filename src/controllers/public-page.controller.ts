import { Elysia, t } from "elysia";
import { dataEnvelope, publicErrorResponses } from "../models/api-schema";
import { publicPageModel } from "../models/public-response.model";
import type { PublicPageService } from "../services/public-page.service";

// Catatan: query `page` di sini berarti NAMA halaman (mis. "home"), BUKAN
// nomor pagination — endpoint ini sengaja tidak berpaginasi (issue #98 §7.1).
const listQuery = t.Object({
  page: t.Optional(t.String()),
  section: t.Optional(t.String()),
});

export const PublicPageController = (service: PublicPageService) =>
  new Elysia({ prefix: "/pages" }).get(
    "/",
    async ({ query }) => {
      const data = await service.listPages({
        page: query.page,
        section: query.section,
      });
      return { data };
    },
    {
      query: listQuery,
      response: {
        200: dataEnvelope(t.Array(publicPageModel)),
        ...publicErrorResponses,
      },
    },
  );
