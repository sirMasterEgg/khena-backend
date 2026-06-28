import { Elysia, t } from "elysia";
import type { RoomTypeService } from "../services/room-type.service";

const createRoomTypeBody = t.Object({
  room_type: t.String({ minLength: 1 }),
});

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const RoomTypeController = (service: RoomTypeService) =>
  new Elysia({ prefix: "/room-types" })
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createRoomType({
          roomType: body.room_type,
        });
        set.status = 201;
        return { data };
      },
      { body: createRoomTypeBody },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listRoomTypes({ page, limit });
      },
      { query: listQuery },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteRoomType(params.id);
        return { data: "OK" };
      },
      { params: idParams },
    );
