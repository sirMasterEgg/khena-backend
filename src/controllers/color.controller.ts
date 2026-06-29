import { Elysia, t } from "elysia";
import type { ColorService } from "../services/color.service";

const colorBody = t.Object({
  color: t.String({ minLength: 1 }),
  hex: t.String({ pattern: "^[0-9a-fA-F]{6}$" }),
  finish_id: t.String({ minLength: 1 }),
  notes: t.Optional(t.String()),
  swatch_image: t.Optional(t.String({ minLength: 1 })),
});

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const ColorController = (service: ColorService) =>
  new Elysia({ prefix: "/colors" })
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createColor({
          color: body.color,
          hex: body.hex,
          finishId: body.finish_id,
          notes: body.notes,
          swatchImage: body.swatch_image,
        });
        set.status = 201;
        return { data };
      },
      { body: colorBody },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listColors({ page, limit });
      },
      { query: listQuery },
    )
    .put(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateColor(params.id, {
          color: body.color,
          hex: body.hex,
          finishId: body.finish_id,
          notes: body.notes,
          swatchImage: body.swatch_image,
        });
        return { data };
      },
      { params: idParams, body: colorBody },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteColor(params.id);
        return { data: "OK" };
      },
      { params: idParams },
    );
