import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import { roomTypeModel } from "../models/response.model";
import type { RoomTypeService } from "../services/room-type.service";

const createRoomTypeBody = t.Object({
  roomType: t.String({ minLength: 1 }),
});

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const RoomTypeController = (service: RoomTypeService) =>
  new Elysia({ prefix: "/room-types" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createRoomType(body);
        set.status = 201;
        return { data };
      },
      {
        body: createRoomTypeBody,
        requirePermission: "roomType.create",
        csrf: true,
        response: { 201: dataEnvelope(roomTypeModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listRoomTypes({ page, limit });
      },
      {
        query: listQuery,
        response: {
          200: listEnvelope(roomTypeModel),
          ...publicErrorResponses,
        },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteRoomType(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "roomType.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
