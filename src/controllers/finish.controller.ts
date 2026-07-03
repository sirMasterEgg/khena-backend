import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
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
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createFinish({
          finish: body.finish,
        });
        set.status = 201;
        return { data };
      },
      {
        body: createFinishBody,
        requirePermission: "finish.create",
        csrf: true,
      },
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
      { params: idParams, requirePermission: "finish.delete", csrf: true },
    );
