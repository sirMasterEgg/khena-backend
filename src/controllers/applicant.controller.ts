import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import { applicantModel } from "../models/response.model";
import type { ApplicantService } from "../services/applicant.service";

const listQuery = t.Object({
  job: t.Optional(t.String({ minLength: 1 })),
  department: t.Optional(t.String({ minLength: 1 })),
  employmentType: t.Optional(t.String({ minLength: 1 })),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const ApplicantController = (service: ApplicantService) =>
  new Elysia({ prefix: "/applicants" })
    .use(authPlugin)
    .use(csrfPlugin)
    .get(
      "/",
      async ({ query }) => {
        return await service.listApplicants({
          jobId: query.job,
          departmentId: query.department,
          employmentTypeId: query.employmentType,
          page: query.page ?? 1,
          limit: query.limit ?? 10,
        });
      },
      {
        query: listQuery,
        requirePermission: "applicant.read",
        response: { 200: listEnvelope(applicantModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteApplicant(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "applicant.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
