import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import { jobModel, jobSummaryModel } from "../models/response.model";
import type { JobService } from "../services/job.service";

const jobStatus = t.Union([
  t.Literal("open"),
  t.Literal("closed"),
  t.Literal("draft"),
]);

const createJobBody = t.Object({
  jobTitle: t.String({ minLength: 1, maxLength: 255 }),
  departmentId: t.String({ minLength: 1 }),
  location: t.String({ minLength: 1, maxLength: 255 }),
  employmentTypeId: t.String({ minLength: 1 }),
  status: jobStatus,
  roleDescription: t.String({ minLength: 1 }),
  requirements: t.String({ minLength: 1 }),
  benefits: t.Optional(t.String()),
});

// PATCH: semua opsional; hanya `benefits` yang boleh dikosongkan dengan null.
const updateJobBody = t.Partial(
  t.Object({
    jobTitle: t.String({ minLength: 1, maxLength: 255 }),
    departmentId: t.String({ minLength: 1 }),
    location: t.String({ minLength: 1, maxLength: 255 }),
    employmentTypeId: t.String({ minLength: 1 }),
    status: jobStatus,
    roleDescription: t.String({ minLength: 1 }),
    requirements: t.String({ minLength: 1 }),
    benefits: t.Union([t.String(), t.Null()]),
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const JobController = (service: JobService) =>
  new Elysia({ prefix: "/jobs" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createJob(body);
        set.status = 201;
        return { data };
      },
      {
        body: createJobBody,
        requirePermission: "job.create",
        csrf: true,
        response: { 201: dataEnvelope(jobModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        return await service.listJobs({
          search: query.search,
          page: query.page ?? 1,
          limit: query.limit ?? 10,
        });
      },
      {
        query: listQuery,
        requirePermission: "job.read",
        response: { 200: listEnvelope(jobModel), ...errorResponses },
      },
    )
    .get(
      "/summary",
      async () => {
        return { data: await service.getJobSummary() };
      },
      {
        requirePermission: "job.read",
        response: { 200: dataEnvelope(jobSummaryModel), ...errorResponses },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        return { data: await service.getJobDetail(params.id) };
      },
      {
        params: idParams,
        requirePermission: "job.read",
        response: { 200: dataEnvelope(jobModel), ...errorResponses },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        return { data: await service.updateJob(params.id, body) };
      },
      {
        params: idParams,
        body: updateJobBody,
        requirePermission: "job.update",
        csrf: true,
        response: { 200: dataEnvelope(jobModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteJob(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "job.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
