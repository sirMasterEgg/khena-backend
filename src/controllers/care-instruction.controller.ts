import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import { listEnvelope, publicErrorResponses } from "../models/api-schema";
import { careInstructionModel } from "../models/response.model";
import type { CareInstructionService } from "../services/care-instruction.service";

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

export const CareInstructionController = (service: CareInstructionService) =>
  new Elysia({ prefix: "/care-instructions" })
    .use(authPlugin)
    .use(csrfPlugin)
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listCareInstructions({ page, limit });
      },
      {
        query: listQuery,
        response: {
          200: listEnvelope(careInstructionModel),
          ...publicErrorResponses,
        },
      },
    );
