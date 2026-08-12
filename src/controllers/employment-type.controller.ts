import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import { employmentTypeModel } from "../models/response.model";
import type { EmploymentTypeService } from "../services/employment-type.service";

export const EmploymentTypeController = (service: EmploymentTypeService) =>
  new Elysia({ prefix: "/employment-types" })
    .use(authPlugin)
    .use(csrfPlugin)
    .get("/", async () => await service.listEmploymentTypes(), {
      requirePermission: "employmentType.read",
      response: {
        200: dataEnvelope(t.Array(employmentTypeModel)),
        ...errorResponses,
      },
    });
