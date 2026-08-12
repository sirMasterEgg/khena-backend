import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import { departmentModel } from "../models/response.model";
import type { DepartmentService } from "../services/department.service";

export const DepartmentController = (service: DepartmentService) =>
  new Elysia({ prefix: "/departments" })
    .use(authPlugin)
    .use(csrfPlugin)
    .get("/", async () => await service.listDepartments(), {
      requirePermission: "department.read",
      response: {
        200: dataEnvelope(t.Array(departmentModel)),
        ...errorResponses,
      },
    });
