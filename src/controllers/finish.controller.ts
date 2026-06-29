import { Elysia, t } from "elysia";
import type { FinishService } from "../services/finish.service";

const createFinishBody = t.Object({
  finish: t.String({ minLength: 1 }),
});

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const FinishController = (service: FinishService) =>
  new Elysia({ prefix: "/finishes" })
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createFinish({
          finish: body.finish,
        });
        set.status = 201;
        return { data };
      },
      { body: createFinishBody },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listFinishes({ page, limit });
      },
      { query: listQuery },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteFinish(params.id);
        return { data: "OK" };
      },
      { params: idParams },
    );
