import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import { colorModel } from "../models/response.model";
import type { ColorService } from "../services/color.service";

const colorBody = t.Object({
  color: t.String({ minLength: 1 }),
  hex: t.String({ pattern: "^[0-9a-fA-F]{6}$" }),
  finishId: t.String({ minLength: 1 }),
  notes: t.Optional(t.String()),
  swatchImage: t.Optional(t.String({ minLength: 1 })),
});

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const ColorController = (service: ColorService) =>
  new Elysia({ prefix: "/colors" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set, administrator }) => {
        const data = await service.createColor(body, administrator.name);
        set.status = 201;
        return { data };
      },
      {
        body: colorBody,
        requirePermission: "color.create",
        csrf: true,
        response: { 201: dataEnvelope(colorModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listColors({ page, limit });
      },
      {
        query: listQuery,
        response: { 200: listEnvelope(colorModel), ...publicErrorResponses },
      },
    )
    .put(
      "/:id",
      async ({ params, body, administrator }) => {
        const data = await service.updateColor(
          params.id,
          body,
          administrator.name,
        );
        return { data };
      },
      {
        params: idParams,
        body: colorBody,
        requirePermission: "color.update",
        csrf: true,
        response: { 200: dataEnvelope(colorModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params, administrator }) => {
        await service.deleteColor(params.id, administrator.name);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "color.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
